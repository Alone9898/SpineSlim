import unittest
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]


class PackagingContractTests(unittest.TestCase):
    def test_runtime_window_icon_is_included_as_data(self):
        spec_text = (PROJECT_ROOT / "ResManage.spec").read_text(encoding="utf-8")

        self.assertRegex(
            spec_text,
            r"\(['\"]icon\.ico['\"],\s*['\"]\.['\"]\)",
            "icon.ico must be extracted at runtime so Tk can use it as the window icon",
        )

    def test_tk_window_uses_the_packaged_icon(self):
        main_text = (PROJECT_ROOT / "main.py").read_text(encoding="utf-8")

        self.assertIn('APP_ICON_FILE = os.path.join(RESOURCE_DIR, "icon.ico")', main_text)
        self.assertIn("root_ui.iconbitmap(APP_ICON_FILE)", main_text)

    def test_ffmpeg_is_included_as_a_runtime_binary(self):
        spec_text = (PROJECT_ROOT / "ResManage.spec").read_text(encoding="utf-8")

        self.assertRegex(
            spec_text,
            r"\(['\"]ffmpeg\.exe['\"],\s*['\"]\.['\"]\)",
            "ffmpeg.exe must be extracted at runtime for video conversion",
        )

    def test_release_name_is_version_1_4(self):
        spec_text = (PROJECT_ROOT / "ResManage.spec").read_text(encoding="utf-8")

        self.assertIn("name='ResManage-v1.4'", spec_text)


if __name__ == "__main__":
    unittest.main()
