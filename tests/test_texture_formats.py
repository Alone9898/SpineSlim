import tempfile
import unittest
from pathlib import Path

from spine_tools.atlas import process_atlas_textures
from spine_tools.textures import JpegConverter, PngConverter


class TextureFormatTests(unittest.TestCase):
    def test_original_mode_is_available_as_the_default_setting(self):
        import json

        config = json.loads((Path(__file__).parents[1] / "config.example.json").read_text(encoding="utf-8"))
        self.assertEqual(config["spine_texture_format"], "original")
        self.assertEqual(config["ui_texture_format"], "original")

    def test_png_keeps_original_if_compression_is_larger(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "hero.png"
            source.write_bytes(b"original")

            def runner(command, **kwargs):
                Path(command[-1]).write_bytes(b"larger-compressed-image")

            output = PngConverter("magick", runner=runner).convert(source)
            self.assertEqual(Path(output), source)
            self.assertEqual(source.read_bytes(), b"original")
            self.assertEqual(list(Path(directory).iterdir()), [source])

    def test_png_failure_preserves_input_and_removes_temporary_file(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "hero.png"
            source.write_bytes(b"original")

            def runner(command, **kwargs):
                Path(command[-1]).write_bytes(b"partial")
                raise RuntimeError("conversion failed")

            with self.assertRaisesRegex(RuntimeError, "conversion failed"):
                PngConverter("magick", runner=runner).convert(source)
            self.assertEqual(source.read_bytes(), b"original")
            self.assertEqual(list(Path(directory).iterdir()), [source])

    def test_shared_png_atlas_pages_remain_valid_after_in_place_compression(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "hero.png"
            source.write_bytes(b"original-long-image")
            for name in ("first.atlas", "second.atlas"):
                (root / name).write_text("hero.png\nsize: 16,16\n", encoding="utf-8")
            calls = []

            def runner(command, **kwargs):
                calls.append(command)
                Path(command[-1]).write_bytes(b"smaller")

            result = process_atlas_textures(root, PngConverter("magick", runner=runner))
            self.assertEqual(len(calls), 1)
            self.assertEqual(result.converted, 1)
            self.assertEqual(source.read_bytes(), b"smaller")
            for atlas in root.glob("*.atlas"):
                self.assertEqual(atlas.read_text(encoding="utf-8").splitlines()[0], "hero.png")

    def test_jpeg_updates_nested_reference_and_removes_png_after_success(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            textures = root / "textures"
            textures.mkdir()
            source = textures / "hero.png"
            source.write_bytes(b"png")
            atlas = root / "hero.atlas"
            atlas.write_text("textures/hero.png\nsize: 16,16\n", encoding="utf-8")
            calls = []

            def runner(command, **kwargs):
                calls.append(command)
                Path(command[-1]).write_bytes(b"jpeg")

            process_atlas_textures(root, JpegConverter("magick", 85, runner=runner))
            self.assertFalse(source.exists())
            self.assertTrue(source.with_suffix(".jpg").exists())
            self.assertIn("textures/hero.jpg", atlas.read_text(encoding="utf-8"))
            self.assertIn("white", calls[0])
            self.assertIn("85", calls[0])
