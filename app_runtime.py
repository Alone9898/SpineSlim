import sys
from pathlib import Path


APP_VERSION = "1.1.0"


def get_application_directory() -> Path:
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parent
