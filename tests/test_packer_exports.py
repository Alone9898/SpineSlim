import io
import json
import plistlib
import posixpath
import re
import unittest
import zipfile
from pathlib import Path

from PIL import Image


ARTIFACT = Path(__file__).resolve().parents[1] / "output/packer-formats.zip"


@unittest.skipUnless(ARTIFACT.exists(), "Run tests/packer_formats_smoke.js first")
class PackerExportTests(unittest.TestCase):
    def setUp(self):
        self.archive = zipfile.ZipFile(ARTIFACT)
        self.addCleanup(self.archive.close)

    def test_cocos_plists_restore_trim_and_escape_names(self):
        count = 0
        for path in self.archive.namelist():
            if path.startswith("cocos/") and path.endswith(".plist"):
                data = plistlib.loads(self.archive.read(path))
                self.assertEqual(data["metadata"]["format"], 3)
                self.assertIn("cocos/" + data["metadata"]["textureFileName"], self.archive.namelist())
                for name, frame in data["frames"].items():
                    count += 1
                    self.assertIn("&", name)
                    self.assertEqual(frame["spriteSourceSize"], "{80,60}")
                    self.assertEqual(frame["spriteSize"], "{30,20}")
                    self.assertEqual(frame["spriteOffset"], "{-18,9}")
                    self.assertFalse(frame["textureRotated"])
        self.assertEqual(count, 5)

    def test_godot_resources_have_resolvable_textures_and_margins(self):
        resources = [path for path in self.archive.namelist() if path.endswith(".tres")]
        self.assertEqual(len(resources), 5)
        for path in resources:
            text = self.archive.read(path).decode()
            reference = json.loads(re.search(r'path=("(?:[^"\\]|\\.)*")', text).group(1))
            texture = posixpath.normpath(posixpath.join(posixpath.dirname(path), reference))
            self.assertIn(texture, self.archive.namelist())
            self.assertIn("margin = Rect2(7, 11, 50, 40)", text)
            region = [int(value) for value in re.search(r"region = Rect2\(([^)]+)\)", text).group(1).split(",")]
            with Image.open(io.BytesIO(self.archive.read(texture))) as image:
                self.assertLessEqual(region[0] + region[2], image.width)
                self.assertLessEqual(region[1] + region[3], image.height)

    def test_unity_uses_untrimmed_pixels_and_bottom_origin(self):
        data = json.loads(self.archive.read("unity/sample.spineslim.json"))
        self.assertEqual(data["pixelsPerUnit"], 50)
        self.assertEqual(sum(len(page["sprites"]) for page in data["pages"]), 5)
        self.assertIn("unity/Editor/SpineSlimAtlasImporter.cs", self.archive.namelist())
        for page in data["pages"]:
            with Image.open(io.BytesIO(self.archive.read("unity/" + page["image"]))) as image:
                self.assertEqual(image.size, (page["width"], page["height"]))
                for sprite in page["sprites"]:
                    self.assertEqual((sprite["width"], sprite["height"]), (40, 30))
                    top = page["height"] - sprite["y"] - sprite["height"]
                    self.assertGreaterEqual(top, 0)
                    crop = image.crop((sprite["x"], top, sprite["x"] + 40, top + 30)).convert("RGBA")
                    self.assertEqual(crop.getpixel((0, 0))[3], 0)
                    self.assertGreater(crop.getpixel((10, 10))[3], 0)

    def test_phaser_multiatlas_contains_all_frames(self):
        data = json.loads(self.archive.read("phaser/sample.phaser.json"))
        self.assertGreater(len(data["textures"]), 1)
        self.assertEqual(sum(len(page["frames"]) for page in data["textures"]), 5)
        for page in data["textures"]:
            self.assertIn("phaser/" + page["image"], self.archive.namelist())
            for frame in page["frames"]:
                self.assertEqual(frame["sourceSize"], {"w": 80, "h": 60})
                self.assertEqual(frame["spriteSourceSize"], {"x": 7, "y": 11, "w": 30, "h": 20})
                self.assertFalse(frame["rotated"])

    def test_format_selection_does_not_leak_other_metadata(self):
        for path in self.archive.namelist():
            if path.startswith("cocos/"):
                self.assertTrue(path.endswith((".png", ".plist", ".txt")), path)
            if path.startswith("spine/"):
                self.assertTrue(path.endswith((".png", ".atlas")), path)
            if path.startswith("pixi/"):
                self.assertTrue(path.endswith((".png", ".json")), path)


if __name__ == "__main__":
    unittest.main()
