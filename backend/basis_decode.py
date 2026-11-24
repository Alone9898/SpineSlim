import shutil
import subprocess
import tempfile
from pathlib import Path

from PIL import Image

from backend.service import ProcessingError

# basisu writes separate colour and alpha PNGs for RGBA32 transcodes.
COLOUR_SUFFIX = "_unpacked_rgb_RGBA32_0_0000.png"
ALPHA_SUFFIX = "_unpacked_a_RGBA32_0_0000.png"


def decode_basis(source, tool, output):
    """Decode a .basis texture to a PNG at `output` using the bundled basisu tool.

    The source is copied into a scratch folder first because basisu writes its
    results next to the input file, and the viewer must never write into the
    user's asset folder.
    """
    source = Path(source)
    output = Path(output)
    with tempfile.TemporaryDirectory(prefix="spineslim-basis-") as directory:
        work = Path(directory)
        staged = work / "input.basis"
        shutil.copy2(source, staged)
        try:
            subprocess.run([str(tool), "-unpack", "-no_ktx", str(staged)], cwd=work, capture_output=True,
                           timeout=120, check=True,
                           creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        except subprocess.CalledProcessError as error:
            raise ProcessingError("tool_failed", tool=Path(tool).name, code=error.returncode) from error
        except subprocess.TimeoutExpired as error:
            raise ProcessingError("tool_timeout", tool=Path(tool).name) from error
        colour = work / ("input" + COLOUR_SUFFIX)
        alpha = work / ("input" + ALPHA_SUFFIX)
        if not colour.is_file():
            raise ProcessingError("tool_failed", tool=Path(tool).name, code=0)
        with Image.open(colour) as colour_image:
            image = colour_image.convert("RGB")
        if alpha.is_file():
            with Image.open(alpha) as alpha_image:
                mask = alpha_image.convert("L")
            image = image.convert("RGBA")
            image.putalpha(mask)
        image.save(output, format="PNG")
    return {"output": str(output), "width": image.width, "height": image.height}
