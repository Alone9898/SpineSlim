from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


@dataclass
class ValidationResult:
    success: bool
    errors: list[str] = field(default_factory=list)


@dataclass
class TransformResult:
    data: dict[str, Any]
    setup_attachment_count: int = 0
    created_timeline_count: int = 0
    prepended_frame_count: int = 0
    preserved_time_zero_frame_count: int = 0


@dataclass
class FileProcessResult:
    path: Path
    status: str
    input_version: str = ""
    output_version: str = ""
    transform: TransformResult | None = None
    error: str = ""


@dataclass
class PreparedSpineFile:
    source_path: Path
    temporary_path: Path
    result: FileProcessResult


@dataclass
class BatchResult:
    results: list[FileProcessResult] = field(default_factory=list)

    @property
    def scanned(self) -> int:
        return len(self.results)

    def count(self, status: str) -> int:
        return sum(1 for result in self.results if result.status == status)

    @property
    def ignored(self) -> int:
        return self.count("ignored")

    @property
    def upgraded(self) -> int:
        return self.count("upgraded")

    @property
    def already_4_2(self) -> int:
        return self.count("already_4_2")

    @property
    def unsupported(self) -> int:
        return self.count("unsupported")

    @property
    def failed(self) -> int:
        return self.count("failed")

    @property
    def success(self) -> bool:
        return self.failed == 0 and self.unsupported == 0
