import json
import os
import subprocess
import sys
import tempfile
import threading
import unittest
from pathlib import Path
from unittest.mock import patch

from PIL import Image
from backend.fonts import build_font
from backend.service import Cancelled, ProcessingError, Service, collect_files, validate_paths


class WorkerTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.source = self.root / "源 素材"
        self.target = self.root / "输出"
        self.source.mkdir()
        self.target.mkdir()
        self.events = []

    def service(self, **options):
        return Service({"source": str(self.source), "target": str(self.target), **options},
                       lambda *args, **kwargs: self.events.append((args, kwargs)))

    def run_service(self, service):
        with patch("backend.service.inspect_tools", return_value={"imagemagick": sys.executable}), \
             patch.object(service, "inspect_required", return_value=[]):
            return service.process()

    def test_overlapping_paths_rejected_in_both_directions(self):
        nested = self.source / "nested"
        nested.mkdir()
        for source, target in ((self.source, self.source), (self.source, nested), (nested, self.source)):
            with self.assertRaises(ProcessingError) as error:
                validate_paths(str(source), str(target))
            self.assertEqual(error.exception.key, "overlapping_paths")

    def test_stage_reports_current_file_before_slow_work(self):
        service = self.service()
        items = service.stage("videos", [Path("first.mp4"), Path("second.mp4")])
        self.assertEqual(next(items), Path("first.mp4"))
        self.assertEqual(self.events[-1][1], {"completed": 0, "total": 2, "file": "first.mp4"})
        self.assertEqual(next(items), Path("second.mp4"))
        self.assertEqual(self.events[-1][1], {"completed": 1, "total": 2, "file": "second.mp4"})
        list(items)
        self.assertEqual(self.events[-1][1]["completed"], 2)

    def test_atlas_and_loose_textures_share_progress_total(self):
        for name in ("hero", "loose"):
            Image.new("RGBA", (4, 4)).save(self.source / f"{name}.png")
        (self.source / "hero.atlas").write_text("hero.png\nsize: 4,4\nformat: RGBA8888\n")
        service = self.service()
        with patch("backend.service.TextureConverter.convert", side_effect=lambda path: str(path)):
            self.run_service(service)
        events = [params for (kind, stage), params in self.events if kind == "progress" and stage == "textures"]
        self.assertEqual([event["completed"] for event in events], [0, 1, 1, 2])
        self.assertEqual({event["total"] for event in events}, {2})
        self.assertEqual(events[0]["file"], "hero.png")
        self.assertEqual(events[-1]["file"], "loose.png")

    def test_upgrade_reports_files_without_invoking_converter_for_4_2(self):
        for name in ("first", "second"):
            (self.source / f"{name}.json").write_text(json.dumps({
                "skeleton": {"spine": "4.2.11"}, "bones": [{"name": "root"}],
                "slots": [], "skins": [], "animations": {},
            }))
        service = self.service(upgrade=True)
        with patch("backend.service.inspect_tools", return_value={"imagemagick": sys.executable, "spine_converter": sys.executable}), \
             patch.object(service, "inspect_required", return_value=[]):
            service.process()
        events = [params for (kind, stage), params in self.events if kind == "progress" and stage == "upgrading"]
        self.assertEqual([event["completed"] for event in events], [0, 1, 2])
        self.assertEqual({event["total"] for event in events}, {2})

    def test_advanced_conversion_uses_separate_output_and_preserves_source(self):
        original = {"skeleton": {"spine": "4.2.11"}, "bones": [{"name": "root"}]}
        (self.source / "hero.json").write_text(json.dumps(original))
        (self.source / "notes.json").write_text('{"message": "keep"}')
        existing = self.target / "program/spine/keep.txt"
        existing.parent.mkdir(parents=True)
        existing.write_text("keep")
        service = self.service(mode="spine", spine_conversion_mode="advanced",
                               spine_target_version="3.8.99", spine_output_format="skel")

        def fake_converter(executable, input_path, output_path, **kwargs):
            self.assertEqual(kwargs["target_version"], "3.8.99")
            output_path.write_bytes(b"converted")

        with patch("backend.service.inspect_tools", return_value={"imagemagick": sys.executable, "spine_converter": sys.executable}), \
             patch.object(service, "inspect_required", return_value=[]), \
             patch("backend.service.run_spine_converter", side_effect=fake_converter):
            result = service.process()

        self.assertEqual(result, self.target / "program/spine-converted")
        self.assertEqual((result / "hero.skel").read_bytes(), b"converted")
        self.assertFalse((result / "hero.json").exists())
        self.assertTrue((result / "notes.json").exists())
        self.assertEqual(existing.read_text(), "keep")
        self.assertEqual(json.loads((self.source / "hero.json").read_text()), original)

    def test_advanced_conversion_failure_preserves_previous_output(self):
        (self.source / "hero.skel").write_bytes(b"source")
        existing = self.target / "program/spine-converted/keep.txt"
        existing.parent.mkdir(parents=True)
        existing.write_text("keep")
        service = self.service(mode="spine", spine_conversion_mode="advanced",
                               spine_target_version="3.8.99", spine_output_format="json")
        with patch("backend.service.inspect_tools", return_value={"imagemagick": sys.executable, "spine_converter": sys.executable}), \
             patch.object(service, "inspect_required", return_value=[]), \
             patch("backend.service.run_spine_converter", side_effect=RuntimeError("conversion failed")):
            with self.assertRaisesRegex(RuntimeError, "conversion failed"):
                service.process()
        self.assertEqual(existing.read_text(), "keep")
        self.assertEqual((self.source / "hero.skel").read_bytes(), b"source")

    def test_advanced_conversion_rejects_colliding_output_names(self):
        (self.source / "hero.json").write_text('{"skeleton": {"spine": "4.2.11"}}')
        (self.source / "hero.skel").write_bytes(b"source")
        service = self.service(mode="spine", spine_conversion_mode="advanced",
                               spine_target_version="3.8.99", spine_output_format="json")
        with patch("backend.service.inspect_tools", return_value={"imagemagick": sys.executable, "spine_converter": sys.executable}), \
             patch.object(service, "inspect_required", return_value=[]):
            with self.assertRaises(ProcessingError) as error:
                service.process()
        self.assertEqual(error.exception.key, "collision")
        self.assertFalse((self.target / "program").exists())

    def test_advanced_conversion_rejects_invalid_target_before_output(self):
        (self.source / "hero.skel").write_bytes(b"source")
        with self.assertRaises(ProcessingError) as error:
            self.service(mode="spine", spine_conversion_mode="advanced",
                         spine_target_version="4.3.0").process()
        self.assertEqual(error.exception.key, "invalid_spine_version")
        self.assertFalse((self.target / "program").exists())

    def test_file_collection_rejects_links(self):
        actual = self.source / "actual.txt"
        actual.write_text("data")
        try:
            (self.source / "linked.txt").symlink_to(actual)
        except OSError:
            self.skipTest("Creating symbolic links is not permitted")
        with self.assertRaises(ProcessingError):
            collect_files(self.source)

    def test_invalid_numeric_parameter_does_not_touch_output(self):
        sentinel = self.target / "keep.txt"
        sentinel.write_text("old")
        with self.assertRaises(ProcessingError):
            self.service(quality=101).process()
        self.assertEqual(sentinel.read_text(), "old")

    def test_original_copies_nested_assets_without_importing_gui(self):
        folder = self.source / "角色"
        folder.mkdir()
        (folder / "notes.txt").write_text("source")
        self.run_service(self.service())
        self.assertEqual((self.target / "program/spine/角色/notes.txt").read_text(), "source")
        self.assertEqual((folder / "notes.txt").read_text(), "source")
        self.assertNotIn("tkinter", sys.modules)

    def test_failure_keeps_previous_output(self):
        Image.new("RGBA", (4, 4)).save(self.source / "hero.png")
        old = self.target / "program/spine"
        old.mkdir(parents=True)
        (old / "old.txt").write_text("previous")
        service = self.service()
        with patch.object(service, "convert_image", side_effect=RuntimeError("tool failed")):
            with self.assertRaises(RuntimeError):
                self.run_service(service)
        self.assertEqual((old / "old.txt").read_text(), "previous")
        self.assertTrue((self.source / "hero.png").exists())
        self.assertFalse(list(self.target.glob(".spineslim-*")))

    def test_cancel_before_commit_keeps_previous_output(self):
        (self.source / "asset.txt").write_text("new")
        old = self.target / "program/spine"
        old.mkdir(parents=True)
        (old / "old.txt").write_text("old")
        service = self.service()
        service.cancelled.set()
        with self.assertRaises(Cancelled):
            self.run_service(service)
        self.assertEqual((old / "old.txt").read_text(), "old")

    def test_atlas_external_reference_rejected_before_tools(self):
        (self.root / "external.png").write_bytes(b"external")
        (self.source / "hero.atlas").write_text("../external.png\nsize: 1,1\n")
        with self.assertRaises(ProcessingError) as error:
            self.service().process()
        self.assertEqual(error.exception.key, "linked_path")

    def test_missing_texture_has_specific_error(self):
        (self.source / "hero.atlas").write_text("missing.png\nsize: 1,1\n")
        with self.assertRaises(ProcessingError) as error:
            self.service().process()
        self.assertEqual(error.exception.key, "missing_texture")

    def test_commit_ui_preserves_spine(self):
        program = self.target / "program"
        (program / "spine").mkdir(parents=True)
        (program / "spine/hero.txt").write_text("keep")
        (program / "old.txt").write_text("remove")
        staging = self.root / "stage"
        staging.mkdir()
        (staging / "new.txt").write_text("new")
        Service.commit(staging, program, "ui", self.root / "backup")
        self.assertEqual((program / "spine/hero.txt").read_text(), "keep")
        self.assertFalse((program / "old.txt").exists())
        self.assertTrue((program / "new.txt").exists())

    def test_commit_failure_rolls_back(self):
        program, staging = self.target / "program", self.root / "stage"
        program.mkdir()
        staging.mkdir()
        (program / "spine").mkdir()
        (program / "spine/old.txt").write_text("old")
        (staging / "spine").mkdir()
        (staging / "spine/new.txt").write_text("new")
        original_replace = os.replace
        def replace(source, target):
            if Path(source) == staging / "spine/new.txt":
                raise PermissionError("locked")
            return original_replace(source, target)
        with patch("backend.service.os.replace", side_effect=replace):
            with self.assertRaises(ProcessingError) as error:
                Service.commit(staging, program, "spine", self.root / "backup")
        self.assertEqual(error.exception.key, "output_locked")
        self.assertEqual((program / "spine/old.txt").read_text(), "old")

    def test_background_mode_does_not_require_texturepacker(self):
        Image.new("RGB", (5, 5)).save(self.source / "hero.jpg")
        result = self.run_service(self.service(mode="ui", force_bg=True))
        self.assertTrue((result / "bg/hero.jpg").exists())

    def test_fonts_keep_alpha_pixels(self):
        source = self.source / "winnum"
        source.mkdir()
        Image.new("RGBA", (2, 3), (50, 60, 70, 128)).save(source / "winnum_1.png")
        build_font(source, self.target)
        with Image.open(self.target / "winnum.png") as image:
            self.assertEqual(image.getpixel((0, 0)), (50, 60, 70, 128))
        self.assertIn("char id=49", (self.target / "winnum.fnt").read_text())

    def test_tool_stdout_does_not_pollute_protocol(self):
        self.service().run([sys.executable, "-c", "print('hello')"])
        self.assertEqual(self.events[0][0], ("log", "raw_output"))
        self.assertIn("hello", self.events[0][1]["detail"])

    def test_tool_cancellation_terminates_process(self):
        service = self.service()
        timer = threading.Timer(0.3, service.cancelled.set)
        timer.start()
        try:
            with self.assertRaises(Cancelled):
                service.run([sys.executable, "-c", "import time; time.sleep(30)"])
        finally:
            timer.cancel()

    def test_worker_protocol_failure_is_single_terminal_event(self):
        result = subprocess.run([sys.executable, "-m", "backend.worker"], input=json.dumps({"protocol_version": 99, "task_id": "test"}) + "\n",
                                capture_output=True, text=True, encoding="utf-8", timeout=10)
        events = [json.loads(line) for line in result.stdout.splitlines()]
        self.assertEqual([event["type"] for event in events], ["error", "finished"])
        self.assertEqual(events[-1]["params"]["status"], "failed")
        self.assertEqual(events[-1]["task_id"], "test")


if __name__ == "__main__":
    unittest.main()
