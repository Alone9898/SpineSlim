import os
import shutil
from pathlib import Path


TOOL_INFO = {
    "imagemagick": ("ImageMagick", "magick.exe", "PNG / WebP / JPG 图片处理", "https://imagemagick.org/script/download.php"),
    "basis": ("Basis Universal", "basisu.exe", "Basis / KTX2 纹理压缩", "https://github.com/BinomialLLC/basis_universal/releases"),
    "texturepacker": ("TexturePacker", "TexturePacker.exe", "UI 图集生成", "https://www.codeandweb.com/texturepacker/download"),
    "spine_converter": ("SpineSkeletonDataConverter", "SpineSkeletonDataConverter.exe", "Spine 版本升级", "https://github.com/wang606/SpineSkeletonDataConverter/releases"),
    "ffmpeg": ("FFmpeg", "ffmpeg.exe", "视频转换", "https://ffmpeg.org/download.html"),
}


def _candidates(key, application_directory):
    _, filename, _, _ = TOOL_INFO[key]
    root = Path(application_directory)
    candidates = [root / filename, root / "TexturePacker" / "bin" / filename]
    path_match = shutil.which(filename)
    if path_match:
        candidates.append(Path(path_match))
    if key == "texturepacker":
        candidates.extend(Path(path) / "TexturePacker" / "bin" / filename for path in (os.environ.get("ProgramFiles", ""), os.environ.get("ProgramW6432", "")) if path)
    return candidates


def find_tool(key, application_directory, configured_path=""):
    candidates = [Path(configured_path)] if configured_path else []
    candidates.extend(_candidates(key, application_directory))
    for candidate in candidates:
        if candidate and candidate.is_file():
            return str(candidate.resolve())
    return ""


def inspect_tools(application_directory, configured_paths=None):
    configured_paths = configured_paths or {}
    result = {}
    for key in TOOL_INFO:
        result[key] = find_tool(key, application_directory, configured_paths.get(key, ""))
    return result
