import argparse
import json
import subprocess
import sys
from pathlib import Path


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("payload", type=Path)
    parser.add_argument("worker", type=Path)
    args = parser.parse_args()
    payload = args.payload.resolve()
    request = {"protocol_version": 1, "task_id": "bundle-inspect", "action": "inspect",
               "options": {"application_dir": str(payload), "tools": {}}}
    result = subprocess.run([str(args.worker.resolve())], input=json.dumps(request) + "\n",
                            capture_output=True, text=True, encoding="utf-8", timeout=90, check=True)
    events = [json.loads(line) for line in result.stdout.splitlines()]
    entries = next(event["params"]["tools"] for event in events if event["type"] == "result")
    tools = {}
    for entry in entries:
        if not entry["available"] or not Path(entry["path"]).is_relative_to(payload):
            raise RuntimeError(entry)
        tools[entry["key"]] = entry["path"]
        print(f"{entry['key']}: bundled executable verified", flush=True)
    config = payload.parent / "verified-tools.json"
    config.write_text(json.dumps(tools), encoding="utf-8")
    subprocess.run([sys.executable, str(Path(__file__).with_name("smoke_worker.py")),
                    "--tools", str(config), "--worker", str(args.worker.resolve())], check=True)


if __name__ == "__main__":
    main()
