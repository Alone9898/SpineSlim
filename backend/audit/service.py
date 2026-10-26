import time
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

from backend.service import Cancelled, ProcessingError

from .rules import RULES, RuleContext
from .scanner import scan_files

REPORT_VERSION = "1"


class AuditService:
    def __init__(self, options, emit, cancelled):
        self.options = options or {}
        self.emit = emit
        self.cancelled = cancelled

    def run(self):
        started = time.monotonic()
        root = self._resolve_root()
        self.emit("progress", "audit_scanning", processed=0)
        skipped = []
        entries = scan_files(root, self.cancelled, lambda count: self.emit("progress", "audit_scanning", processed=count),
                             lambda relative, reason: skipped.append((relative, reason)))
        context = RuleContext(root=root, entries=entries, options=self.options, cancelled=self.cancelled, unchecked=skipped)

        issues = []
        rule_status = []
        for index, audit_rule in enumerate(RULES, start=1):
            self.emit("progress", "audit_rule", rule_id=audit_rule.rule_id, index=index, total=len(RULES))
            try:
                found = audit_rule.run(context)
            except Cancelled:
                raise
            except Exception as error:
                rule_status.append({"ruleId": audit_rule.rule_id, "version": audit_rule.version,
                                    "status": "error", "coverage": audit_rule.coverage, "detail": type(error).__name__})
                continue
            issues.extend(found)
            rule_status.append({"ruleId": audit_rule.rule_id, "version": audit_rule.version,
                                "status": "issues" if found else "passed", "coverage": audit_rule.coverage})

        status = "partial" if any(item["status"] == "error" for item in rule_status) or context.unchecked else "completed"
        return {
            "version": REPORT_VERSION,
            "createdAt": datetime.now(timezone.utc).isoformat(),
            # Use the folder name only, so exported reports do not leak local absolute paths.
            "rootName": root.name,
            "totalFiles": len(entries),
            "totalSize": sum(entry.size for entry in entries),
            "stats": self._statistics(entries),
            "issues": [issue.to_report() for issue in issues],
            "rules": rule_status,
            "uncheckedFiles": [{"file": relative, "reason": reason} for relative, reason in context.unchecked],
            "durationMs": int((time.monotonic() - started) * 1000),
            "status": status,
        }

    def _resolve_root(self):
        source = self.options.get("source")
        if not source:
            raise ProcessingError("invalid_paths")
        root = Path(source).resolve()
        if not root.is_dir():
            raise ProcessingError("invalid_paths")
        return root

    @staticmethod
    def _statistics(entries):
        by_extension = Counter(entry.extension or "(none)" for entry in entries)
        size_by_extension = Counter()
        for entry in entries:
            size_by_extension[entry.extension or "(none)"] += entry.size
        return {
            "byExtension": {key: {"count": by_extension[key], "size": size_by_extension[key]} for key in by_extension},
        }


def run_audit(options, emit, cancelled):
    return AuditService(options, emit, cancelled).run()
