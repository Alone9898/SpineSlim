import argparse
import hashlib
import json
import shutil
import subprocess
from pathlib import Path


EXTRA_LICENSES = ("FFMPEG-BUILD.txt", "FFMPEG-LICENSE.txt", "GPL-3.0.txt")


def main():
    parser = argparse.ArgumentParser(description="Prepare a Windows full-release installer from a verified local build.")
    parser.add_argument("--licenses-source", type=Path, required=True)
    args = parser.parse_args()

    root = Path(__file__).resolve().parents[1]
    version = json.loads((root / "src-tauri/tauri.conf.json").read_text(encoding="utf-8"))["version"]
    local_payload = root / "output/local-full/payload"
    if not (local_payload / "bundle-manifest.json").is_file():
        raise FileNotFoundError("Build and verify the local full package first")

    license_source = args.licenses_source.resolve()
    for name in EXTRA_LICENSES:
        if not (license_source / name).is_file():
            raise FileNotFoundError(license_source / name)

    release_dir = root / "output" / f"release-{version}"
    payload = release_dir / "payload"
    if not payload.resolve().is_relative_to((root / "output").resolve()):
        raise ValueError("Release payload must stay inside the output directory")
    release_dir.mkdir(parents=True, exist_ok=True)
    if payload.exists():
        shutil.rmtree(payload)
    shutil.copytree(local_payload, payload)
    (payload / "LOCAL-TEST-README.txt").unlink(missing_ok=True)
    for name in EXTRA_LICENSES:
        shutil.copy2(license_source / name, payload / "licenses" / name)
    (payload / "PACKAGE-README.txt").write_text(
        f"SpineSlim {version} - Windows x64 full package\n\n"
        "Includes the desktop app, Python worker, ImageMagick, Basis Universal, FFmpeg, "
        "TexturePacker, SpineSkeletonDataConverter and the WebView2 offline installer.\n"
        "包含桌面程序、后台及上述工具；不包含个人配置、素材或激活信息。\n\n"
        "Bundled tools retain their own license terms. TexturePacker may require a separately "
        "purchased license and activation. See THIRD_PARTY.md and licenses.\n"
        "工具文件不附送商业授权；TexturePacker 可能需要另行购买和激活。详见第三方说明。\n"
        "Keep the worker and tools directories beside the application.\n"
        "请保留安装目录内的 worker 与 tools 文件。\n",
        encoding="utf-8",
    )

    manifest = []
    resources = {}
    for path in sorted(payload.rglob("*")):
        if not path.is_file() or path.name == "bundle-manifest.json":
            continue
        with path.open("rb") as stream:
            digest = hashlib.file_digest(stream, "sha256").hexdigest()
        relative = path.relative_to(payload).as_posix()
        manifest.append({"path": relative, "bytes": path.stat().st_size, "sha256": digest})
        resources[str(path.resolve())] = relative
    manifest_path = payload / "bundle-manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    resources[str(manifest_path.resolve())] = "bundle-manifest.json"

    config = release_dir / "tauri-full.json"
    config.write_text(json.dumps({"bundle": {
        "resources": resources,
        "windows": {"webviewInstallMode": {"type": "offlineInstaller"}},
    }}, indent=2), encoding="utf-8")
    node = shutil.which("node")
    if not node:
        raise RuntimeError("Node.js is required to build the installer")
    subprocess.run([node, str(root / "node_modules/@tauri-apps/cli/tauri.js"),
                    "build", "--config", str(config)], cwd=root, check=True)

    installers = list((root / "src-tauri/target/release/bundle/nsis").glob(f"*{version}*setup.exe"))
    if len(installers) != 1:
        raise RuntimeError(f"Expected one installer, got {installers}")
    installer = release_dir / f"SpineSlim_{version}_windows-x64_full-setup.exe"
    temporary = installer.with_suffix(".exe.tmp")
    shutil.copy2(installers[0], temporary)
    temporary.replace(installer)
    sidecar = release_dir / f"SpineSlim_{version}_bundle-manifest.json"
    shutil.copy2(manifest_path, sidecar)
    checksums = []
    for path in (installer, sidecar):
        with path.open("rb") as stream:
            checksums.append(f"{hashlib.file_digest(stream, 'sha256').hexdigest()}  {path.name}")
    (release_dir / "SHA256SUMS.txt").write_text("\n".join(checksums) + "\n", encoding="utf-8")
    print(f"FULL_RELEASE_INSTALLER={installer}", flush=True)


if __name__ == "__main__":
    main()
