import argparse
import hashlib
import json
import shutil
import subprocess
import sys
from datetime import datetime
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description="Build a local Windows test installer with existing tools.")
    parser.add_argument("--tools-source", type=Path, required=True)
    parser.add_argument("--imagemagick", type=Path, required=True)
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    source = args.tools_source.resolve()
    required = [source / name for name in ("ffmpeg.exe", "basisu.exe", "SpineSkeletonDataConverter.exe")]
    required += [source / "TexturePacker/bin/TexturePacker.exe", args.imagemagick / "magick.exe"]
    for path in required:
        if not path.is_file():
            raise FileNotFoundError(path)
    folder = root / "output" / ("local-full-" + datetime.now().strftime("%Y%m%d-%H%M%S"))
    folder.mkdir(parents=True)
    payload = folder / "payload"
    tool_root = payload / "tools"
    for key, filename in (("ffmpeg", "ffmpeg.exe"), ("basis", "basisu.exe"), ("spine_converter", "SpineSkeletonDataConverter.exe")):
        target = tool_root / key
        target.mkdir(parents=True)
        shutil.copy2(source / filename, target / filename)
    for name in ("bin", "resources"):
        shutil.copytree(source / "TexturePacker" / name, tool_root / "texturepacker" / name,
                        ignore=shutil.ignore_patterns("*.lic", "*.key", "*.pem"))
    image_target = tool_root / "imagemagick"
    image_target.mkdir(parents=True)
    for path in args.imagemagick.iterdir():
        if path.is_file() and (path.suffix.lower() != ".exe" or path.name.lower() == "magick.exe"):
            shutil.copy2(path, image_target / path.name)
    shutil.copy2(root / "LICENSE", payload / "LICENSE")
    shutil.copy2(root / "THIRD_PARTY.md", payload / "THIRD_PARTY.md")
    shutil.copytree(root / "docs/licenses", payload / "licenses")
    (payload / "LOCAL-TEST-README.txt").write_text(
        "SpineSlim local full test package / 本地完整测试包\n\n"
        "Includes Python worker, ImageMagick, Basis Universal, FFmpeg, TexturePacker and SpineSkeletonDataConverter.\n"
        "包含以上工具及运行依赖；不包含个人配置、游戏素材或授权激活信息。\n"
        "TexturePacker may require separate activation on another computer.\n"
        "换电脑后 TexturePacker 仍可能需要合法授权及激活。\n"
        "Redistribution eligibility for all bundled tools has NOT been established. Local testing only.\n"
        "第三方工具再分发许可尚未完成确认，此包仅供本地测试，请勿公开发布。\n"
        "Settings are hidden in this production build. Bundled tools are detected automatically.\n",
        encoding="utf-8",
    )
    manifest = []
    for path in sorted(payload.rglob("*")):
        if path.is_file():
            with path.open("rb") as stream:
                digest = hashlib.file_digest(stream, "sha256").hexdigest()
            manifest.append({"path": path.relative_to(payload).as_posix(), "bytes": path.stat().st_size,
                             "sha256": digest})
    (payload / "bundle-manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    config = folder / "tauri-full.json"
    config.write_text(json.dumps({"bundle": {
        "resources": {str(path.resolve()): path.relative_to(payload).as_posix() for path in payload.rglob("*") if path.is_file()},
        "windows": {"webviewInstallMode": {"type": "offlineInstaller"}}
    }}, indent=2), encoding="utf-8")
    subprocess.run([sys.executable, str(root / "scripts/build_worker.py")], cwd=root, check=True)
    worker = root / "src-tauri/binaries/spineslim-worker-x86_64-pc-windows-msvc.exe"
    subprocess.run([sys.executable, str(root / "scripts/verify_local_full.py"), str(payload), str(worker)], cwd=root, check=True)
    npm = shutil.which("npm.cmd") or shutil.which("npm")
    subprocess.run([npm, "run", "tauri", "--", "build", "--config", str(config)], cwd=root, check=True)
    version = json.loads((root / "src-tauri/tauri.conf.json").read_text(encoding="utf-8"))["version"]
    installers = list((root / "src-tauri/target/release/bundle/nsis").glob(f"*{version}*setup.exe"))
    if len(installers) != 1:
        raise RuntimeError(f"Expected one installer, got {installers}")
    destination = folder / f"SpineSlim_{version}_windows-x64_local-full-setup.exe"
    shutil.copy2(installers[0], destination)
    print(f"LOCAL_FULL_INSTALLER={destination}", flush=True)


if __name__ == "__main__":
    main()
