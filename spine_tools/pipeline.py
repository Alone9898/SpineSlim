import json
import os
import shutil
import tempfile
from pathlib import Path
from typing import Callable

from .clear_setup_pose import clear_setup_pose
from .converter import (
    TARGET_SPINE_VERSION,
    classify_spine_version,
    run_spine_converter,
)
from .models import BatchResult, FileProcessResult, PreparedSpineFile
from .validator import validate_spine_json


def collect_spine_copy_tasks(source: Path, output_directory: Path) -> list[tuple[str, str]]:
    source = Path(source).resolve()
    output_directory = Path(output_directory).resolve()
    if not source.is_dir():
        raise ValueError(f"Spine 源目录不存在: {source}")
    if source.is_relative_to(output_directory):
        raise ValueError("Spine 源目录不能位于待清理的 program/spine 输出目录内")
    tasks: list[tuple[str, str]] = []
    for root, directories, files in os.walk(source):
        root_path = Path(root).resolve()
        if root_path.is_relative_to(output_directory):
            directories.clear()
            continue
        directories[:] = [
            name for name in directories
            if not (root_path / name).resolve().is_relative_to(output_directory)
        ]
        tasks.extend((str(root), name) for name in files)
    return tasks


def copy_spine_file(source_path: Path, source_directory: Path, output_directory: Path) -> Path:
    source_path = Path(source_path).resolve()
    relative_path = source_path.relative_to(Path(source_directory).resolve())
    destination = Path(output_directory) / relative_path
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source_path, destination)
    return destination


def _read_json(path: Path) -> dict:
    with path.open("r", encoding="utf-8-sig") as file:
        return json.load(file)


def _create_temporary_json(path: Path) -> Path:
    handle = tempfile.NamedTemporaryFile(
        mode="w",
        encoding="utf-8",
        dir=path.parent,
        prefix=f".{path.stem}.",
        suffix=".tmp.json",
        delete=False,
    )
    temporary_path = Path(handle.name)
    handle.close()
    return temporary_path


def _collect_json_paths(directories: list[Path]) -> list[Path]:
    paths: list[Path] = []
    for directory in directories:
        paths.extend(
            path
            for path in Path(directory).rglob("*.json")
            if ".tmp." not in path.name and not path.name.endswith(".spine.bak")
        )
    return sorted(set(paths))


def preflight_spine_paths(paths: list[Path]) -> BatchResult:
    batch = BatchResult()
    for path in sorted(set(Path(path) for path in paths)):
        try:
            data = _read_json(path)
        except Exception as exc:
            batch.results.append(
                FileProcessResult(path=path, status="failed", error=str(exc))
            )
            continue

        skeleton = data.get("skeleton") if isinstance(data, dict) else None
        version = skeleton.get("spine") if isinstance(skeleton, dict) else None
        if not isinstance(version, str) or not version:
            batch.results.append(FileProcessResult(path=path, status="ignored"))
            continue

        classification = classify_spine_version(version)
        if classification == "unsupported":
            batch.results.append(
                FileProcessResult(
                    path=path,
                    status="unsupported",
                    input_version=version,
                    error=f"unsupported Spine version: {version}",
                )
            )
            continue

        validation = validate_spine_json(data)
        if not validation.success:
            batch.results.append(
                FileProcessResult(
                    path=path,
                    status="failed",
                    input_version=version,
                    error="invalid Spine JSON: " + ", ".join(validation.errors),
                )
            )
            continue

        batch.results.append(
            FileProcessResult(
                path=path,
                status="ready",
                input_version=version,
            )
        )

    return batch


def preflight_spine_directories(directories: list[Path]) -> BatchResult:
    return preflight_spine_paths(_collect_json_paths(directories))


