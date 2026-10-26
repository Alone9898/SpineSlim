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


def scan_files(root, cancelled, on_progress=None, on_skip=None):
    """Walk root without following links. Returns sorted entries with POSIX relative paths."""
    root = Path(root)
    entries = []
    def report_error(error):
        if on_skip:
            relative = Path(error.filename).relative_to(root).as_posix() if error.filename else "."
            on_skip(relative, "directory_unreadable")

    for folder, directories, names in os.walk(root, onerror=report_error):
        if cancelled.is_set():
            raise Cancelled()
        # Do not descend into linked directories; they are reported as unchecked by the service.
        for name in list(directories):
            if (Path(folder) / name).is_symlink():
                directories.remove(name)
                if on_skip:
                    on_skip((Path(folder) / name).relative_to(root).as_posix(), "linked_directory")
        for name in names:
            path = Path(folder) / name
            if path.is_symlink():
                if on_skip:
                    on_skip(path.relative_to(root).as_posix(), "linked_file")
                continue
            try:
                if not path.is_file():
                    continue
                size = path.stat().st_size
            except OSError:
                if on_skip:
                    on_skip(path.relative_to(root).as_posix(), "file_unreadable")
                continue
            entries.append(Entry(
                path=path,
                relative=path.relative_to(root).as_posix(),
                extension=path.suffix.lower(),
                size=size,
            ))
            if on_progress:
                on_progress(len(entries))
    return sorted(entries, key=lambda entry: entry.relative)
