import json
import os
import shutil
import subprocess
import tempfile
import threading
import time
from pathlib import Path

from PIL import Image
from spine_tools.atlas import process_atlas_textures, _page_reference_indices
from spine_tools.pipeline import preflight_spine_paths, process_spine_directories
from spine_tools.converter import run_spine_converter
from spine_tools.textures import PngConverter, JpegConverter
from tool_manager import TOOL_INFO, inspect_tools
from video_tools import VIDEO_EXTENSIONS, convert_video_pair


class ProcessingError(Exception):
    def __init__(self, key, **params):
        self.key = key
        self.params = params
        super().__init__(key)


class Cancelled(Exception):
    pass


def validate_paths(source, target):
    if not source or not target:
        raise ProcessingError("invalid_paths")
    source, target = Path(source).resolve(), Path(target).resolve()
    if not source.is_dir() or not target.is_dir():
        raise ProcessingError("invalid_paths")
    if source.is_relative_to(target) or target.is_relative_to(source):
        raise ProcessingError("overlapping_paths")
    return source, target


def collect_files(source):
    files = []
    for folder, directories, names in os.walk(source):
        for name in directories + names:
            path = Path(folder) / name
            if path.is_symlink() or (hasattr(path, "is_junction") and path.is_junction()):
                raise ProcessingError("linked_path", path=str(path))
        files.extend(Path(folder) / name for name in names)
    return sorted(files)


def copy_unique(source, folder):
    folder.mkdir(parents=True, exist_ok=True)
    destination = folder / source.name
    suffix = 1
    while destination.exists():
        destination = folder / f"{source.stem}_{suffix}{source.suffix}"
        suffix += 1
    shutil.copy2(source, destination)
    return destination


def replace_with_retry(source, destination, attempts=8):
    """Retry Windows antivirus/indexer locks during the atomic output swap."""
    last_error = None
    for attempt in range(attempts):
        try:
            os.replace(source, destination)
            return
        except PermissionError as error:
            last_error = error
            if attempt + 1 < attempts:
                time.sleep(0.2)
    raise last_error


class TextureConverter:
    def __init__(self, service):
        self.service = service
        self.mode = service.options.get("format", "original")

    def get_output_ext(self):
        return {"original": ".png", "png": ".png", "webp": ".webp", "jpg": ".jpg", "basis": ".basis"}[self.mode]

    def convert(self, path):
        service = self.service
        service.check_cancel()
        source = Path(path)
        output = source.with_suffix(self.get_output_ext())
        if output != source and output.exists():
            raise ProcessingError("collision", path=str(output))
        quality = service.options.get("quality", 50)
        if self.mode in ("original", "png"):
            return PngConverter(service.tools["imagemagick"], service.run).convert(path)
        if self.mode == "jpg":
            return JpegConverter(service.tools["imagemagick"], quality, service.run).convert(path)
        if self.mode == "basis":
            service.run([service.tools["basis"], "-q", "255", "-file", str(source), "-output_file", str(output)])
        else:
            service.run([service.tools["imagemagick"], str(source), "-quality", str(quality), "-define", "webp:method=6", str(output)])
        if not output.is_file() or not output.stat().st_size:
            raise ProcessingError("empty_output", path=str(output))
        return str(output)


