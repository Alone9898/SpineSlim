import json
import tempfile
import threading
import unittest
from pathlib import Path

from PIL import Image

from backend.audit import run_audit
from backend.audit.atlas import parse_atlas_pages
from backend.service import Cancelled, ProcessingError


ATLAS = """hero.png
size: 64,64
filter: Linear,Linear
repeat: none
body
  rotate: false
  xy: 0, 0
  size: 32, 32
  orig: 32, 32
  offset: 0, 0
  index: -1

hero_missing.png
size: 32,32
filter: Linear,Linear
repeat: none
arm
  rotate: false
  xy: 0, 0
  size: 16, 16
  orig: 16, 16
  offset: 0, 0
  index: -1
"""


def run(root, options=None, cancelled=None):
    events = []
    report = run_audit({"source": str(root), **(options or {})}, lambda kind, key, **params: events.append((kind, key, params)),
                       cancelled or threading.Event())
    return report, events


def issues_for(report, rule_id):
    return [issue for issue in report["issues"] if issue["ruleId"] == rule_id]


class AtlasParsingTests(unittest.TestCase):
    def test_returns_only_page_names(self):
        self.assertEqual(parse_atlas_pages(ATLAS), ["hero.png", "hero_missing.png"])

    def test_page_without_size_line(self):
        atlas = "texture.webp\nfilter: Linear,Linear\nrepeat: none\nregion\n  rotate: false\n"
        self.assertEqual(parse_atlas_pages(atlas), ["texture.webp"])


class AuditRuleTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)

    def tearDown(self):
        self.temp.cleanup()

    def test_exact_duplicates_are_confirmed_by_hash(self):
        (self.root / "a.bin").write_bytes(b"same-content")
        (self.root / "b.bin").write_bytes(b"same-content")
        (self.root / "c.bin").write_bytes(b"other-bytes")

        report, _ = run(self.root)

        issues = issues_for(report, "R01")
        self.assertEqual(len(issues), 1)
        self.assertEqual(sorted(issues[0]["files"]), ["a.bin", "b.bin"])
        self.assertEqual(issues[0]["severity"], "warning")

    def test_same_size_different_content_is_not_duplicate(self):
        (self.root / "a.bin").write_bytes(b"aaaa")
        (self.root / "b.bin").write_bytes(b"bbbb")

        report, _ = run(self.root)

        self.assertEqual(issues_for(report, "R01"), [])

    def test_missing_atlas_page_is_critical(self):
        Image.new("RGBA", (64, 64)).save(self.root / "hero.png")
        (self.root / "hero.atlas").write_text(ATLAS, encoding="utf-8")

        report, _ = run(self.root)

        issues = issues_for(report, "R04")
        self.assertEqual(len(issues), 1)
        self.assertEqual(issues[0]["severity"], "critical")
        self.assertEqual(issues[0]["evidence"], ["missing page: hero_missing.png"])

    def test_atlas_pages_in_subfolder_resolve_relative_to_atlas(self):
        (self.root / "sprites").mkdir()
        Image.new("RGBA", (64, 64)).save(self.root / "sprites" / "hero.png")
        Image.new("RGBA", (32, 32)).save(self.root / "sprites" / "hero_missing.png")
        (self.root / "sprites" / "hero.atlas").write_text(ATLAS, encoding="utf-8")

        report, _ = run(self.root)

        self.assertEqual(issues_for(report, "R04"), [])

    def test_bmfont_and_gltf_missing_dependencies(self):
        (self.root / "font.fnt").write_text('page id=0 file="font.png"\n', encoding="utf-8")
        (self.root / "model.gltf").write_text(json.dumps({"buffers": [{"uri": "mesh.bin"}],
                                                          "images": [{"uri": "data:image/png;base64,AAAA"}]}), encoding="utf-8")

        report, _ = run(self.root)

        self.assertEqual(issues_for(report, "R10")[0]["evidence"], ["missing page: font.png"])
        self.assertEqual(issues_for(report, "R11")[0]["evidence"], ["missing dependency: mesh.bin"])

    def test_oversized_image_is_suggestion_with_threshold(self):
        Image.new("RGBA", (5000, 10)).save(self.root / "wide.png")

        report, _ = run(self.root, {"max_image_edge": 4096})

        issues = issues_for(report, "R05")
        self.assertEqual(issues[0]["severity"], "suggestion")
        self.assertEqual(issues[0]["evidence"], ["5000x10, limit 4096"])

    def test_transparent_padding_is_suggestion(self):
        image = Image.new("RGBA", (100, 100), (0, 0, 0, 0))
        image.paste((255, 0, 0, 255), (45, 45, 55, 55))
        image.save(self.root / "padded.png")

        report, _ = run(self.root)

        self.assertEqual(issues_for(report, "R06")[0]["files"], ["padded.png"])

    def test_signature_mismatch_is_warning(self):
        (self.root / "fake.glb").write_bytes(b"not-a-glb")

        report, _ = run(self.root)

        self.assertEqual(issues_for(report, "R13")[0]["severity"], "warning")

    def test_unreadable_image_is_unchecked_not_passed(self):
        (self.root / "broken.png").write_bytes(b"not a png")

        report, _ = run(self.root)

        self.assertEqual(issues_for(report, "R05"), [])
        self.assertIn({"file": "broken.png", "reason": "image_unreadable"}, report["uncheckedFiles"])
        self.assertEqual(report["status"], "partial")

    def test_file_size_threshold(self):
        (self.root / "big.bin").write_bytes(b"x" * 100)

        report, _ = run(self.root, {"max_file_bytes": 10})

        self.assertEqual(issues_for(report, "R07")[0]["files"], ["big.bin"])

    def test_naming_collision_and_special_characters(self):
        (self.root / "Hero.png").write_bytes(b"1")
        if (self.root / "hero.png").exists():
            self.skipTest("case-insensitive file system cannot hold case-only collisions")
        (self.root / "hero.png").write_bytes(b"2")
        (self.root / "my file #1.txt").write_bytes(b"3")

        report, _ = run(self.root)

        severities = {issue["title"]: issue["severity"] for issue in issues_for(report, "R08")}
        self.assertEqual(severities["Names differ only by case"], "warning")
        self.assertEqual(severities["File name contains spaces or special characters"], "suggestion")

    def test_spine_json_missing_sections_is_warning(self):
        (self.root / "hero.json").write_text(json.dumps({"skeleton": {"spine": "4.2"}}), encoding="utf-8")

        report, _ = run(self.root)

        issue = issues_for(report, "R09")[0]
        self.assertEqual(issue["severity"], "warning")
        self.assertIn("missing_bones", issue["evidence"])

    def test_plain_json_without_skeleton_is_ignored(self):
        (self.root / "config.json").write_text(json.dumps({"name": "x"}), encoding="utf-8")

        report, _ = run(self.root)

        self.assertEqual(issues_for(report, "R09"), [])


class AuditServiceTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)

    def tearDown(self):
        self.temp.cleanup()

    def test_report_uses_folder_name_not_absolute_path(self):
        (self.root / "a.txt").write_text("x", encoding="utf-8")

        report, _ = run(self.root)

        self.assertEqual(report["rootName"], self.root.name)
        self.assertNotIn(str(self.root), json.dumps(report))
        self.assertEqual(report["totalFiles"], 1)
        self.assertEqual(report["stats"]["byExtension"][".txt"]["count"], 1)
        self.assertEqual(report["status"], "completed")

    def test_every_rule_reports_status(self):
        (self.root / "a.txt").write_text("x", encoding="utf-8")

        report, _ = run(self.root)

        self.assertEqual({item["ruleId"] for item in report["rules"]}, {"R01", "R04", "R05", "R06", "R07", "R08", "R09", "R10", "R11", "R13"})

    def test_progress_events_are_emitted_from_real_work(self):
        (self.root / "a.txt").write_text("x", encoding="utf-8")

        _, events = run(self.root)

        self.assertIn(("progress", "audit_scanning", {"processed": 1}), events)
        self.assertIn(("progress", "audit_rule", {"rule_id": "R01", "index": 1, "total": 10}), events)

    def test_cancel_before_start_raises_cancelled(self):
        cancelled = threading.Event()
        cancelled.set()
        (self.root / "a.txt").write_text("x", encoding="utf-8")

        with self.assertRaises(Cancelled):
            run(self.root, cancelled=cancelled)

    def test_missing_source_is_processing_error(self):
        with self.assertRaises(ProcessingError) as raised:
            run_audit({"source": str(self.root / "nope")}, lambda *args, **params: None, threading.Event())

        self.assertEqual(raised.exception.key, "invalid_paths")


if __name__ == "__main__":
    unittest.main()
