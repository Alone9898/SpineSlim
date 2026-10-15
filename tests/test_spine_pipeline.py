import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from spine_tools.models import FileProcessResult, PreparedSpineFile
from spine_tools.pipeline import (
    collect_spine_copy_tasks,
    copy_spine_file,
    commit_prepared_files,
    preflight_spine_directories,
    prepare_spine_json,
    process_spine_directories,
)


class SpinePipelineTests(unittest.TestCase):
    def test_arbitrary_names_and_duplicate_basenames_preserve_relative_paths(self):
        with tempfile.TemporaryDirectory() as temporary_dir:
            source = Path(temporary_dir) / "任意素材"
            output = Path(temporary_dir) / "target" / "program" / "spine"
            inputs = {
                "root.json": b"root",
                "角色/hero.png": b"first",
                "角色/动画/hero.png": b"second",
                "特效/hero.atlas": b"atlas",
            }
            for relative_name, data in inputs.items():
                path = source / relative_name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(data)

            for root, name in collect_spine_copy_tasks(source, output):
                copy_spine_file(Path(root) / name, source, output)

            actual = {
                path.relative_to(output).as_posix(): path.read_bytes()
                for path in output.rglob("*") if path.is_file()
            }
            self.assertEqual(actual, inputs)
            self.assertTrue(all((source / name).read_bytes() == data for name, data in inputs.items()))

    def test_source_inside_output_is_rejected_before_files_change(self):
        with tempfile.TemporaryDirectory() as temporary_dir:
            output = Path(temporary_dir) / "program" / "spine"
            source = output / "角色"
            source.mkdir(parents=True)
            asset = source / "hero.png"
            asset.write_bytes(b"original")
            for invalid_source in (source, output):
                with self.subTest(source=invalid_source):
                    with self.assertRaisesRegex(ValueError, "源目录不能"):
                        collect_spine_copy_tasks(invalid_source, output)
            self.assertEqual(asset.read_bytes(), b"original")

    def test_copy_tasks_exclude_previous_output_inside_source(self):
        with tempfile.TemporaryDirectory() as temporary_dir:
            source = Path(temporary_dir)
            output = source / "program" / "spine"
            source_paths = [source / name / "hero.png" for name in ("mp0.7", "pc1.0")]
            output_paths = [output / name / "hero.png" for name in ("mobile", "pc")]
            for path in source_paths + output_paths:
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(b"png")

            tasks = collect_spine_copy_tasks(source, output)

            self.assertEqual({Path(root) / name for root, name in tasks}, set(source_paths))

    def test_copy_tasks_keep_pc_inputs_beside_output_directory(self):
        with tempfile.TemporaryDirectory() as temporary_dir:
            source = Path(temporary_dir)
            output = source / "program" / "spine"
            source_path = source / "program" / "spine-source" / "pc1.0" / "hero.png"
            source_path.parent.mkdir(parents=True)
            source_path.write_bytes(b"png")

            tasks = collect_spine_copy_tasks(source, output)

            self.assertEqual([Path(root) / name for root, name in tasks], [source_path])

    def test_prepares_upgraded_transformed_temp_without_replacing_original(self):
        runtime_dir = Path.cwd() / "tests" / "runtime_tmp"
        source_path = runtime_dir / "hero.json"
        self.addCleanup(source_path.unlink, missing_ok=True)
        source = {
            "skeleton": {"spine": "3.8.99"},
            "bones": [{"name": "root"}],
            "slots": [
                {"name": "face", "bone": "root", "attachment": "smile"}
            ],
            "skins": [],
            "animations": {"idle": {}},
        }
        source_path.write_text(json.dumps(source), encoding="utf-8")

        def fake_converter(executable, input_path, output_path):
            converted = json.loads(input_path.read_text(encoding="utf-8"))
            converted["skeleton"]["spine"] = "4.2.11"
            output_path.write_text(json.dumps(converted), encoding="utf-8")

        prepared = prepare_spine_json(
            source_path,
            Path("converter.exe"),
            converter_func=fake_converter,
        )
        self.addCleanup(prepared.temporary_path.unlink, missing_ok=True)

        original = json.loads(source_path.read_text(encoding="utf-8"))
        staged = json.loads(prepared.temporary_path.read_text(encoding="utf-8"))
        self.assertEqual(original["skeleton"]["spine"], "3.8.99")
        self.assertEqual(staged["skeleton"]["spine"], "4.2.11")
        self.assertNotIn("attachment", staged["slots"][0])
        self.assertEqual(prepared.result.status, "upgraded")

    def test_commit_replaces_original_and_removes_backup(self):
        runtime_dir = Path.cwd() / "tests" / "runtime_tmp"
        source_path = runtime_dir / "commit.json"
        temporary_path = runtime_dir / "commit.tmp.json"
        backup_path = runtime_dir / "commit.json.spine.bak"
        for path in (source_path, temporary_path, backup_path):
            self.addCleanup(path.unlink, missing_ok=True)
        source_path.write_text('{"state":"old"}', encoding="utf-8")
        temporary_path.write_text('{"state":"new"}', encoding="utf-8")
        prepared = PreparedSpineFile(
            source_path=source_path,
            temporary_path=temporary_path,
            result=FileProcessResult(path=source_path, status="upgraded"),
        )

        commit_prepared_files([prepared])

        self.assertEqual(source_path.read_text(encoding="utf-8"), '{"state":"new"}')
        self.assertFalse(temporary_path.exists())
        self.assertFalse(backup_path.exists())

    def test_commit_rolls_back_all_files_when_later_replace_fails(self):
        runtime_dir = Path.cwd() / "tests" / "runtime_tmp"
        paths = {
            "first": runtime_dir / "first.json",
            "first_tmp": runtime_dir / "first.tmp.json",
            "second": runtime_dir / "second.json",
            "second_tmp": runtime_dir / "second.tmp.json",
        }
        backup_paths = [
            runtime_dir / "first.json.spine.bak",
            runtime_dir / "second.json.spine.bak",
        ]
        for path in (*paths.values(), *backup_paths):
            self.addCleanup(path.unlink, missing_ok=True)
        paths["first"].write_text("first-old", encoding="utf-8")
        paths["first_tmp"].write_text("first-new", encoding="utf-8")
        paths["second"].write_text("second-old", encoding="utf-8")
        paths["second_tmp"].write_text("second-new", encoding="utf-8")
        prepared = [
            PreparedSpineFile(
                paths["first"],
                paths["first_tmp"],
                FileProcessResult(paths["first"], "upgraded"),
            ),
            PreparedSpineFile(
                paths["second"],
                paths["second_tmp"],
                FileProcessResult(paths["second"], "upgraded"),
            ),
        ]
        real_replace = os.replace
        call_count = 0

        def fail_on_second_commit(source, destination):
            nonlocal call_count
            call_count += 1
            if call_count == 4:
                raise OSError("injected commit failure")
            real_replace(source, destination)

        with patch("spine_tools.pipeline.os.replace", side_effect=fail_on_second_commit):
            with self.assertRaisesRegex(OSError, "injected commit failure"):
                commit_prepared_files(prepared)

        self.assertEqual(paths["first"].read_text(encoding="utf-8"), "first-old")
        self.assertEqual(paths["second"].read_text(encoding="utf-8"), "second-old")
        self.assertTrue(all(not path.exists() for path in backup_paths))

    def test_batch_ignores_business_json_and_processes_spine_json(self):
        runtime_dir = Path.cwd() / "tests" / "runtime_tmp"
        business_path = runtime_dir / "batch_business.json"
        spine_path = runtime_dir / "batch_spine.json"
        for path in (business_path, spine_path):
            self.addCleanup(path.unlink, missing_ok=True)
        business_path.write_text('{"kind":"business"}', encoding="utf-8")
        spine_path.write_text(
            json.dumps(
                {
                    "skeleton": {"spine": "4.2.11"},
                    "bones": [{"name": "root"}],
                    "slots": [],
                    "skins": [],
                    "animations": {},
                }
            ),
            encoding="utf-8",
        )

        def converter_must_not_run(*args, **kwargs):
            self.fail("converter should not run for Spine 4.2")

        result = process_spine_directories(
            [runtime_dir],
            Path("converter.exe"),
            converter_func=converter_must_not_run,
        )

        self.assertEqual(result.scanned, 2)
        self.assertEqual(result.ignored, 1)
        self.assertEqual(result.already_4_2, 1)
        self.assertEqual(result.failed, 0)

    def test_preflight_reports_broken_json_without_modifying_it(self):
        runtime_dir = Path.cwd() / "tests" / "runtime_tmp"
        broken_path = runtime_dir / "preflight_broken.json"
        self.addCleanup(broken_path.unlink, missing_ok=True)
        original = "{broken"
        broken_path.write_text(original, encoding="utf-8")

        result = preflight_spine_directories([runtime_dir])

        self.assertEqual(result.failed, 1)
        self.assertFalse(result.success)
        self.assertEqual(broken_path.read_text(encoding="utf-8"), original)


if __name__ == "__main__":
    unittest.main()
