import unittest
from tempfile import TemporaryDirectory
from pathlib import Path

from spine_tools.atlas import process_atlas_textures


class BasisRoutingTests(unittest.TestCase):
    def test_shared_png_is_converted_once_and_all_atlases_are_updated(self):
        with TemporaryDirectory() as temporary_dir:
            runtime_dir = Path(temporary_dir)
            png_path = runtime_dir / "tubiao.png"
            png_path.write_bytes(b"shared-png")
            atlas_paths = [runtime_dir / name for name in ("first.atlas", "second.atlas")]
            for atlas_path in atlas_paths:
                atlas_path.write_text("tubiao.png\nsize: 16,16\n", encoding="utf-8")
            calls = []

            class SuccessfulConverter:
                def convert(self, path):
                    calls.append(path)
                    output = Path(path).with_suffix(".webp")
                    output.write_bytes(b"converted")
                    return str(output)

                def get_output_ext(self):
                    return ".webp"

            result = process_atlas_textures(runtime_dir, SuccessfulConverter())

            self.assertEqual(len(calls), 1)
            self.assertEqual(result.converted, 1)
            self.assertEqual(result.atlas_modified, 2)
            self.assertFalse(png_path.exists())
            self.assertTrue(png_path.with_suffix(".webp").is_file())
            for atlas_path in atlas_paths:
                self.assertIn("tubiao.webp", atlas_path.read_text(encoding="utf-8"))

    def test_later_atlas_failure_preserves_shared_png_for_unmodified_atlas(self):
        with TemporaryDirectory() as temporary_dir:
            runtime_dir = Path(temporary_dir)
            png_path = runtime_dir / "tubiao.png"
            png_path.write_bytes(b"shared-png")
            first_atlas = runtime_dir / "first.atlas"
            second_atlas = runtime_dir / "second.atlas"
            first_atlas.write_text("tubiao.png\nsize: 16,16\n", encoding="utf-8")
            original_second = "tubiao.png\nsize: 16,16\n\nmissing.png\nsize: 16,16\n"
            second_atlas.write_text(original_second, encoding="utf-8")

            class SuccessfulConverter:
                def convert(self, path):
                    output = Path(path).with_suffix(".webp")
                    output.write_bytes(b"converted")
                    return str(output)

                def get_output_ext(self):
                    return ".webp"

            with self.assertRaisesRegex(FileNotFoundError, "missing.png"):
                process_atlas_textures(runtime_dir, SuccessfulConverter())

            self.assertTrue(png_path.is_file())
            self.assertTrue(png_path.with_suffix(".webp").is_file())
            self.assertIn("tubiao.webp", first_atlas.read_text(encoding="utf-8"))
            self.assertEqual(second_atlas.read_text(encoding="utf-8"), original_second)

    def test_basis_page_skips_conversion_even_when_same_name_png_exists(self):
        runtime_dir = Path.cwd() / "tests" / "runtime_tmp"
        atlas_path = runtime_dir / "basis_test.atlas"
        basis_path = runtime_dir / "basis_test.basis"
        png_path = runtime_dir / "basis_test.png"
        for path in (atlas_path, basis_path, png_path):
            self.addCleanup(path.unlink, missing_ok=True)
        atlas_path.write_text(
            "basis_test.basis\nsize: 16,16\nformat: RGBA8888\n",
            encoding="utf-8",
        )
        basis_path.write_bytes(b"sB-valid-basis")
        png_path.write_bytes(b"stale-png")

        class ConverterMustNotRun:
            def convert(self, path):
                self.fail("converter should not run")

            def get_output_ext(self):
                return ".basis"

        result = process_atlas_textures(runtime_dir, ConverterMustNotRun())

        self.assertEqual(result.basis_skipped, 1)
        self.assertEqual(png_path.read_bytes(), b"stale-png")
        self.assertIn("basis_test.basis", atlas_path.read_text(encoding="utf-8"))

    def test_png_page_updates_atlas_only_after_successful_conversion(self):
        runtime_dir = Path.cwd() / "tests" / "runtime_tmp"
        atlas_path = runtime_dir / "png_test.atlas"
        png_path = runtime_dir / "png_test.png"
        basis_path = runtime_dir / "png_test.basis"
        for path in (atlas_path, png_path, basis_path):
            self.addCleanup(path.unlink, missing_ok=True)
        atlas_path.write_text(
            "png_test.png\nsize: 16,16\nformat: RGBA8888\n",
            encoding="utf-8",
        )
        png_path.write_bytes(b"png")

        class SuccessfulConverter:
            def convert(self, path):
                output = Path(path).with_suffix(".basis")
                output.write_bytes(b"sB-converted")
                return str(output)

            def get_output_ext(self):
                return ".basis"

        result = process_atlas_textures(runtime_dir, SuccessfulConverter())

        self.assertEqual(result.converted, 1)
        self.assertEqual(result.atlas_modified, 1)
        self.assertFalse(png_path.exists())
        self.assertTrue(basis_path.exists())
        self.assertIn("png_test.basis", atlas_path.read_text(encoding="utf-8"))

    def test_multi_page_failure_cleans_outputs_and_preserves_png_and_atlas(self):
        runtime_dir = Path.cwd() / "tests" / "runtime_tmp"
        atlas_path = runtime_dir / "multi_test.atlas"
        first_png = runtime_dir / "multi_first.png"
        second_png = runtime_dir / "multi_second.png"
        first_basis = runtime_dir / "multi_first.basis"
        for path in (atlas_path, first_png, second_png, first_basis):
            self.addCleanup(path.unlink, missing_ok=True)
        original_atlas = (
            "multi_first.png\nsize: 16,16\n\n"
            "multi_second.png\nsize: 16,16\n"
        )
        atlas_path.write_text(original_atlas, encoding="utf-8")
        first_png.write_bytes(b"first")
        second_png.write_bytes(b"second")

        class FailsOnSecondPage:
            def convert(self, path):
                path = Path(path)
                if path.name == "multi_second.png":
                    raise RuntimeError("injected texture failure")
                output = path.with_suffix(".basis")
                output.write_bytes(b"sB-first")
                return str(output)

            def get_output_ext(self):
                return ".basis"

        with self.assertRaisesRegex(RuntimeError, "injected texture failure"):
            process_atlas_textures(runtime_dir, FailsOnSecondPage())

        self.assertEqual(atlas_path.read_text(encoding="utf-8"), original_atlas)
        self.assertTrue(first_png.exists())
        self.assertTrue(second_png.exists())
        self.assertFalse(first_basis.exists())

    def test_region_name_ending_png_is_not_treated_as_texture_page(self):
        runtime_dir = Path.cwd() / "tests" / "runtime_tmp"
        atlas_path = runtime_dir / "region_test.atlas"
        png_path = runtime_dir / "region_test.png"
        basis_path = runtime_dir / "region_test.basis"
        for path in (atlas_path, png_path, basis_path):
            self.addCleanup(path.unlink, missing_ok=True)
        atlas_path.write_text(
            "region_test.png\n"
            "size: 16,16\n"
            "format: RGBA8888\n"
            "region-name.png\n"
            "  rotate: false\n"
            "  xy: 0,0\n",
            encoding="utf-8",
        )
        png_path.write_bytes(b"png")

        class SuccessfulConverter:
            def convert(self, path):
                output = Path(path).with_suffix(".basis")
                output.write_bytes(b"sB-converted")
                return str(output)

            def get_output_ext(self):
                return ".basis"

        result = process_atlas_textures(runtime_dir, SuccessfulConverter())

        self.assertEqual(result.converted, 1)
        text = atlas_path.read_text(encoding="utf-8")
        self.assertIn("region_test.basis", text)
        self.assertIn("region-name.png", text)
