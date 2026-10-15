import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any


@dataclass
class AtlasProcessResult:
    basis_skipped: int = 0
    converted: int = 0
    atlas_modified: int = 0


def _is_page_reference(line: str, extension: str) -> bool:
    stripped = line.strip()
    return (
        stripped.lower().endswith(extension)
        and " " not in stripped
        and ":" not in stripped
    )


def _page_reference_indices(lines: list[str]) -> set[int]:
    indices: set[int] = set()
    expect_page = True
    supported_extensions = (".png", ".basis", ".webp")

    for index, line in enumerate(lines):
        stripped = line.strip()
        if not stripped:
            expect_page = True
            continue
        if expect_page:
            if any(_is_page_reference(line, ext) for ext in supported_extensions):
                indices.add(index)
            expect_page = False

    return indices


def process_atlas_textures(folder: Path, converter: Any) -> AtlasProcessResult:
    folder = Path(folder)
    result = AtlasProcessResult()
    converted_textures: dict[Path, Path] = {}

    for atlas_path in folder.rglob("*.atlas"):
        lines = atlas_path.read_text(encoding="utf-8-sig").splitlines(keepends=True)
        page_indices = _page_reference_indices(lines)
        new_lines = list(lines)
        converted_pages: dict[Path, Path] = {}
        created_outputs: list[Path] = []
        changed = False
        try:
            for index, line in enumerate(lines):
                if index not in page_indices:
                    continue
                if not _is_page_reference(line, ".basis"):
                    if not _is_page_reference(line, ".png"):
                        continue

                    page_path = (atlas_path.parent / line.strip()).resolve()
                    if not page_path.is_file():
                        raise FileNotFoundError(f"Atlas PNG page missing: {page_path}")
                    output_path = converted_pages.get(page_path) or converted_textures.get(page_path)
                    if output_path is not None:
                        target_name = os.path.relpath(output_path, atlas_path.parent).replace("\\", "/")
                        new_lines[index] = line.replace(line.strip(), target_name)
                        changed = True
                        continue
                    expected_output = page_path.with_suffix(converter.get_output_ext())
                    output_existed = expected_output.exists()
                    output_path = Path(converter.convert(str(page_path)))
                    if not output_path.is_file() or output_path.stat().st_size == 0:
                        raise RuntimeError(
                            f"Texture conversion produced no output: {page_path}"
                        )
                    if not output_existed:
                        created_outputs.append(output_path)

                    target_name = os.path.relpath(output_path, atlas_path.parent).replace("\\", "/")
                    new_lines[index] = line.replace(line.strip(), target_name)
                    converted_pages[page_path] = output_path
                    result.converted += 1
                    changed = True
                    continue

                page_path = atlas_path.parent / line.strip()
                if not page_path.is_file() or page_path.stat().st_size == 0:
                    raise FileNotFoundError(f"Atlas Basis page missing: {page_path}")
                result.basis_skipped += 1
        except Exception:
            for output_path in created_outputs:
                output_path.unlink(missing_ok=True)
            raise

        if changed:
            temporary_atlas = atlas_path.with_name(atlas_path.name + ".tmp")
            try:
                temporary_atlas.write_text("".join(new_lines), encoding="utf-8")
                os.replace(temporary_atlas, atlas_path)
            finally:
                temporary_atlas.unlink(missing_ok=True)
            converted_textures.update(converted_pages)
            result.atlas_modified += 1

    for page_path, output_path in converted_textures.items():
        if page_path != output_path.resolve():
            page_path.unlink(missing_ok=True)

    return result
