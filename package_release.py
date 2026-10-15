import hashlib
import importlib.metadata
import json
import platform
import shutil
import sys
import tkinter
import urllib.request
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

from app_runtime import APP_VERSION


ROOT = Path(__file__).resolve().parent


def package_release() -> None:
    if sys.platform != "win32" or platform.machine().lower() not in ("amd64", "x86_64"):
        raise RuntimeError("The release package requires Windows x64")
    name = f"SpineSlim-{APP_VERSION}-windows-x64"
    dist = ROOT / "dist"
    executable = dist / f"{name}.exe"
    if not executable.is_file():
        raise FileNotFoundError(executable)
    notices = ROOT / "build" / "release-licenses"
    notices.mkdir(parents=True, exist_ok=True)
    versions = {"Python": platform.python_version()}
    shutil.copy2(Path(sys.base_prefix) / "LICENSE.txt", notices / "Python-LICENSE.txt")
    tk_directory = Path(tkinter.__file__).resolve().parents[1] / ".." / "tcl" / "tk8.6"
    tk_license = tk_directory.resolve() / "license.terms"
    shutil.copy2(tk_license, notices / "Tk-LICENSE.txt")
    for package in ("Pillow", "tkinterdnd2", "PyInstaller"):
        distribution = importlib.metadata.distribution(package)
        versions[package] = distribution.version
        found = False
        for item in distribution.files or []:
            if ".dist-info/licenses/" in str(item).replace("\\", "/"):
                destination = notices / package / Path(*item.parts[item.parts.index("licenses") + 1:])
                destination.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(distribution.locate_file(item), destination)
                found = True
        if not found:
            raise RuntimeError(f"License files missing for {package}")
    license_urls = {
        "Tcl-LICENSE.txt": "https://raw.githubusercontent.com/tcltk/tcl/core-8-6-branch/license.terms",
        "tkdnd-LICENSE.txt": "https://raw.githubusercontent.com/petasis/tkdnd/master/license.terms",
    }
    for filename, url in license_urls.items():
        with urllib.request.urlopen(url, timeout=30) as response:
            (notices / filename).write_bytes(response.read())
    (notices / "versions.json").write_text(
        json.dumps(versions, indent=2) + "\n", encoding="utf-8"
    )
    (notices / "sources.json").write_text(
        json.dumps(license_urls, indent=2) + "\n", encoding="utf-8"
    )
    license_files = sorted(path for path in notices.rglob("*") if path.is_file())
    with ZipFile(dist / "licenses.zip", "w", ZIP_DEFLATED) as archive:
        for path in license_files:
            archive.write(path, Path("licenses") / path.relative_to(notices))
    with ZipFile(dist / f"{name}.zip", "w", ZIP_DEFLATED) as archive:
        archive.write(executable, Path(name) / executable.name)
        for filename in ("README.md", "README.zh-CN.md", "README.en-US.md", "LICENSE", "THIRD_PARTY.md", "RELEASE_NOTES.md", "config.example.json"):
            archive.write(ROOT / filename, Path(name) / filename)
        for filename in ("ui-zh.png", "ui-en.png"):
            archive.write(ROOT / "assets" / filename, Path(name) / "assets" / filename)
        for path in license_files:
            archive.write(path, Path(name) / "licenses" / path.relative_to(notices))
    assets = [executable, dist / f"{name}.zip", dist / "licenses.zip"]
    checksums = []
    for path in assets:
        with path.open("rb") as file:
            checksum = hashlib.file_digest(file, "sha256").hexdigest()
        checksums.append(f"{checksum}  {path.name}")
        print(f"{path.name}: {path.stat().st_size:,} bytes")
    (dist / "SHA256SUMS.txt").write_text("\n".join(checksums) + "\n", encoding="utf-8")


if __name__ == "__main__":
    package_release()
