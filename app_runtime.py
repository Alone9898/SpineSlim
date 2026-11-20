import sys
from pathlib import Path


APP_VERSION = "2.1.1-alpha.1"


def get_application_directory() -> Path:
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parent
