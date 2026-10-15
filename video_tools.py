import os
import subprocess
from pathlib import Path
from typing import Callable


VIDEO_EXTENSIONS = {".mov", ".mp4", ".m4v", ".webm", ".mkv", ".avi"}


def build_webm_command(
    ffmpeg_executable: Path,
    source_path: Path,
    output_path: Path,
    *,
    mobile: bool,
    preserve_alpha: bool,
    crf: int = 36,
) -> list[str]:
    command = [
        str(ffmpeg_executable),
        "-hide_banner",
        "-loglevel", "error",
        "-i", str(source_path),
        "-map", "0:v:0",
        "-map", "0:a?",
        "-c:v", "libvpx-vp9",
        "-crf", str(max(0, min(int(crf), 63))),
        "-b:v", "0",
    ]

    if mobile:
        # Half width and height means one quarter of the decoded pixel count.
        # Keep dimensions even because 4:2:0 formats require even dimensions.
        command.extend(["-vf", "scale=trunc(iw/4)*2:-2"])

    command.extend(["-pix_fmt", "yuva420p" if preserve_alpha else "yuv420p"])
    if preserve_alpha:
        command.extend(["-auto-alt-ref", "0"])

    command.extend([
        "-row-mt", "1",
        "-deadline", "good",
        "-cpu-used", "1",
        "-c:a", "libopus",
        "-b:a", "64k",
        "-y",
        str(output_path),
    ])
    return command


def convert_video_pair(
    ffmpeg_executable: Path,
    source_path: Path,
    pc_output: Path,
    mobile_output: Path,
    *,
    preserve_alpha: bool,
    crf: int = 36,
    runner: Callable = subprocess.run,
) -> None:
    ffmpeg_executable = Path(ffmpeg_executable)
    source_path = Path(source_path)
    pc_output = Path(pc_output)
    mobile_output = Path(mobile_output)

    if not ffmpeg_executable.is_file():
        raise FileNotFoundError(f"FFmpeg not found: {ffmpeg_executable}")

    pc_output.parent.mkdir(parents=True, exist_ok=True)
    mobile_output.parent.mkdir(parents=True, exist_ok=True)

    completed_outputs: list[Path] = []
    try:
        for output_path, mobile in ((pc_output, False), (mobile_output, True)):
            command = build_webm_command(
                ffmpeg_executable,
                source_path,
                output_path,
                mobile=mobile,
                preserve_alpha=preserve_alpha,
                crf=crf,
            )
            runner(
                command,
                check=True,
                creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
            )
            completed_outputs.append(output_path)
    except Exception:
        for output_path in completed_outputs + [pc_output, mobile_output]:
            try:
                if output_path.exists():
                    os.remove(output_path)
            except OSError:
                pass
        raise
