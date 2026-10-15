import os
import subprocess
from pathlib import Path
from typing import Callable


class PngConverter:
    def __init__(self, executable: str, runner: Callable = subprocess.run):
        self.executable = executable
        self.runner = runner

    def get_output_ext(self):
        return ".png"

    def convert(self, input_path):
        source = Path(input_path)
        output = source.with_suffix(".png")
        temporary = source.with_name(source.stem + ".compress.tmp.png")
        try:
            self.runner([
                self.executable, str(source),
                "-define", "png:compression-level=9",
                "-define", "png:compression-filter=5",
                "-define", "png:compression-strategy=1",
                str(temporary),
            ], check=True)
            if not temporary.is_file() or temporary.stat().st_size == 0:
                raise RuntimeError(f"PNG compression produced no output: {source}")
            if source.suffix.lower() != ".png" or temporary.stat().st_size < source.stat().st_size:
                os.replace(temporary, output)
            return str(output if source.suffix.lower() != ".png" else source)
        finally:
            temporary.unlink(missing_ok=True)


class JpegConverter:
    def __init__(self, executable: str, quality: int = 85, runner: Callable = subprocess.run):
        self.executable = executable
        self.quality = quality
        self.runner = runner

    def get_output_ext(self):
        return ".jpg"

    def convert(self, input_path):
        source = Path(input_path)
        output = source.with_suffix(".jpg")
        self.runner([
            self.executable, str(source),
            "-background", "white", "-alpha", "remove", "-alpha", "off",
            "-quality", str(self.quality), str(output),
        ], check=True)
        return str(output)
