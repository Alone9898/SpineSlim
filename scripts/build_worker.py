import subprocess
import sys
from pathlib import Path


def check_dependencies():
    missing = []
    for module in ("PIL", "tkinterdnd2"):
        try:
            __import__(module)
        except ImportError:
            missing.append(module)
    if missing:
        raise SystemExit(
            "Missing worker build dependencies: " + ", ".join(missing) +
            ". Install them with: python -m pip install -r requirements.txt"
        )


root = Path(__file__).resolve().parents[1]
check_dependencies()
target = subprocess.check_output(["rustc", "-vV"], text=True).split("host: ")[1].splitlines()[0]
subprocess.run([
    sys.executable, "-m", "PyInstaller", "--noconfirm", "--clean", "--onefile", "--console",
    "--name", f"spineslim-worker-{target}", "--paths", str(root),
    "--distpath", str(root / "src-tauri" / "binaries"),
    "--workpath", str(root / "build-worker"), "--specpath", str(root / "build-worker"),
    str(root / "backend" / "worker.py"),
], cwd=root, check=True)
