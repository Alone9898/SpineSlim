import hashlib
import json
from pathlib import Path
from urllib.request import urlopen


def main():
    root = Path(__file__).resolve().parents[1] / "output" / "viewer-fixtures"
    manifest = []
    for version in ("3.8", "4.0", "4.1", "4.2"):
        folder = root / version
        folder.mkdir(parents=True, exist_ok=True)
        for filename in ("spineboy-pro.json", "spineboy-pro.skel", "spineboy.atlas", "spineboy.png"):
            url = f"https://raw.githubusercontent.com/EsotericSoftware/spine-runtimes/{version}/examples/spineboy/export/{filename}"
            with urlopen(url, timeout=30) as response:
                content = response.read()
            (folder / filename).write_bytes(content)
            manifest.append({"path": f"{version}/{filename}", "url": url, "sha256": hashlib.sha256(content).hexdigest()})
    (root / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(f"Downloaded {len(manifest)} official fixtures to {root}; not bundled or committed.")


if __name__ == "__main__":
    main()
