import subprocess
import unittest
from pathlib import Path
from unittest.mock import patch

from video_tools import build_webm_command, convert_video_pair


class VideoToolsTests(unittest.TestCase):
    def test_transparent_mobile_command_uses_alpha_and_half_scale(self):
        command = build_webm_command(
            Path("ffmpeg.exe"),
            Path("input.mov"),
            Path("mobile/output.webm"),
            mobile=True,
            preserve_alpha=True,
        )

        self.assertIn("yuva420p", command)
        self.assertIn("scale=trunc(iw/4)*2:-2", command)
        self.assertIn("-auto-alt-ref", command)
        self.assertEqual(command[-1], str(Path("mobile/output.webm")))

    def test_pc_command_keeps_original_dimensions(self):
        command = build_webm_command(
            Path("ffmpeg.exe"),
            Path("input.mov"),
            Path("pc/output.webm"),
            mobile=False,
            preserve_alpha=False,
        )

        self.assertNotIn("-vf", command)
        self.assertIn("yuv420p", command)
        self.assertNotIn("-auto-alt-ref", command)

    def test_custom_crf_controls_video_quality(self):
        command = build_webm_command(
            Path("ffmpeg.exe"),
            Path("input.mov"),
            Path("output.webm"),
            mobile=False,
            preserve_alpha=True,
            crf=42,
        )

        self.assertEqual(command[command.index("-crf") + 1], "42")

    def test_failed_mobile_conversion_removes_both_outputs(self):
        ffmpeg = Path("ffmpeg.exe")
        source = Path("input.mov")
        pc_output = Path("pc/input.webm")
        mobile_output = Path("mobile/input.webm")
        calls = []

        def fake_runner(command, **_kwargs):
            calls.append(command)
            if len(calls) == 2:
                raise subprocess.CalledProcessError(1, command)

        with (
            patch("video_tools.Path.is_file", return_value=True),
            patch("video_tools.Path.mkdir"),
            patch("video_tools.Path.exists", return_value=True),
            patch("video_tools.os.remove") as remove,
        ):
            with self.assertRaises(subprocess.CalledProcessError):
                convert_video_pair(
                    ffmpeg,
                    source,
                    pc_output,
                    mobile_output,
                    preserve_alpha=True,
                    runner=fake_runner,
                )

        removed_paths = {Path(call.args[0]) for call in remove.call_args_list}
        self.assertIn(pc_output, removed_paths)
        self.assertIn(mobile_output, removed_paths)


if __name__ == "__main__":
    unittest.main()
