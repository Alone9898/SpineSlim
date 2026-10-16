import subprocess
import sys
from pathlib import Path


root = Path(__file__).resolve().parents[1]
target = subprocess.check_output(["rustc", "-vV"], text=True).split("host: ")[1].splitlines()[0]
subprocess.run([
    sys.executable, "-m", "PyInstaller", "--noconfirm", "--clean", "--onefile", "--console",
    "--name", f"spineslim-worker-{target}", "--paths", str(root),
    "--distpath", str(root / "src-tauri" / "binaries"),
    "--workpath", str(root / "build-worker"), "--specpath", str(root / "build-worker"),
    str(root / "backend" / "worker.py"),
], cwd=root, check=True)