class Service:
    def __init__(self, options, emit, cancelled=None):
        if not isinstance(options, dict):
            raise ProcessingError("invalid_request")
        self.options = options
        self.emit = emit
        self.cancelled = cancelled or threading.Event()
        self.tools = {}

    def check_cancel(self):
        if self.cancelled.is_set():
            raise Cancelled()

    def statistics(self):
        target = self.options.get("target")
        if not target or not Path(target).is_dir():
            raise ProcessingError("invalid_paths")
        program = Path(target).resolve() / "program"
        sizes = {key: 0 for key in ("spine", "bg", "atlas", "fonts", "part", "video", "other")}
        if program.exists():
            for path in collect_files(program):
                group = path.relative_to(program).parts[0]
                sizes[group if group in sizes else "other"] += path.stat().st_size
        return {"sizes": sizes, "total": sum(sizes.values())}

    def run(self, command, **kwargs):
        self.check_cancel()
        timeout = kwargs.get("timeout", 3600)
        start = time.monotonic()
        with tempfile.TemporaryFile() as output:
            process = subprocess.Popen([str(item) for item in command], stdout=output, stderr=output,
                                       creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
            try:
                while process.poll() is None:
                    self.check_cancel()
                    if time.monotonic() - start > timeout:
                        raise ProcessingError("tool_timeout", tool=Path(command[0]).name)
                    time.sleep(0.05)
                output.seek(0, 2)
                length = output.tell()
                output.seek(max(0, length - 16000))
                detail = output.read().decode("utf-8", errors="replace")
                if detail.strip():
                    self.emit("log", "raw_output", tool=Path(command[0]).name, detail=detail)
                self.check_cancel()
                if process.returncode:
                    raise ProcessingError("tool_failed", tool=Path(command[0]).name, code=process.returncode, detail=detail)
                return subprocess.CompletedProcess(command, process.returncode, detail, "")
            finally:
                if process.poll() is None:
                    if os.name == "nt":
                        subprocess.run(["taskkill", "/PID", str(process.pid), "/T", "/F"], capture_output=True,
                                       creationflags=subprocess.CREATE_NO_WINDOW)
                    else:
                        process.terminate()
                    process.wait(timeout=10)

    def inspect(self):
        paths = inspect_tools(self.options.get("application_dir", str(Path.cwd())), self.options.get("tools", {}))
        result = []
        flags = {"imagemagick": "-version", "basis": "-version", "texturepacker": "--version",
                 "spine_converter": "--help", "ffmpeg": "-version"}
        for key, path in paths.items():
            available, detail = False, ""
            if path:
                try:
                    self.run([path, flags[key]], timeout=8)
                    available = True
                except ProcessingError as error:
                    detail = error.key
                except OSError as error:
                    detail = str(error)
            result.append({"key": key, "name": TOOL_INFO[key][0], "path": path,
                           "available": available, "detail": detail, "url": TOOL_INFO[key][3]})
        return result

    def stage(self, stage, files):
        total = len(files)
        self.emit("stage", stage, completed=0, total=total)
        for index, item in enumerate(files):
            self.check_cancel()
            self.emit("progress", stage, completed=index, total=total, file=Path(item).name)
            yield item
            self.emit("progress", stage, completed=index + 1, total=total, file=Path(item).name)

    def process(self):
        mode = self.options.get("mode", "spine")
        texture_format = self.options.get("format", "original")
        if mode not in ("spine", "ui", "video") or texture_format not in ("original", "png", "webp", "jpg", "basis"):
            raise ProcessingError("invalid_request")
        for key, maximum, default in (("quality", 100, 50), ("crf", 63, 36)):
            value = self.options.get(key, default)
            if type(value) is not int or not 0 <= value <= maximum:
                raise ProcessingError("invalid_number", field=key)
        source, target = validate_paths(self.options.get("source"), self.options.get("target"))
        files = collect_files(source)
        if not files:
            raise ProcessingError("empty_source")
        if mode == "spine":
            for atlas in (path for path in files if path.suffix.lower() == ".atlas"):
                lines = atlas.read_text(encoding="utf-8-sig").splitlines()
                for index in _page_reference_indices(lines):
                    texture = (atlas.parent / lines[index].strip()).resolve()
                    if not texture.is_relative_to(source):
                        raise ProcessingError("linked_path", path=str(texture))
                    if not texture.is_file():
                        raise ProcessingError("missing_texture", path=str(texture))
        required = set()
        if mode != "video":
            required.add("basis" if texture_format == "basis" else "imagemagick")
        if mode == "spine" and self.options.get("upgrade"):
            required.add("spine_converter")
            result = preflight_spine_paths([path for path in files if path.suffix.lower() == ".json"])
            if not result.success:
                raise ProcessingError("invalid_spine", detail="; ".join(str(item.error) for item in result.results if item.error))
        if mode == "ui" and not self.options.get("force_bg"):
            required.add("texturepacker")
        if mode == "video" or (mode == "ui" and any(path.suffix.lower() in VIDEO_EXTENSIONS for path in files)):
            required.add("ffmpeg")
        self.tools = inspect_tools(self.options.get("application_dir", str(Path.cwd())), self.options.get("tools", {}))
        for key in required:
            if not self.tools.get(key):
                raise ProcessingError("missing_tool", tool=TOOL_INFO[key][0])
        for tool in self.inspect_required(required):
            if not tool["available"]:
                raise ProcessingError("missing_tool", tool=tool["name"])
        program = target / "program"
        if program.exists():
            if program.is_symlink() or (hasattr(program, "is_junction") and program.is_junction()):
                raise ProcessingError("linked_path", path=str(program))
            collect_files(program)
        with tempfile.TemporaryDirectory(prefix=".spineslim-", dir=target) as temporary:
            staging = Path(temporary) / "program"
            staging.mkdir()
            if mode == "spine":
                self.spine(source, files, staging / "spine")
            elif mode == "ui":
                self.ui(files, staging)
            else:
                if (program / "video").exists():
                    shutil.copytree(program / "video", staging / "video")
                    for platform in ("pc", "mobile"):
                        for path in (staging / "video" / platform).glob("*.webm"):
                            path.unlink()
                self.videos(files, staging / "video")
            self.check_cancel()
            self.emit("stage", "committing", completed=0, total=1)
            self.commit(staging, program, mode, Path(temporary) / "backup")
            self.emit("progress", "committing", completed=1, total=1)
        return program / mode if mode in ("spine", "video") else program

    def inspect_required(self, required):
        flags = {"imagemagick": "-version", "basis": "-version", "texturepacker": "--version",
                 "spine_converter": "--help", "ffmpeg": "-version"}
        for key in sorted(required):
            self.run([self.tools[key], flags[key]], timeout=8)
            yield {"name": TOOL_INFO[key][0], "available": True}

    @staticmethod
    def commit(staging, program, mode, backup):
        program.mkdir(exist_ok=True)
        backup.mkdir()
        names = {mode} if mode in ("spine", "video") else {path.name for path in program.iterdir() if path.name.lower() != "spine"} | {path.name for path in staging.iterdir()}
        saved, installed = [], []
        failed_move = None
        try:
            for name in sorted(names):
                if (program / name).exists():
                    replace_with_retry(program / name, backup / name)
                    saved.append(name)
                if (staging / name).exists():
                    replace_with_retry(staging / name, program / name)
                    installed.append(name)
        except Exception as error:
            failed_move = error
            try:
                for name in reversed(installed):
                    replace_with_retry(program / name, staging / name)
                for name in reversed(saved):
                    replace_with_retry(backup / name, program / name)
            except Exception as rollback_error:
                recovery = program.parent / ("spineslim-recovery-" + str(time.time_ns()))
                shutil.copytree(backup, recovery)
                raise ProcessingError("recovery_required", path=str(recovery), detail=str(rollback_error)) from rollback_error
            if isinstance(failed_move, PermissionError):
                raise ProcessingError(
                    "output_locked",
                    source=str(program),
                    detail="请关闭正在使用输出目录的程序后重试。",
                ) from failed_move
            raise failed_move

    def spine(self, source, files, destination):
        destination.mkdir()
        for path in self.stage("copying", files):
            output = destination / path.relative_to(source)
            output.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(path, output)
        if self.options.get("upgrade"):
            self.emit("stage", "upgrading", completed=0, total=0)
            def upgrade_progress(completed, total, path):
                self.emit("progress", "upgrading", completed=completed, total=total, file=path.name if path else "")
            def converter(executable, input_path, output_path):
                self.check_cancel()
                return run_spine_converter(executable, input_path, output_path, runner=self.run)
            result = process_spine_directories([destination], Path(self.tools["spine_converter"]), converter_func=converter,
                                               progress_func=upgrade_progress)
            self.check_cancel()
            if not result.success:
                raise ProcessingError("invalid_spine", detail="; ".join(str(item.error) for item in result.results if item.error))
        texture_total = len(list(destination.rglob("*.png")))
        texture_completed = 0
        self.emit("stage", "textures", completed=0, total=texture_total)
        texture_converter = TextureConverter(self)
        processed = set()
        original_convert = texture_converter.convert
        def tracked(path):
            nonlocal texture_completed
            self.emit("progress", "textures", completed=texture_completed, total=texture_total, file=Path(path).name)
            result = original_convert(path)
            processed.add(Path(result).resolve())
            texture_completed += 1
            self.emit("progress", "textures", completed=texture_completed, total=texture_total, file=Path(path).name)
            return result
        texture_converter.convert = tracked
        process_atlas_textures(destination, texture_converter)
        for path in [path for path in destination.rglob("*.png") if path.resolve() not in processed]:
            self.check_cancel()
            self.emit("progress", "textures", completed=texture_completed, total=texture_total, file=path.name)
            self.convert_image(path)
            texture_completed += 1
            self.emit("progress", "textures", completed=texture_completed, total=texture_total, file=path.name)

    def convert_image(self, path):
        output = Path(TextureConverter(self).convert(str(path)))
        if output.resolve() != path.resolve():
            path.unlink()
        return output

    def videos(self, files, destination):
        videos = [path for path in files if path.suffix.lower() in VIDEO_EXTENSIONS and "guide" not in path.name.lower()]
        if not videos:
            raise ProcessingError("empty_source")
        for path in self.stage("videos", videos):
            stem, suffix = path.stem, 0
            while any((destination / platform / f"{stem}.webm").exists() for platform in ("pc", "mobile")):
                suffix += 1
                stem = f"{path.stem}_{suffix}"
            convert_video_pair(Path(self.tools["ffmpeg"]), path, destination / "pc" / f"{stem}.webm", destination / "mobile" / f"{stem}.webm",
                               preserve_alpha=self.options.get("alpha", True), crf=self.options.get("crf", 36), runner=self.run)

    def ui(self, files, destination):
        groups, fonts, videos = set(), set(), []
        reserved = {"spine", "bg", "atlas", "fonts", "part", "video"}
        for path in self.stage("classifying", files):
            parts = path.stem.split("_")
            if "guide" in path.name.lower():
                continue
            if path.suffix.lower() in VIDEO_EXTENSIONS:
                videos.append(path)
                continue
            if parts[0].lower().startswith("winnum"):
                group = path.parent.name
                if group.lower() in reserved:
                    raise ProcessingError("collision", path=group)
                fonts.add(group)
            elif path.suffix.lower() in (".ttf", ".otf"):
                group = "fonts"
            elif path.suffix.lower() == ".json" and path.parent.name.lower() == "part":
                group = "part"
            elif path.suffix.lower() in (".png", ".jpg", ".jpeg"):
                background = True
                if not self.options.get("force_bg"):
                    if len(parts) >= 3 and parts[2].lower() in ("pce", "pack"):
                        background = parts[2].lower() == "pack"
                    elif path.suffix.lower() == ".png":
                        with Image.open(path) as image:
                            background = not (image.width < 2048 and image.height < 1024)
                group = "bg" if background else (path.parent.name if parts[0].lower() == "fr" else parts[0])
                if not background:
                    if group.lower() in reserved or not group:
                        raise ProcessingError("collision", path=group)
                    groups.add(group)
            else:
                continue
            copy_unique(path, destination / group)
        if groups & fonts:
            raise ProcessingError("collision", path=", ".join(groups & fonts))
        for path in self.stage("textures", list((destination / "bg").glob("*"))):
            if self.options.get("format", "original") != "original" or path.suffix.lower() == ".png":
                self.convert_image(path)
        for group in self.stage("packing", sorted(groups)):
            atlas = destination / "atlas"
            atlas.mkdir(exist_ok=True)
            self.run([self.tools["texturepacker"], "--multipack", "--data", str(atlas / (group + "{n}.json")),
                      "--sheet", str(atlas / (group + "{n}.png")), "--format", "pixijs", "--prepend-folder-name",
                      "--opt", "RGBA8888", "--alpha-handling", "KeepTransparentPixels", "--size-constraints", "POT",
                      "--max-size", "2048", "--trim-mode", "Trim", "--trim-margin", "1", "--trim-threshold", "1",
                      "--shape-padding", "1", "--extrude", "0", str(destination / group)])
        for path in self.stage("textures", sorted((destination / "atlas").glob("*.json"))):
            data = json.loads(path.read_text(encoding="utf-8"))
            texture = path.parent / data["meta"]["image"]
            if not texture.resolve().is_relative_to(path.parent.resolve()):
                raise ProcessingError("linked_path", path=str(texture))
            output = self.convert_image(texture)
            data["meta"]["image"] = output.name
            path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
        from backend.fonts import build_font
        for group in self.stage("fonts", sorted(fonts)):
            build_font(destination / group, destination / "fonts")
        if videos:
            self.videos(videos, destination / "video")
