import os
from dataclasses import dataclass
from pathlib import Path

from backend.service import Cancelled


@dataclass(frozen=True)
class Entry:
    path: Path
    relative: str
    extension: str
    size: int


def scan_files(root, cancelled, on_progress=None):
    """Walk root without following links. Returns sorted entries with POSIX relative paths."""
    root = Path(root)
    entries = []
    for folder, directories, names in os.walk(root):
        if cancelled.is_set():
            raise Cancelled()
        # Do not descend into linked directories; they are reported as unchecked by the service.
        directories[:] = [name for name in directories if not (Path(folder) / name).is_symlink()]
        for name in names:
            path = Path(folder) / name
            if path.is_symlink() or not path.is_file():
                continue
            entries.append(Entry(
                path=path,
                relative=path.relative_to(root).as_posix(),
                extension=path.suffix.lower(),
                size=path.stat().st_size,
            ))
            if on_progress:
                on_progress(len(entries))
    return sorted(entries, key=lambda entry: entry.relative)
