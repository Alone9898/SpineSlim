import subprocess
import re
from pathlib import Path
from typing import Callable


TARGET_SPINE_VERSION = "4.2.11"
SUPPORTED_SPINE_FAMILIES = {"3.5", "3.6", "3.7", "3.8", "4.0", "4.1", "4.2"}


def valid_target_version(version: str) -> bool:
    return bool(re.fullmatch(r"\d+\.\d+\.\d+", version)) and ".".join(version.split(".")[:2]) in SUPPORTED_SPINE_FAMILIES


class SpineConversionError(RuntimeError):
    pass


def check_spine_converter(
    executable: Path,
    *,
    runner: Callable = subprocess.run,
    timeout: int = 10,
) -> None:
    executable = Path(executable)
    if not executable.is_file():
        raise FileNotFoundError(f"Spine converter not found: {executable}")

    result = runner(
        [str(executable), "--help"],
        capture_output=True,
        text=True,
        timeout=timeout,
        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
    )
    if result.returncode != 0:
        detail = (result.stderr or result.stdout or "converter preflight failed").strip()
        raise SpineConversionError(
            f"converter preflight exited with code {result.returncode}: {detail}"
        )


def classify_spine_version(version: str) -> str:
    if version.startswith(("3.5.", "3.6.", "3.7.", "3.8.", "4.0.", "4.1.")):
        return "upgrade"
    if version.startswith("4.2."):
        return "already_4_2"
    return "unsupported"


def run_spine_converter(
    executable: Path,
    input_path: Path,
    output_path: Path,
    *,
    runner: Callable = subprocess.run,
    timeout: int = 60,
    target_version: str = TARGET_SPINE_VERSION,
) -> None:
    if not valid_target_version(target_version):
        raise SpineConversionError(f"unsupported target Spine version: {target_version}")
    command = [
        str(executable),
        str(input_path),
        str(output_path),
        "-v",
        target_version,
    ]
    result = runner(
        command,
        capture_output=True,
        text=True,
        timeout=timeout,
        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
    )
    if result.returncode != 0:
        detail = (result.stderr or result.stdout or "unknown converter error").strip()
        raise SpineConversionError(
            f"converter exited with code {result.returncode}: {detail}"
        )
