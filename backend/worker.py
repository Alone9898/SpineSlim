import json
import sys
import threading
from pathlib import Path

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from backend.service import Cancelled, ProcessingError, Service
from backend.audio import AudioService
from backend.audit import run_audit
from backend.providers import build_model_config, list_presets


def main():
    sys.stdin.reconfigure(encoding="utf-8")
    sys.stdout.reconfigure(encoding="utf-8")
    sequence = 0
    task_id = "invalid"
    lock = threading.Lock()
    cancelled = threading.Event()

    def emit(kind, key, **params):
        nonlocal sequence
        with lock:
            sequence += 1
            event = {"protocol_version": 1, "task_id": task_id, "sequence": sequence,
                     "type": kind, "message_key": key, "params": params}
            print(json.dumps(event, ensure_ascii=False), flush=True)

    try:
        request = json.loads(sys.stdin.readline())
        task_id = request.get("task_id", "invalid")
        if request.get("protocol_version") != 1 or not isinstance(task_id, str):
            raise ProcessingError("invalid_request")
        options = request.get("options", {})
        service = (AudioService if options.get('mode') == 'audio' else Service)(options, emit, cancelled)
        action = request.get("action")
        if action in ('audio_scan', 'audio_preview'):
            audio = AudioService(options, emit, cancelled)
            emit('result', action, **(audio.scan() if action == 'audio_scan' else audio.preview()))
            return
        if action == "providers":
            emit("result", "providers", providers=list_presets())
            return
        if action == "validate_model":
            try:
                emit("result", "validate_model", model=build_model_config(
                    options.get("provider", ""), options.get("model", ""),
                    base_url=options.get("base_url"), protocol=options.get("protocol")))
            except ValueError as error:
                raise ProcessingError(str(error))
            return
        if action == "inspect":
            emit("result", "tools", tools=service.inspect())
            return
        if action == "stats":
            emit("result", "stats", **service.statistics())
            return
        if action not in ("start", "audit"):
            raise ProcessingError("invalid_request")

        def read_control():
            for line in sys.stdin:
                try:
                    control = json.loads(line)
                    if control.get("task_id") == task_id and control.get("action") == "cancel":
                        cancelled.set()
                except ValueError:
                    continue

        threading.Thread(target=read_control, daemon=True).start()
        if action == "audit":
            emit("started", "audit_scanning")
            emit("result", "audit", report=run_audit(options, emit, cancelled))
            emit("finished", "success", status="success")
            return
        emit("started", "checking")
        output = service.process()
        emit("finished", "success", status="success", output=str(output))
    except Cancelled:
        emit("finished", "cancelled", status="cancelled")
    except ProcessingError as error:
        emit("error", error.key, **error.params)
        emit("finished", "failed", status="failed")
    except Exception as error:
        emit("error", "unexpected", detail=str(error))
        emit("finished", "failed", status="failed")


if __name__ == "__main__":
    main()