def prepare_spine_json(
    source_path: Path,
    converter_executable: Path,
    *,
    converter_func: Callable = run_spine_converter,
) -> PreparedSpineFile:
    source_path = Path(source_path)
    data = _read_json(source_path)
    validation = validate_spine_json(data)
    if not validation.success:
        raise ValueError(f"invalid Spine JSON: {', '.join(validation.errors)}")

    input_version = str(data["skeleton"].get("spine", ""))
    classification = classify_spine_version(input_version)
    if classification == "unsupported":
        raise ValueError(f"unsupported Spine version: {input_version or '<missing>'}")

    temporary_path = _create_temporary_json(source_path)
    try:
        if classification == "upgrade":
            converter_func(converter_executable, source_path, temporary_path)
            status = "upgraded"
        else:
            shutil.copy2(source_path, temporary_path)
            status = "already_4_2"

        converted = _read_json(temporary_path)
        converted_validation = validate_spine_json(converted)
        if not converted_validation.success:
            raise ValueError(
                "invalid converted Spine JSON: "
                + ", ".join(converted_validation.errors)
            )

        output_version = str(converted["skeleton"].get("spine", ""))
        if classification == "upgrade" and output_version != TARGET_SPINE_VERSION:
            raise ValueError(
                f"unexpected converted Spine version: {output_version or '<missing>'}"
            )

        transform = clear_setup_pose(converted)
        transformed_validation = validate_spine_json(transform.data)
        if not transformed_validation.success:
            raise ValueError(
                "invalid transformed Spine JSON: "
                + ", ".join(transformed_validation.errors)
            )

        temporary_path.write_text(
            json.dumps(transform.data, ensure_ascii=False, separators=(",", ":")),
            encoding="utf-8",
        )

        return PreparedSpineFile(
            source_path=source_path,
            temporary_path=temporary_path,
            result=FileProcessResult(
                path=source_path,
                status=status,
                input_version=input_version,
                output_version=output_version,
                transform=transform,
            ),
        )
    except Exception:
        temporary_path.unlink(missing_ok=True)
        raise


def commit_prepared_files(prepared_files: list[PreparedSpineFile]) -> None:
    backup_pairs = [
        (
            prepared,
            prepared.source_path.with_name(
                prepared.source_path.name + ".spine.bak"
            ),
        )
        for prepared in prepared_files
    ]
    for prepared, backup_path in backup_pairs:
        if backup_path.exists():
            raise FileExistsError(f"backup already exists: {backup_path}")
        if not prepared.source_path.exists():
            raise FileNotFoundError(prepared.source_path)
        if not prepared.temporary_path.exists():
            raise FileNotFoundError(prepared.temporary_path)

    try:
        for prepared, backup_path in backup_pairs:
            os.replace(prepared.source_path, backup_path)
            os.replace(prepared.temporary_path, prepared.source_path)
    except Exception:
        for prepared, backup_path in reversed(backup_pairs):
            if backup_path.exists():
                os.replace(backup_path, prepared.source_path)
            prepared.temporary_path.unlink(missing_ok=True)
        raise

    for _, backup_path in backup_pairs:
        backup_path.unlink(missing_ok=True)


def process_spine_directories(
    directories: list[Path],
    converter_executable: Path,
    *,
    converter_func: Callable = run_spine_converter,
    progress_func: Callable | None = None,
) -> BatchResult:
    json_paths = _collect_json_paths(directories)

    batch = BatchResult()
    prepared_files: list[PreparedSpineFile] = []

    for index, path in enumerate(json_paths):
        if progress_func:
            progress_func(index, len(json_paths), path)
        try:
            data = _read_json(path)
        except Exception as exc:
            batch.results.append(
                FileProcessResult(path=path, status="failed", error=str(exc))
            )
            continue

        skeleton = data.get("skeleton") if isinstance(data, dict) else None
        version = skeleton.get("spine") if isinstance(skeleton, dict) else None
        if not isinstance(version, str) or not version:
            batch.results.append(FileProcessResult(path=path, status="ignored"))
            continue

        try:
            prepared = prepare_spine_json(
                path,
                converter_executable,
                converter_func=converter_func,
            )
            prepared_files.append(prepared)
            batch.results.append(prepared.result)
        except ValueError as exc:
            status = "unsupported" if "unsupported Spine version" in str(exc) else "failed"
            batch.results.append(
                FileProcessResult(
                    path=path,
                    status=status,
                    input_version=version,
                    error=str(exc),
                )
            )
        except Exception as exc:
            batch.results.append(
                FileProcessResult(
                    path=path,
                    status="failed",
                    input_version=version,
                    error=str(exc),
                )
            )

    if progress_func:
        progress_func(len(json_paths), len(json_paths), None)
    if batch.success:
        commit_prepared_files(prepared_files)
    else:
        for prepared in prepared_files:
            prepared.temporary_path.unlink(missing_ok=True)

    return batch
