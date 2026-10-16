import argparse
import hashlib
import json
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--tools", required=True, type=Path)
    parser.add_argument("--worker", type=Path)
    args = parser.parse_args()
    tools = json.loads(args.tools.read_text(encoding="utf-8-sig"))
    worker = [str(args.worker.resolve())] if args.worker else [sys.executable, "-m", "backend.worker"]
    with tempfile.TemporaryDirectory(prefix="spineslim-smoke-") as temporary:
        root = Path(temporary)
        source = root / "素材 source"
        source.mkdir()
        Image.new("RGBA", (16, 16), (60, 110, 220, 128)).save(source / "hero.png")
        (source / "hero.atlas").write_text("hero.png\nsize: 16,16\nformat: RGBA8888\nfilter: Linear,Linear\nrepeat: none\nhero\n  bounds: 0,0,16,16\n", encoding="utf-8")
        (source / "hero.json").write_text(json.dumps({"skeleton": {"spine": "4.2.11"}, "bones": [{"name": "root"}], "slots": [], "skins": [], "animations": {}}))
        before = {path.name: hashlib.sha256(path.read_bytes()).hexdigest() for path in source.iterdir()}
        for mode, texture_format, force in [("spine", "original", False), ("spine", "webp", False), ("spine", "jpg", False), ("spine", "basis", False), ("ui", "original", True), ("ui", "webp", False)]:
            target = root / f"{mode}-{texture_format}-{force}"
            target.mkdir()
            request = {"protocol_version": 1, "task_id": target.name, "action": "start", "options": {
                "source": str(source), "target": str(target), "mode": mode, "format": texture_format, "force_bg": force, "tools": tools,
            }}
            result = subprocess.run(worker, input=json.dumps(request) + "\n", capture_output=True, text=True, encoding="utf-8", timeout=120)
            events = [json.loads(line) for line in result.stdout.splitlines()]
            if not events or events[-1]["params"].get("status") != "success":
                raise RuntimeError((target.name, events, result.stderr))
            assert any((target / "program").rglob("*"))
            print(target.name + ": passed", flush=True)
        after = {path.name: hashlib.sha256(path.read_bytes()).hexdigest() for path in source.iterdir()}
        assert before == after
        video_source = root / "video source"
        video_source.mkdir()
        subprocess.run([tools["ffmpeg"], "-v", "error", "-f", "lavfi", "-i", "color=c=blue:s=32x32:d=0.3", "-y", str(video_source / "sample.mp4")], check=True)
        target = root / "video-output"
        target.mkdir()
        request = {"protocol_version": 1, "task_id": "video", "action": "start", "options": {
            "source": str(video_source), "target": str(target), "mode": "video", "tools": tools,
        }}
        result = subprocess.run(worker, input=json.dumps(request) + "\n", capture_output=True, text=True, encoding="utf-8", timeout=120)
        events = [json.loads(line) for line in result.stdout.splitlines()]
        assert events[-1]["params"].get("status") == "success", events
        for platform in ("pc", "mobile"):
            assert (target / "program/video" / platform / "sample.webm").stat().st_size > 0
        print("video + source hashes: passed", flush=True)


if __name__ == "__main__":
    main()
