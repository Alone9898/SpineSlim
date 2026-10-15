import os
import shutil
import json
import threading
import subprocess
import sys
from tkinter import *
from tkinter import filedialog, messagebox, ttk
try:
    from tkinterdnd2 import TkinterDnD, DND_FILES
    DND_AVAILABLE = True
except ImportError:
    TkinterDnD = None
    DND_FILES = None
    DND_AVAILABLE = False
import struct
from concurrent.futures import ThreadPoolExecutor, as_completed
import time
import webbrowser
from pathlib import Path
from app_runtime import APP_VERSION, get_application_directory
from desktop_ui import build_interface

from spine_tools.atlas import process_atlas_textures
from spine_tools.textures import JpegConverter, PngConverter
from tool_manager import TOOL_INFO, inspect_tools
from spine_tools.converter import check_spine_converter
from spine_tools.pipeline import collect_spine_copy_tasks, copy_spine_file, preflight_spine_paths, process_spine_directories
from video_tools import VIDEO_EXTENSIONS, convert_video_pair


MAX_WORKERS = max(4, os.cpu_count() or 4)
LOG_FLUSH_INTERVAL_MS = 50
MAX_LOG_LINES = 1000
RUNTIME_TRANSLATIONS = {
    "待开始": "Ready",
    "准备中": "Preparing",
    "准备处理中": "Preparing",
    "处理完成": "Processing complete",
    "转换完成": "Conversion complete",
    "开始转换": "Starting conversion",
    "已取消": "Cancelled",
    "处理中...": "Processing...",
    "处理中": "Processing",
    "清理完成": "Cleanup complete",
    "清理目标目录": "Cleaning output folder",
    "清理 Program 目录": "Cleaning Program folder",
    "清理旧 Spine 输出": "Cleaning old Spine output",
    "清理旧视频": "Cleaning old videos",
    "资源复制完成": "Assets copied",
    "复制 Spine 资源": "Copying Spine assets",
    "分类复制资源": "Copying categorized assets",
    "复制艺术字源文件": "Copying bitmap font sources",
    "图集处理完成": "Atlas processing complete",
    "转换 Atlas 纹理与引用": "Converting Atlas textures and references",
    "Atlas 纹理与引用更新完成": "Atlas textures and references updated",
    "转换其他 PNG": "Converting other PNG files",
    "其他 PNG 转换完成": "Other PNG conversion complete",
    "Spine 4.2 兼容处理": "Spine 4.2 compatibility",
    "Spine 兼容处理完成": "Spine compatibility complete",
    "已跳过 Spine 兼容处理": "Spine compatibility skipped",
    "压缩 BG 资源": "Compressing BG assets",
    "打图集": "Packing atlas",
    "处理艺术字": "Processing bitmap fonts",
    "生成 PC/Mobile WebM": "Generating PC/Mobile WebM",
    "艺术字处理完成": "Bitmap font processing complete",
    "Program 目录清理完成": "Program folder cleanup complete",
    "程序目录清理完成": "Program folder cleanup complete",
    "资源分类完成": "Resource classification complete",
    "艺术字源文件复制完成": "Bitmap font sources copied",
    "BG 压缩完成": "BG compression complete",
    "无 BG 资源": "No BG assets",
    "旧视频清理完成": "Old videos cleanup complete",
    "PC/Mobile WebM 生成完成": "PC/Mobile WebM generation complete",
    "全部处理完成": "All processing complete",
    "未识别的处理类型": "Unrecognized processing type",
    "开始处理": "Starting processing",
    "开始打图集": "Starting atlas packing",
    "打图集失败": "Atlas packing failed",
    "图集打包完成": "Atlas packing complete",
    "警告": "Warning",
    "错误": "Error",
    "失败": "Failed",
    "完成": "Complete",
    "工具检查通过，开始处理": "Tool check passed. Starting processing",
    "复制": "Copy",
}
# 特殊字符映射
SPECIAL_MAP = {
    "dot": ".",
    "comma": ",",
    "colon": ":",
    "space": " "
}

SAFE_ART_KEY_MAP = {
    ".": "。",
    ":": "：",
    " ": "空格",
    "/": "／",
    "\\": "＼",
    "*": "＊",
    "?": "？",
    '"': "＂",
    "<": "＜",
    ">": "＞",
    "|": "｜"
}

SAFE_ART_KEY_REVERSE_MAP = {value: key for key, value in SAFE_ART_KEY_MAP.items()}
SAFE_ART_KEY_REVERSE_MAP["．"] = "."


def normalize_art_char(char):
    if char == "，":
        return ","
    return char

def run_hidden(cmd, **kwargs):
    return subprocess.run(
        cmd,
        creationflags=subprocess.CREATE_NO_WINDOW,
        startupinfo=_get_startupinfo(),
        **kwargs
    )

def _get_startupinfo():
    si = subprocess.STARTUPINFO()
    si.dwFlags |= subprocess.STARTF_USESHOWWINDOW
    return si
# -------------------- 运行路径 --------------------
def get_resource_dir():
    if getattr(sys, "frozen", False):
        return getattr(sys, "_MEIPASS", os.path.dirname(sys.executable))
    return os.path.dirname(os.path.abspath(__file__))


def get_data_dir():
    return str(get_application_directory())


RESOURCE_DIR = get_resource_dir()
DATA_DIR = get_data_dir()
APP_ICON_FILE = os.path.join(RESOURCE_DIR, "assets", "app-icon.ico")
DEFAULT_CONFIG_FILE = os.path.join(RESOURCE_DIR, "config.json")
CONFIG_FILE = os.path.join(DATA_DIR, "config.json")
IMAGEMAGICK_DIR = os.path.join(DATA_DIR, "ImageMagick-7.1.2-19-portable-Q16-HDRI-x64")
IMAGEMAGICK_EXE = os.path.join(IMAGEMAGICK_DIR, "magick.exe")
BASISU_EXE = os.path.join(DATA_DIR, "basisu.exe")
TEXTUREPACKER_DIR = os.path.join(DATA_DIR, "TexturePacker/bin")
TEXTUREPACKER_EXE = os.path.join(TEXTUREPACKER_DIR, "TexturePacker.exe")
SPINE_CONVERTER_EXE = os.path.join(DATA_DIR, "SpineSkeletonDataConverter.exe")
FFMPEG_EXE = os.path.join(DATA_DIR, "ffmpeg.exe")

# 设置环境变量
# os.environ["MAGICK_CODER_MODULE_PATH"] = IMAGEMAGICK_DIR
env = os.environ.copy()
env["PYTHONIOENCODING"] = "utf-8"
os.environ["PATH"] = IMAGEMAGICK_DIR + os.pathsep + os.environ["PATH"]
os.environ["MAGICK_HOME"] = IMAGEMAGICK_DIR
os.environ["MAGICK_CONFIGURE_PATH"] = os.path.join(IMAGEMAGICK_DIR, "config")
os.environ["MAGICK_CODER_MODULE_PATH"] = os.path.join(IMAGEMAGICK_DIR, "modules", "coders")


is_processing = False
active_spine_compat = False
# -------------------- PIL 检查 --------------------
try:
    from PIL import Image
    PIL_AVAILABLE = True
except ImportError:
    Image = None
    PIL_AVAILABLE = False

def load_config():
    for path in [CONFIG_FILE, DEFAULT_CONFIG_FILE]:
        if os.path.exists(path):
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
    return {"source": "", "target": "", "res_type": "spine", "spine_texture_format": "original", "ui_texture_format": "original", "language": "zh", "tool_paths": {}, "webp_quality": 50, "force_bg": False, "video_transparency": True, "video_crf": 36, "tp_license_accepted": False}

def save_config():
    data = {
        "source": source_var.get(),
        "target": target_var.get(),
        "res_type": res_type.get(),
        "spine_texture_format": process_mode.get(),
        "ui_texture_format": ui_process_mode.get(),
        "language": language_var.get(),
        "tool_paths": tool_paths,
        "webp_quality": webp_quality_var.get(),
        "force_bg": bool(force_bg_var.get()),
        "video_transparency": bool(video_transparency_var.get()),
        "video_crf": video_crf_var.get(),
        "tp_license_accepted": config.get("tp_license_accepted", False)  # 👈 保留
    }
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(CONFIG_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f)

# -------------------- UI 线程 --------------------
def run_on_ui_thread(func):
    root = globals().get("root_ui")
    if root and threading.current_thread() is not threading.main_thread():
        try:
            root.after(0, func)
            return
        except Exception:
            pass
    func()


def call_on_ui_thread(func):
    root = globals().get("root_ui")
    if not root or threading.current_thread() is threading.main_thread():
        return func()

    result = {}
    done = threading.Event()

    def wrapper():
        try:
            result["value"] = func()
        except Exception as exc:
            result["error"] = exc
        finally:
            done.set()

    root.after(0, wrapper)
    done.wait()

    if "error" in result:
        raise result["error"]
    return result.get("value")


# -------------------- 日志 --------------------
_log_buffer = []
_log_lock = threading.Lock()
_log_flush_scheduled = False


def _trim_log_lines():
    try:
        total_lines = int(log_text.index("end-1c").split(".")[0])
        overflow = total_lines - MAX_LOG_LINES
        if overflow > 0:
            log_text.delete("1.0", f"{overflow + 1}.0")
    except Exception:
        pass


def _flush_log_buffer():
    global _log_flush_scheduled

    root = globals().get("root_ui")
    text_widget = globals().get("log_text")
    if not root or not text_widget:
        with _log_lock:
            _log_flush_scheduled = False
        return

    with _log_lock:
        messages = _log_buffer[:]
        _log_buffer.clear()
        _log_flush_scheduled = False

    if not messages:
        return

    try:
        text_widget.insert(END, "\n".join(messages) + "\n")
        _trim_log_lines()
        text_widget.see(END)
    except Exception:
        pass


def _schedule_log_flush():
    global _log_flush_scheduled

    root = globals().get("root_ui")
    if not root:
        return

    with _log_lock:
        if _log_flush_scheduled:
            return
        _log_flush_scheduled = True

    root.after(LOG_FLUSH_INTERVAL_MS, _flush_log_buffer)


def log(msg):
    msg = runtime_text(str(msg))
    with _log_lock:
        _log_buffer.append(msg)
    _schedule_log_flush()


def runtime_text(text):
    """Translate runtime status and log text according to the active language."""
    if globals().get("language_var") is None or language_var.get() != "en":
        return text
    for chinese in sorted(RUNTIME_TRANSLATIONS, key=len, reverse=True):
        english = RUNTIME_TRANSLATIONS[chinese]
        text = text.replace(chinese, english)
    return text


class ProgressTracker:
    SCALE = 1000

    def __init__(self, root, bar, text_var):
        self.root = root
        self.bar = bar
        self.text_var = text_var
        self.lock = threading.Lock()
        self.refresh_scheduled = False
        self.reset()

    def reset(self, text="0%  待开始"):
        with self.lock:
            self.stages = []
            self.stage_index = -1
            self.stage_total = 1
            self.stage_done = 0
            self.stage_text = runtime_text(text)
            self.is_complete = False
        self._schedule_refresh()

    def start(self, stages, text="0%  准备中"):
        with self.lock:
            self.stages = stages or [{"name": "处理中", "weight": 1}]
            self.stage_index = -1
            self.stage_total = 1
            self.stage_done = 0
            self.stage_text = runtime_text(text)
            self.is_complete = False
        self._schedule_refresh()

    def begin_stage(self, index, total=1, detail=None):
        with self.lock:
            if not self.stages:
                self.stages = [{"name": "处理中", "weight": 1}]
            self.stage_index = max(0, min(index, len(self.stages) - 1))
            self.stage_total = max(int(total), 1)
            self.stage_done = 0
            self.stage_text = self._build_stage_text(detail)
            self.is_complete = False
        self._schedule_refresh()

    def advance(self, step=1, detail=None):
        with self.lock:
            self.stage_done = min(self.stage_total, self.stage_done + max(int(step), 0))
            if detail is not None:
                self.stage_text = self._build_stage_text(detail)
        self._schedule_refresh()

    def finish_stage(self, detail=None):
        with self.lock:
            self.stage_done = self.stage_total
            if detail is not None:
                self.stage_text = self._build_stage_text(detail)
        self._schedule_refresh()

    def complete(self, text="100%  处理完成"):
        text = runtime_text(text)
        with self.lock:
            self.is_complete = True
            self.stage_done = self.stage_total
            self.stage_text = text
        self._schedule_refresh()

    def _build_stage_text(self, detail=None):
        if 0 <= self.stage_index < len(self.stages):
            base = self.stages[self.stage_index]["name"]
        else:
            base = "处理中"
        if detail:
            return runtime_text(f"{base} · {detail}")
        return runtime_text(base)

    def _schedule_refresh(self):
        with self.lock:
            if self.refresh_scheduled:
                return
            self.refresh_scheduled = True
        self.root.after(0, self._apply)

    def _apply(self):
        with self.lock:
            ratio = self._compute_ratio()
            stage_text = runtime_text(self.stage_text)
            stage_done = self.stage_done
            stage_total = self.stage_total
            self.refresh_scheduled = False

        self.bar["maximum"] = self.SCALE
        self.bar["value"] = int(ratio * self.SCALE)

        percent = int(ratio * 100)
        if stage_text.startswith(("0%", "100%")):
            status = stage_text
        else:
            status = f"{percent}%  {stage_text} ({stage_done}/{stage_total})"
        self.text_var.set(status)

    def _compute_ratio(self):
        if self.is_complete:
            return 1.0

        if not self.stages or self.stage_index < 0:
            return 0.0

        total_weight = sum(stage.get("weight", 1) for stage in self.stages) or 1
        completed_weight = sum(
            stage.get("weight", 1) for stage in self.stages[:self.stage_index]
        )
        current_weight = self.stages[self.stage_index].get("weight", 1)
        phase_ratio = min(self.stage_done / max(self.stage_total, 1), 1.0)
        return min((completed_weight + current_weight * phase_ratio) / total_weight, 1.0)


SPINE_PROGRESS_STAGES = [
    {"name": "清理目标目录", "weight": 8},
    {"name": "复制 Spine 资源", "weight": 34},
    {"name": "Spine 4.2 兼容处理", "weight": 18},
    {"name": "转换 Atlas 纹理与引用", "weight": 24},
    {"name": "转换其他 PNG", "weight": 16},
]

UI_PROGRESS_STAGES = [
    {"name": "清理 Program 目录", "weight": 8},
    {"name": "分类复制资源", "weight": 38},
    {"name": "复制艺术字源文件", "weight": 10},
    {"name": "压缩 BG 资源", "weight": 26},
    {"name": "打图集", "weight": 10},
    {"name": "处理艺术字", "weight": 8},
]

VIDEO_PROGRESS_STAGES = [
    {"name": "清理旧视频", "weight": 10},
    {"name": "生成 PC/Mobile WebM", "weight": 90},
]

# -------------------- 拷贝 --------------------
def copy_safe(src, dst_dir):
    name = os.path.basename(src)
    dst = os.path.join(dst_dir, name)
    base, ext = os.path.splitext(name)
    i = 1
    while os.path.exists(dst):
        dst = os.path.join(dst_dir, f"{base}_{i}{ext}")
        i += 1
    shutil.copy2(src, dst)

# -------------------- 拖拽解析 --------------------
def parse_drop_path(data):
    if data.startswith("{") and data.endswith("}"):
        data = data[1:-1]
    return data

def drop_source(event):
    path = parse_drop_path(event.data)
    if os.path.isdir(path):
        source_var.set(path)
        save_config()

def drop_target(event):
    path = parse_drop_path(event.data)
    if os.path.isdir(path):
        target_var.set(path)
        save_config()

# -------------------- 选择目录 --------------------
def select_source():
    path = filedialog.askdirectory(initialdir=source_var.get() or ".")
    if path:
        source_var.set(path)
        save_config()

def select_target():
    path = filedialog.askdirectory(initialdir=target_var.get() or ".")
    if path:
        target_var.set(path)
        save_config()

# -------------------- 清除目录 --------------------
def clear_directory(path, progress_callback=None):
    if not os.path.exists(path):
        return 0

    removed = 0
    for filename in os.listdir(path):
        file_path = os.path.join(path, filename)
        try:
            if os.path.isfile(file_path) or os.path.islink(file_path):
                os.remove(file_path)
            elif os.path.isdir(file_path):
                shutil.rmtree(file_path)
        except Exception as e:
            log(f"清理失败: {file_path} -> {e}")
        finally:
            removed += 1
            if progress_callback:
                progress_callback(filename)
    return removed

# ------------------- 图片处理 -------------------
class ImageConverter:
    def convert(self, input_path):
        raise NotImplementedError
    def get_output_ext(self):
        raise NotImplementedError

#------webp
class WebPConverter(ImageConverter):
    def __init__(self, quality=50, output_ext=".webp"):
        self.quality = quality
        self.output_ext = output_ext

    def convert(self, png_path):
        webp_path = str(Path(png_path).with_suffix(".webp"))

        run_hidden([
            IMAGEMAGICK_EXE,
            png_path,
            "-quality", str(self.quality),
            "-define", "webp:method=6",
            webp_path
        ], check=True)

        if self.output_ext == ".webp":
            return webp_path

        output_path = str(Path(png_path).with_suffix(self.output_ext))
        if os.path.normcase(os.path.abspath(output_path)) == os.path.normcase(os.path.abspath(png_path)):
            os.remove(png_path)
        elif os.path.exists(output_path):
            os.remove(output_path)

        os.replace(webp_path, output_path)
        return output_path

    def get_output_ext(self):
        return self.output_ext


class BasisConverter(ImageConverter):
    def convert(self, png_path):
        basis_path = str(Path(png_path).with_suffix(".basis"))

        run_hidden([
            BASISU_EXE,
            "-q", "255",
            "-file", png_path,
            "-output_file", basis_path
        ], check=True)

        return basis_path
    def get_output_ext(self):
        return ".basis"


def get_image_size_fast(image_path):
    ext = os.path.splitext(image_path)[1].lower()

    if ext == ".png":
        try:
            with open(image_path, "rb") as f:
                header = f.read(24)
            if header[:8] == b"\x89PNG\r\n\x1a\n":
                return struct.unpack(">II", header[16:24])
        except Exception:
            pass

    if not PIL_AVAILABLE:
        return None, None

    try:
        with Image.open(image_path) as img:
            return img.size
    except Exception:
        return None, None


def process_video_assets(
    video_sources,
    mobile_dir,
    pc_dir,
    preserve_alpha,
    crf,
    progress_callback=None,
):
    os.makedirs(mobile_dir, exist_ok=True)
    os.makedirs(pc_dir, exist_ok=True)
    converted = 0

    for source_video in video_sources:
        source_name = os.path.basename(source_video)
        output_stem = os.path.splitext(source_name)[0]
        suffix = 0
        while True:
            candidate_stem = output_stem if suffix == 0 else f"{output_stem}_{suffix}"
            pc_video = Path(pc_dir) / f"{candidate_stem}.webm"
            mobile_video = Path(mobile_dir) / f"{candidate_stem}.webm"
            if not pc_video.exists() and not mobile_video.exists():
                break
            suffix += 1

        try:
            log(
                f"视频转换 -> {source_name} "
                f"(透明={'开启' if preserve_alpha else '关闭'}, CRF={crf})"
            )
            convert_video_pair(
                Path(FFMPEG_EXE),
                Path(source_video),
                pc_video,
                mobile_video,
                preserve_alpha=preserve_alpha,
                crf=crf,
            )
            converted += 1
            log(f"视频完成 -> pc/{pc_video.name}, mobile/{mobile_video.name}")
        finally:
            if progress_callback:
                progress_callback(source_name)

    return converted


# -------------------- 配置更改 --------------------
def create_texture_converter(mode, quality):
    quality = max(0, min(quality, 100))
    if mode == "imagemagick":
        return WebPConverter(quality)
    if mode == "basis":
        return BasisConverter()
    if mode in ("original", "png"):
        return PngConverter(IMAGEMAGICK_EXE, runner=run_hidden)
    if mode == "jpg":
        return JpegConverter(IMAGEMAGICK_EXE, quality, runner=run_hidden)
    raise ValueError(f"未知纹理格式: {mode}")


def convert_images(folder, converter: ImageConverter, progress_callback=None, extensions=(".png",)):
    log(f"开始转换: {converter.__class__.__name__}")

    png_files = [
        os.path.join(folder, f)
        for f in os.listdir(folder)
        if f.lower().endswith(extensions)
    ]

    destinations = set()
    for source_path in png_files:
        destination = Path(source_path).with_suffix(converter.get_output_ext()).resolve()
        source_path = Path(source_path).resolve()
        if destination in destinations or (destination.exists() and destination != source_path):
            raise FileExistsError(f"图片输出重名，请先调整文件名: {destination}")
        destinations.add(destination)

    total = len(png_files)
    count = 0

    def worker(png_path):
        try:
            output_path = converter.convert(png_path)
            if os.path.exists(output_path):
                if os.path.normcase(os.path.abspath(output_path)) != os.path.normcase(os.path.abspath(png_path)):
                    os.remove(png_path)
                return True, os.path.basename(output_path), output_path
        except Exception as e:
            return False, f"{os.path.basename(png_path)} -> {e}", None
        return False, os.path.basename(png_path), None

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        futures = [executor.submit(worker, p) for p in png_files]

        for future in as_completed(futures):
            success, msg, _output_path = future.result()

            if success:
                count += 1
                log(f"转换完成: {msg}")
            else:
                log(f"失败: {msg}")

            if progress_callback:
                progress_callback(msg)

    log(f"转换完成，共 {count}/{total} 张")

# -------------------- 图片转换 -----------------
def process_atlas_parallel(program_dir, quality, progress_callback=None, excluded_dirs=None, mode="original"):
    tasks = []
    excluded_dir_names = {name.lower() for name in (excluded_dirs or [])}

    for item in os.listdir(program_dir):
        item_path = os.path.join(program_dir, item)

        if os.path.isdir(item_path) \
           and item.lower() not in ["bg", "atlas", "spine"] \
           and not item.lower().startswith("winnum") \
           and item.lower() not in excluded_dir_names:
            tasks.append(item)

    max_workers = min(8, os.cpu_count() or 4)

    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {
            executor.submit(process_single_atlas, program_dir, item, quality, mode): item
            for item in tasks
        }

        for future in as_completed(futures):
            item = futures[future]
            future.result()
            if progress_callback:
                progress_callback(item)

    log("🎉 全部 atlas 处理完成")

def process_single_atlas(program_dir, item, quality, mode="original"):
    item_path = os.path.join(program_dir, item)

    png_count = sum(1 for f in os.listdir(item_path) if f.lower().endswith(".png"))
    if png_count == 0:
        return

    log(f"为 {item} 打图集 ({png_count} 个 PNG 文件)...")

    success = pack_atlas(item_path, item)

    if not success:
        log(f"❌ {item} 图集生成失败")
        return

    log(f"处理 {item} 的图集纹理，格式: {mode}")

    atlas_dir = os.path.join(program_dir, "atlas")
    atlas_convert_count = 0

    for file in os.listdir(atlas_dir):
        if file.startswith(item) and file.endswith('.json'):
            json_path = os.path.join(atlas_dir, file)

            png_file = file.replace('.json', '.png')
            png_path = os.path.join(atlas_dir, png_file)

            if os.path.exists(png_path):
                try:
                    if quality < 0 or quality > 100:
                        quality = 50

                    converter = create_texture_converter(mode, quality)
                    output_path = Path(converter.convert(png_path))
                    if not output_path.is_file() or output_path.stat().st_size == 0:
                        raise RuntimeError(f"图集纹理转换未生成有效文件: {output_path}")

                    atlas_convert_count += 1

                    with open(json_path, 'r', encoding='utf-8') as f:
                        data = json.load(f)

                    data['meta']['image'] = output_path.name

                    with open(json_path, 'w', encoding='utf-8') as f:
                        json.dump(data, f, indent=2)
                    if output_path.resolve() != Path(png_path).resolve():
                        os.remove(png_path)

                except Exception as e:
                    log(f"❌ 转换失败: {e}")

    log(f"✅ {item} 完成（{atlas_convert_count} 个）")

# -------------------- 打图集 --------------------
def pack_atlas(source_dir, first_part):
    """使用 TexturePacker 打图集"""
    if not os.path.exists(TEXTUREPACKER_EXE):
        log(f"警告: TexturePacker 未找到: {TEXTUREPACKER_EXE}")
        return False
    ensure_texturepacker_license()
    # 图集输出到 program/atlas 下
    program_dir = os.path.dirname(source_dir)
    atlas_dir = os.path.join(program_dir,"atlas")
    os.makedirs(atlas_dir, exist_ok=True)

    try:
        # 规范化路径：统一使用正斜杠，避免混合使用
        source_dir_norm = os.path.normpath(source_dir).replace("\\", "/")

        # 为 multipack 模式，输出文件名需要特殊处理
        # TexturePacker 会自动在文件名后添加数字（如 atlas1.png, atlas2.png）
        output_json_base = os.path.normpath(os.path.join(atlas_dir,first_part)).replace("\\", "/")
        output_sheet_base = os.path.normpath(os.path.join(atlas_dir,first_part)).replace("\\", "/")
        page_number = "{n}"
        cmd = [
            TEXTUREPACKER_EXE,
            "--multipack",  # 启用自动打多个图集的模式
            "--data", output_json_base + page_number + ".json",
            "--sheet", output_sheet_base + page_number + ".png",
            "--format", "pixijs",
            "--prepend-folder-name",
            "--opt", "RGBA8888",
            "--alpha-handling", "KeepTransparentPixels",
            "--size-constraints", "POT",
            "--max-size", "2048",
            "--trim-mode", "Trim",
            "--trim-margin", "1",
            "--trim-threshold", "1",
            "--shape-padding", "1",
            "--extrude", "0",
            source_dir_norm
        ]

        log(f"开始打图集: {source_dir}")
        log(f"EXE路径: {TEXTUREPACKER_EXE}")
        log(f"是否存在: {os.path.exists(TEXTUREPACKER_EXE)}")
        log(f"图集源路径: {source_dir_norm}")
        log(f"输出路径: {atlas_dir}")
        log(f"TexturePacker 命令: {' '.join(cmd)}")

        # 使用 shell=False 以避免路径解析问题
        result = run_hidden(cmd, check=False, capture_output=True, text=True)

        if result.returncode != 0:
            log(f"TexturePacker 错误 (code {result.returncode}):")
            if result.stdout:
                log(f"标准输出: {result.stdout}")
            if result.stderr:
                log(f"标准错误: {result.stderr}")
            return False

        log(f"图集打包完成: {atlas_dir}")
        return True

    except FileNotFoundError:
        log(f"错误: TexturePacker 未安装或不可用")
        return False
    except Exception as e:
        log(f"打图集失败: {e}")
        return False

def decode_art_key(key):
    if key in SPECIAL_MAP:
        return normalize_art_char(SPECIAL_MAP[key])

    if key in SAFE_ART_KEY_REVERSE_MAP:
        return normalize_art_char(SAFE_ART_KEY_REVERSE_MAP[key])

    if len(key) == 1:
        return normalize_art_char(key)

    if key.startswith("U+"):
        return normalize_art_char(chr(int(key[2:], 16)))

    return None


def parse_char(filename):
    name = os.path.splitext(filename)[0]

    if "_" in name and name.split("_", 1)[0].lower().startswith("winnum"):
        key = name.split("_", 1)[1]
    else:
        key = name

    return decode_art_key(key)


def get_safe_art_filename_key(char):
    char = normalize_art_char(char)
    return SAFE_ART_KEY_MAP.get(char, char)


def rename_winnum_source_files(folder_path):
    renamed = 0

    for file in os.listdir(folder_path):
        src_path = os.path.join(folder_path, file)
        if not os.path.isfile(src_path):
            continue

        _, ext = os.path.splitext(file)
        if ext.lower() != ".png":
            continue

        char = parse_char(file)
        if not char:
            continue

        target_name = f"{get_safe_art_filename_key(char)}{ext.lower()}"
        if file == target_name:
            continue

        target_path = os.path.join(folder_path, target_name)
        if os.path.normcase(os.path.abspath(src_path)) == os.path.normcase(os.path.abspath(target_path)):
            continue

        base_name, base_ext = os.path.splitext(target_name)
        suffix = 1
        while os.path.exists(target_path):
            target_path = os.path.join(folder_path, f"{base_name}_{suffix}{base_ext}")
            suffix += 1

        os.replace(src_path, target_path)
        renamed += 1

    return renamed


def build_font(folder_path,output_dir):
    if not PIL_AVAILABLE:
        log("错误: Pillow 未安装，无法生成艺术字位图，请运行 python -m pip install Pillow")
        return

    images = []
    folder_name = os.path.basename(folder_path)

    # 1️⃣ 扫描目录
    for file in os.listdir(folder_path):
        if not file.lower().endswith(".png"):
            continue

        char = parse_char(file)
        if not char:
            continue

        ascii_code = ord(char)
        path = os.path.join(folder_path, file)

        img = Image.open(path).convert("RGBA")
        images.append((ascii_code, img))

    if not images:
        log(f"❌ 没有匹配的图片: {folder_path}")
        return

    # 排序
    images.sort(key=lambda x: x[0])

    # 2️⃣ 拼图
    total_width = sum(img.width for _, img in images)
    max_height = max(img.height for _, img in images)

    atlas = Image.new("RGBA", (total_width, max_height))

    x_cursor = 0
    char_lines = []

    for ascii_code, img in images:
        atlas.paste(img, (x_cursor, 0), img)

        char_lines.append({
            "id": ascii_code,
            "x": x_cursor,
            "width": img.width,
            "height": img.height
        })

        x_cursor += img.width

    png_name = f"{folder_name}.png"
    fnt_name = f"{folder_name}.fnt"
    # 3️⃣ 输出 PNG（固定叫 winnum.png）
    png_path = os.path.join(output_dir, png_name)

    atlas.save(png_path)

    # 4️⃣ 输出 FNT
    fnt_path = os.path.join(output_dir, fnt_name)

    with open(fnt_path, "w", encoding="utf-8") as f:
        f.write(
f'''info face="{folder_name}" size={max_height} bold=0 italic=0 charset="" unicode=1 stretchH=100 smooth=1 aa=1 padding=0,0,0,0 spacing=1,1 outline=0
common lineHeight={max_height} base={int(max_height*0.8)} scaleW={total_width} scaleH={max_height} pages=1 packed=0 alphaChnl=1 redChnl=0 greenChnl=0 blueChnl=0
page id=0 file="{png_name}"
chars count={len(char_lines)}
''')

        for c in char_lines:
            f.write(
                f'char id={c["id"]}   x={c["x"]}  y=0     width={c["width"]}    height={c["height"]}   '
                f'xoffset=0     yoffset=0     xadvance={c["width"]}    page=0  chnl=15\n'
            )

    log(f"✅ 完成: {folder_path}")

def get_art_group_name(root):
    return os.path.basename(os.path.normpath(root))

#处理艺术字
def process_winnum_fonts(program_dir, progress_callback=None, font_dir_names=None):
    log("=== 开始生成艺术字位图字体 ===")

    if font_dir_names is None:
        font_dir_names = [
            item for item in os.listdir(program_dir)
            if item.lower().startswith("winnum")
        ]
    else:
        font_dir_names = list(font_dir_names)

    if not font_dir_names:
        log("未发现艺术字目录，跳过")
        return

    if not PIL_AVAILABLE:
        log("错误: Pillow 未安装，已跳过艺术字处理")
        return

    fonts_dir = os.path.join(program_dir, "fonts")
    os.makedirs(fonts_dir, exist_ok=True)

    handled = set()
    for item in font_dir_names:
        item_key = item.lower()
        if item_key in handled:
            continue
        handled.add(item_key)

        font_dir = os.path.join(program_dir, item)
        if  os.path.isdir(font_dir):
            renamed = rename_winnum_source_files(font_dir)
            if renamed:
                log(f"艺术字源文件已重命名: {item} ({renamed} 个)")
            build_font(font_dir, fonts_dir)
            if progress_callback:
                progress_callback(item)
    log("=== 艺术字处理完成 ===")


def get_group_name(filename, root=None):
    name_without_ext = os.path.splitext(filename)[0]
    parts = name_without_ext.split('_')

    # fr sequence frames are grouped by their current folder name.
    if parts[0].lower() == "fr" and root:
        return os.path.basename(os.path.normpath(root))

    # 默认规则
    return parts[0]

# -------------------- 主处理 --------------------
def process_files():
    source = source_var.get()
    target = target_var.get()
    if not os.path.exists(source) or not os.path.exists(target):
        call_on_ui_thread(lambda: messagebox.showerror("错误", "请选择有效目录"))
        return False
    # ✅ 获取最后一级目录名
    last_folder = os.path.basename(os.path.normpath(source)).lower()

    # ✅ 当前选择类型
    selected_type = res_type.get()  # "spine" 或 "ui"
    force_bg = selected_type == "ui" and bool(force_bg_var.get())
    preserve_video_alpha = bool(video_transparency_var.get())
    try:
        video_crf = max(0, min(int(video_crf_var.get()), 63))
    except (TclError, TypeError, ValueError):
        video_crf = 36

    # ✅ 判断是否匹配
    if selected_type != "spine" and last_folder != selected_type:
        result = call_on_ui_thread(
            lambda: messagebox.askyesno(
                "目录不匹配",
                f"当前选择类型是【{selected_type}】\n"
                f"但目录是【{last_folder}】\n\n"
                "是否继续处理？"
            )
        )

        if not result:
            log("❌ 用户取消处理（目录不匹配）")
            return False
        else:
            log(f"⚠️ 类型与目录不匹配，但继续执行: {selected_type} / {last_folder}")
    type = selected_type
    spine_count = 0
    ui_count = 0
    video_count = 0

    if type == "spine":
        compat_enabled = active_spine_compat
        tasks = collect_spine_copy_tasks(
            Path(source), Path(target) / "program" / "spine"
        )

        if not tasks:
            log("❌ 源目录没有可处理的文件，未清理目标目录")
            return False

        if compat_enabled:
            log("预检 Spine 4.2 转换器...")
            check_spine_converter(Path(SPINE_CONVERTER_EXE))
            preflight_result = preflight_spine_paths(
                [
                    Path(root) / file_name
                    for root, file_name in tasks
                    if file_name.lower().endswith(".json")
                ]
            )
            for file_result in preflight_result.results:
                if file_result.status in ("failed", "unsupported"):
                    log(
                        f"❌ Spine预检 {file_result.status}: "
                        f"{file_result.path} -> {file_result.error}"
                    )
            if not preflight_result.success:
                log("❌ Spine 输入预检失败，未清理目标目录")
                return False
            log("Spine 4.2 转换器预检通过")

        progress_tracker.start(SPINE_PROGRESS_STAGES)
        target = os.path.join(target, "program/spine")
        os.makedirs(target, exist_ok=True)
        log("清理旧 Spine 输出...")
        progress_tracker.begin_stage(0, len(os.listdir(target)) or 1)
        clear_directory(
            target,
            lambda name: progress_tracker.advance(detail=name)
        )
        progress_tracker.finish_stage("清理完成")

        progress_tracker.begin_stage(1, len(tasks))
        for source_root, file_name in tasks:
            destination = copy_spine_file(
                Path(source_root) / file_name, Path(source), Path(target)
            )
            spine_count += 1
            relative_name = str(destination.relative_to(target))
            log(f"复制 -> {relative_name}")
            progress_tracker.advance(detail=relative_name)
        progress_tracker.finish_stage("资源复制完成")

        if compat_enabled:
            spine_json_total = sum(
                1
                for _path in Path(target).rglob("*.json")
            )
            progress_tracker.begin_stage(2, spine_json_total or 1)
            log("开始 Spine 4.2.11 升级与 Setup Pose attachment 迁移...")
            batch_result = process_spine_directories(
                [Path(target)],
                Path(SPINE_CONVERTER_EXE),
            )
            for file_result in batch_result.results:
                detail = os.path.basename(file_result.path)
                if file_result.status in ("failed", "unsupported"):
                    log(
                        f"❌ Spine兼容处理 {file_result.status}: "
                        f"{detail} -> {file_result.error}"
                    )
                else:
                    transform = file_result.transform
                    transform_detail = ""
                    if transform:
                        transform_detail = (
                            f", setup={transform.setup_attachment_count}"
                            f", created={transform.created_timeline_count}"
                            f", prepended={transform.prepended_frame_count}"
                            f", preserved={transform.preserved_time_zero_frame_count}"
                        )
                    log(
                        f"Spine兼容处理 {file_result.status}: {detail}"
                        f" ({file_result.input_version or '-'} -> "
                        f"{file_result.output_version or '-'}){transform_detail}"
                    )
                progress_tracker.advance(detail=detail)

            progress_tracker.finish_stage("Spine 兼容处理完成")
            log(
                "Spine兼容汇总: "
                f"scanned={batch_result.scanned}, "
                f"upgraded={batch_result.upgraded}, "
                f"already_4_2={batch_result.already_4_2}, "
                f"ignored={batch_result.ignored}, "
                f"unsupported={batch_result.unsupported}, "
                f"failed={batch_result.failed}"
            )
            if not batch_result.success:
                log("❌ Spine 兼容处理失败，已取消后续纹理处理")
                return False
        else:
            progress_tracker.begin_stage(2, 1)
            progress_tracker.advance(detail="开关未启用")
            progress_tracker.finish_stage("已跳过 Spine 兼容处理")

        converter = create_texture_converter(process_mode.get(), webp_quality_var.get())

        atlas_total = sum(1 for _path in Path(target).rglob("*.atlas"))
        progress_tracker.begin_stage(3, atlas_total or 1)
        texture_result = process_atlas_textures(Path(target), converter)
        log(
            "Spine纹理: "
            f"converted={texture_result.converted}, "
            f"basis_skipped={texture_result.basis_skipped}, "
            f"atlas_modified={texture_result.atlas_modified}"
        )
        progress_tracker.finish_stage("Atlas 纹理与引用更新完成")

        png_total = sum(1 for _path in Path(target).rglob("*.png"))
        progress_tracker.begin_stage(4, png_total or 1)
        for folder, _directories, files in os.walk(target):
            if any(name.lower().endswith(".png") for name in files):
                convert_images(
                    folder,
                    converter,
                    lambda msg: progress_tracker.advance(detail=msg)
                )
        progress_tracker.finish_stage("其他 PNG 转换完成")
    elif type == "ui":
        contains_video = any(
            os.path.splitext(file_name)[1].lower() in VIDEO_EXTENSIONS
            for _root, _dirs, files in os.walk(source)
            for file_name in files
        )
        if contains_video and not os.path.isfile(FFMPEG_EXE):
            error_message = f"未找到 FFmpeg: {FFMPEG_EXE}"
            log(error_message)
            call_on_ui_thread(lambda: messagebox.showerror("视频处理失败", error_message))
            return False

        progress_tracker.start(UI_PROGRESS_STAGES)
        # UI 资源处理：清除program目录下除spine外的所有文件和目录
        program_dir = os.path.join(target, "program")
        os.makedirs(program_dir, exist_ok=True)
        items_to_clear = [
            item for item in os.listdir(program_dir)
            if item.lower() != "spine"
        ]
        progress_tracker.begin_stage(0, len(items_to_clear) or 1)
        if items_to_clear:
            log("清理 program 目录（保留 spine）...")
        for item in items_to_clear:
            item_path = os.path.join(program_dir, item)
            try:
                if os.path.isfile(item_path) or os.path.islink(item_path):
                    os.remove(item_path)
                    log(f"删除文件: {item}")
                elif os.path.isdir(item_path):
                    shutil.rmtree(item_path)
                    log(f"删除目录: {item}")
            except Exception as e:
                log(f"删除失败: {item} -> {e}")
            finally:
                progress_tracker.advance(detail=item)
        progress_tracker.finish_stage("Program 目录清理完成")
        if items_to_clear:
            log("program 目录清理完成")

        # UI 资源直接复制到目标目录（优化：根据图片类型和大小分类存放）
        source_entries = []
        for root, dirs, files in os.walk(source):
            folder = os.path.basename(root).lower()
            for f in files:
                source_entries.append((root, folder, f))

        font_groups = {}
        video_sources = []
        progress_tracker.begin_stage(1, len(source_entries) or 1)
        for root, folder, f in source_entries:
            file_path = os.path.join(root, f)
            file_ext = os.path.splitext(f)[1].lower()
            name_without_ext = os.path.splitext(f)[0]
            raw_first = name_without_ext.split('_')[0]

            try:
                # 跳过 guide 文件
                if "guide" in f.lower():
                    log(f"舍弃: {f} (guide 文件)")
                    continue

                # 判断是否是艺术字（winnum 开头）
                if file_ext in VIDEO_EXTENSIONS:
                    video_sources.append(file_path)
                    log(f"视频收集 -> {f}")
                    continue

                if raw_first.lower().startswith("winnum"):
                    group_name = get_art_group_name(root)
                    font_groups.setdefault(group_name, []).append(file_path)
                    log(f"艺术字收集 -> {f} ({group_name})")
                    continue  # ⚠️ 不走 UI 分类逻辑

                # 处理文本文件
                if file_ext in [".ttf", ".otf"]:
                    target_dir = os.path.join(target, "program", "fonts")
                    os.makedirs(target_dir, exist_ok=True)
                    copy_safe(file_path, target_dir)
                    log(f"字体 -> {f}")
                    continue

                if file_ext == ".json" and folder in ["part"]:
                    target_dir = os.path.join(target, "program", "part")
                    os.makedirs(target_dir, exist_ok=True)
                    copy_safe(file_path, target_dir)
                    log(f"粒子json -> {f}")
                    continue

                # 只处理图片文件
                if file_ext not in [".jpg", ".jpeg", ".png"]:
                    log(f"舍弃: {f} (非图片文件)")
                    continue

                # 根据图片类型和大小区分 bg 和 pce
                resource_type = "bg"
                parts = name_without_ext.split("_")

                if not force_bg and len(parts) >= 3:
                    attr = parts[2].lower()

                    if attr == "pce":
                        resource_type = "pce"
                        log(f"命名指定 -> {f} => pce")
                    elif attr == "pack":
                        resource_type = "bg"
                        log(f"命名指定 -> {f} => bg")

                if not force_bg and resource_type == "bg" and (len(parts) < 3 or parts[2].lower() not in ["pce", "pack"]):
                    if file_ext in [".jpg", ".jpeg"]:
                        resource_type = "bg"
                    elif file_ext == ".png":
                        width, height = get_image_size_fast(file_path)
                        if width and height:
                            if width < 2048 and height < 1024:
                                resource_type = "pce"
                        elif not PIL_AVAILABLE:
                            log(f"警告: PIL 未安装，无法读取图片大小 {f}，默认为 bg (请运行: pip install Pillow)")
                        else:
                            log(f"获取PNG大小失败: {f}，默认为bg")

                if resource_type == "bg":
                    target_dir = os.path.join(target, "program", "bg")
                else:
                    first_part = get_group_name(f, root)
                    target_dir = os.path.join(target, "program", first_part)

                os.makedirs(target_dir, exist_ok=True)
                copy_safe(file_path, target_dir)
                ui_count += 1
                log(f"UI -> {f} ({resource_type})")
            finally:
                progress_tracker.advance(detail=f)
        progress_tracker.finish_stage("资源分类完成")

        art_source_total = sum(len(files) for files in font_groups.values())
        progress_tracker.begin_stage(2, art_source_total or 1)
        for group_name, files in font_groups.items():
            target_dir = os.path.join(target, "program", group_name)
            os.makedirs(target_dir, exist_ok=True)

            for src_path in files:
                filename = os.path.basename(src_path)

                try:
                    copy_safe(src_path, target_dir)  # ✅ 只传目录
                    log(f"拷贝成功: {filename} -> {group_name}/")
                except Exception as e:
                    log(f"拷贝失败: {filename}, 错误: {e}")
                finally:
                    progress_tracker.advance(detail=filename)
        progress_tracker.finish_stage("艺术字源文件复制完成")

        bg_dir = os.path.join(target, "program", "bg")
        quality = webp_quality_var.get()
        if quality < 0 or quality > 100:
            quality = 50
        bg_png_total = sum(
            1 for path in Path(bg_dir).glob("*")
            if path.is_file() and path.suffix.lower() in ((".png",) if ui_process_mode.get() == "original" else (".png", ".jpg", ".jpeg"))
        )
        progress_tracker.begin_stage(3, bg_png_total or 1)
        if os.path.isdir(bg_dir):
            log(f"处理 BG 图片，保留原尺寸，输出到 program/bg，格式: {ui_process_mode.get()}")
            convert_images(
                bg_dir,
                create_texture_converter(ui_process_mode.get(), quality),
                lambda msg: progress_tracker.advance(detail=msg),
                extensions=(".png",) if ui_process_mode.get() == "original" else (".png", ".jpg", ".jpeg")
            )
            progress_tracker.finish_stage("BG 压缩完成")
        else:
            progress_tracker.finish_stage("无 BG 资源")

        if video_sources:
            video_root = os.path.join(program_dir, "video")
            mobile_video_dir = os.path.join(video_root, "mobile")
            pc_video_dir = os.path.join(video_root, "pc")
            ui_count += process_video_assets(
                video_sources,
                mobile_video_dir,
                pc_video_dir,
                preserve_video_alpha,
                video_crf,
            )

        # 对pce类型的文件进行打图集
        log("开始处理 pce 文件打图集...")
        art_group_names = list(font_groups.keys())
        art_group_name_set = {name.lower() for name in art_group_names}
        atlas_tasks = [
            item for item in os.listdir(program_dir)
            if os.path.isdir(os.path.join(program_dir, item))
            and item.lower() not in ["bg", "atlas", "spine", "video"]
            and not item.lower().startswith("winnum")
            and item.lower() not in art_group_name_set
        ]
        progress_tracker.begin_stage(4, len(atlas_tasks) or 1)
        if force_bg:
            log("强制背景图模式：跳过碎图 TexturePacker 打图集")
            progress_tracker.advance(detail="跳过碎图打图集")
            progress_tracker.finish_stage("已跳过碎图打图集")
        else:
            t0 = time.perf_counter()
            process_atlas_parallel(
                program_dir,
                quality,
                lambda item: progress_tracker.advance(detail=item),
                art_group_names,
                mode=ui_process_mode.get()
            )
            progress_tracker.finish_stage("图集处理完成")
            log(f"⏱️ Atlas阶段耗时: {time.perf_counter() - t0:.2f}s")

        ## 处理艺术字
        t0 = time.perf_counter()
        art_font_dirs = [
            item for item in art_group_names
            if os.path.isdir(os.path.join(program_dir, item))
        ]
        progress_tracker.begin_stage(5, len(art_font_dirs) or 1)
        process_winnum_fonts(
            program_dir,
            lambda item: progress_tracker.advance(detail=item),
            art_font_dirs
        )
        progress_tracker.finish_stage("艺术字处理完成")
        log(f"⏱️ 艺术字耗时: {time.perf_counter() - t0:.2f}s")
        log(f"UI 处理完成，共 {ui_count} 个文件")
    elif type == "video":
        video_sources = [
            os.path.join(root, file_name)
            for root, _dirs, files in os.walk(source)
            for file_name in files
            if os.path.splitext(file_name)[1].lower() in VIDEO_EXTENSIONS
            and "guide" not in file_name.lower()
        ]
        if not video_sources:
            log("未找到可处理的视频文件")
            call_on_ui_thread(
                lambda: messagebox.showerror("视频处理失败", "源目录中没有可处理的视频文件")
            )
            return False
        if not os.path.isfile(FFMPEG_EXE):
            error_message = f"未找到 FFmpeg: {FFMPEG_EXE}"
            log(error_message)
            call_on_ui_thread(lambda: messagebox.showerror("视频处理失败", error_message))
            return False

        progress_tracker.start(VIDEO_PROGRESS_STAGES)
        video_root = os.path.join(target, "program", "video")
        mobile_video_dir = os.path.join(video_root, "mobile")
        pc_video_dir = os.path.join(video_root, "pc")
        os.makedirs(mobile_video_dir, exist_ok=True)
        os.makedirs(pc_video_dir, exist_ok=True)

        old_videos = [
            os.path.join(folder, file_name)
            for folder in (mobile_video_dir, pc_video_dir)
            for file_name in os.listdir(folder)
            if file_name.lower().endswith(".webm")
        ]
        progress_tracker.begin_stage(0, len(old_videos) or 1)
        for old_video in old_videos:
            os.remove(old_video)
            progress_tracker.advance(detail=os.path.basename(old_video))
        progress_tracker.finish_stage("旧视频清理完成")

        progress_tracker.begin_stage(1, len(video_sources) or 1)
        video_count = process_video_assets(
            video_sources,
            mobile_video_dir,
            pc_video_dir,
            preserve_video_alpha,
            video_crf,
            lambda name: progress_tracker.advance(detail=name),
        )
        progress_tracker.finish_stage("PC/Mobile WebM 生成完成")
        log(f"视频处理完成，共 {video_count} 个源视频")
    else:
        progress_tracker.reset("0%  未识别的处理类型")
        return False



    log("全部处理完成")
    progress_tracker.complete()
    if type == "spine":
        call_on_ui_thread(lambda: messagebox.showinfo("完成", f"Spine: {spine_count} 个文件\n已保留源目录结构"))
    elif type == "ui":
        call_on_ui_thread(lambda: messagebox.showinfo("完成", f"UI 文件: {ui_count}"))
    elif type == "video":
        call_on_ui_thread(lambda: messagebox.showinfo("完成", f"视频文件: {video_count}"))
    return True

def ensure_texturepacker_license():
    global config

    if config.get("tp_license_accepted"):
        return  # ✅ 已经做过了，直接跳过

    log("首次运行 TexturePacker，自动同意 license...")

    try:
        result = subprocess.run(
            [TEXTUREPACKER_EXE, "--agree-to-license"],
            input="agree\n",   # 👈 核心
            capture_output=True,
            text=True,
            timeout=10,
            creationflags=subprocess.CREATE_NO_WINDOW,
            startupinfo=_get_startupinfo()
        )

        # 不管 returncode（有些版本会非0），只要执行过就认为成功
        config["tp_license_accepted"] = True
        run_on_ui_thread(save_config)

        log("✅ TexturePacker license 已处理（仅一次）")

    except Exception as e:
        log(f"❌ license 处理失败: {e}")

def start_process():
    global is_processing, active_spine_compat
    # 🚫 防止重复点击
    if is_processing:
        log("⚠️ 正在处理中，请勿重复点击")
        return
    if not check_required_tools():
        return
    is_processing = True
    active_spine_compat = (
        res_type.get() == "spine" and bool(spine_compat_var.get())
    )
    save_config()
    progress_tracker.reset("0%  准备处理中")
    # 🔒 按钮置灰
    start_btn.config(state="disabled", text="处理中...")

    t = threading.Thread(target=process_wrapper)
    t.daemon = True
    t.start()

def get_dir_size(path, file_filter=None):
    total = 0
    for root, _, files in os.walk(path):
        for f in files:
            if file_filter and not file_filter(f):
                continue
            try:
                total += os.path.getsize(os.path.join(root, f))
            except:
                pass
    return total

def format_size(size):
    for unit in ["B", "KB", "MB", "GB"]:
        if size < 1024:
            return f"{size:.2f} {unit}"
        size /= 1024
    return f"{size:.2f} TB"

def calculate_package_size():
    target = target_var.get()

    if not os.path.exists(target):
        messagebox.showerror("错误", "目标目录不存在")
        return

    program_dir = os.path.join(target, "program")
    spine_dir = os.path.join(target, "program", "spine")

    log("=== 开始统计包体 ===")

    # ---------------- atlas ----------------
    atlas_dir = os.path.join(program_dir, "atlas")
    atlas_size = get_dir_size(atlas_dir) if os.path.exists(atlas_dir) else 0
    log(f"atlas: {format_size(atlas_size)}")

    # ---------------- bg ----------------
    bg_dir = os.path.join(program_dir, "bg")
    bg_size = get_dir_size(bg_dir) if os.path.isdir(bg_dir) else 0
    log(f"bg: {format_size(bg_size)}")

    # ---------------- fonts ----------------
    fonts_dir = os.path.join(program_dir, "fonts")
    fonts_size = get_dir_size(fonts_dir) if os.path.exists(fonts_dir) else 0
    log(f"fonts: {format_size(fonts_size)}")

    # ---------------- part (只统计json) ----------------
    part_dir = os.path.join(program_dir, "part")
    part_size = get_dir_size(
        part_dir,
        file_filter=lambda f: f.lower().endswith(".json")
    ) if os.path.exists(part_dir) else 0

    log(f"part(json): {format_size(part_size)}")

    # ---------------- spine ----------------
    spine_size = get_dir_size(spine_dir) if os.path.exists(spine_dir) else 0
    log(f"spine（保留目录结构）: {format_size(spine_size)}")

    # ---------------- 汇总 ----------------
    log("----- 总计 -----")
    total_size = get_dir_size(program_dir) if os.path.isdir(program_dir) else 0
    log(f"Program 总包体: {format_size(total_size)}")

    messagebox.showinfo(
        "统计完成",
        f"Spine: {format_size(spine_size)}\nBG: {format_size(bg_size)}\nProgram 总包体: {format_size(total_size)}"
    )

def process_wrapper():
    start_time = time.perf_counter()
    success = False

    try:
        # check_texturepacker()
        success = process_files()
    except Exception as e:
        log(f"❌ 处理失败: {e}")
    finally:
        total = time.perf_counter() - start_time
        # 回到主线程恢复UI
        root_ui.after(0, lambda total=total, success=success: on_process_done(success, total))

def on_process_done(success, total):
    global is_processing

    is_processing = False

    if not success and int(progress["value"]) == 0:
        progress_tracker.reset("0%  已取消")

    # 🔓 恢复按钮
    start_btn.config(state="normal", text="开始处理" if language_var.get() == "zh" else "Start")

    log(f"⏱️ 总耗时: {total:.2f} 秒")
    if success:
        log("✅ 已完成，可再次操作")
    else:
        log("⚠️ 处理未完成")


def _required_tool_keys():
    selected = res_type.get()
    required = set()
    mode = process_mode.get() if selected == "spine" else ui_process_mode.get()
    if mode in ("imagemagick", "png", "jpg") or selected == "ui":
        required.add("imagemagick")
    if mode == "basis":
        required.add("basis")
    if selected == "spine" and spine_compat_var.get():
        required.add("spine_converter")
    if selected == "ui":
        required.add("texturepacker")
    if selected == "video":
        required.add("ffmpeg")
    return required


def _refresh_tool_paths():
    global IMAGEMAGICK_EXE, BASISU_EXE, TEXTUREPACKER_EXE, SPINE_CONVERTER_EXE, FFMPEG_EXE
    found = inspect_tools(DATA_DIR, tool_paths)
    IMAGEMAGICK_EXE = found["imagemagick"] or IMAGEMAGICK_EXE
    BASISU_EXE = found["basis"] or BASISU_EXE
    TEXTUREPACKER_EXE = found["texturepacker"] or TEXTUREPACKER_EXE
    SPINE_CONVERTER_EXE = found["spine_converter"] or SPINE_CONVERTER_EXE
    FFMPEG_EXE = found["ffmpeg"] or FFMPEG_EXE
    for key, path in found.items():
        if path:
            tool_paths[key] = path
    return found


def check_required_tools():
    found = _refresh_tool_paths()
    missing = [key for key in _required_tool_keys() if not found.get(key) and not os.path.isfile({
        "imagemagick": IMAGEMAGICK_EXE, "basis": BASISU_EXE, "texturepacker": TEXTUREPACKER_EXE,
        "spine_converter": SPINE_CONVERTER_EXE, "ffmpeg": FFMPEG_EXE,
    }[key])]
    if not missing:
        log("✅ 工具检查通过，开始处理")
        save_config()
        return True

    lines = ["缺少当前功能需要的工具：", ""]
    for key in missing:
        name, _, purpose, _ = TOOL_INFO[key]
        lines.append(f"• {name}：{purpose}")
    lines.extend(["", "可自动搜索、手动指定路径，或打开官网下载页面。"])
    dialog = Toplevel(root_ui)
    dialog.title("工具检查 / Tool check")
    dialog.transient(root_ui)
    dialog.grab_set()
    ttk.Label(dialog, text="处理前需要准备工具", font=("Microsoft YaHei UI", 12, "bold")).pack(anchor="w", padx=20, pady=(18, 8))
    ttk.Label(dialog, text="\n".join(lines), justify="left", wraplength=520).pack(anchor="w", padx=20)
    actions = ttk.Frame(dialog)
    actions.pack(fill="x", padx=20, pady=18)

    def manual_pick():
        for key in missing:
            name, filename, _, _ = TOOL_INFO[key]
            selected = filedialog.askopenfilename(parent=dialog, title=f"选择 {name}", filetypes=[(filename, filename), ("Executable", "*.exe")])
            if selected:
                tool_paths[key] = selected
        _refresh_tool_paths()
        dialog.destroy()
        check_required_tools()

    def open_downloads():
        for key in missing:
            webbrowser.open(TOOL_INFO[key][3])

    ttk.Button(actions, text="自动搜索", command=lambda: (dialog.destroy(), _refresh_tool_paths(), check_required_tools())).pack(side="left")
    ttk.Button(actions, text="手动指定路径", command=manual_pick).pack(side="left", padx=8)
    ttk.Button(actions, text="前往官网下载", command=open_downloads).pack(side="left")
    ttk.Button(actions, text="取消", command=dialog.destroy).pack(side="right")
    root_ui.wait_window(dialog)
    return False

# -------------------- GUI --------------------
root_ui = TkinterDnD.Tk() if DND_AVAILABLE else Tk()
root_ui.title(f"SpineSlim v{APP_VERSION}")
window_width = min(1040, root_ui.winfo_screenwidth() - 80)
window_height = min(860, root_ui.winfo_screenheight() - 90)
root_ui.geometry(f"{window_width}x{window_height}")
root_ui.minsize(min(880, window_width), min(720, window_height))
try:
    root_ui.iconbitmap(APP_ICON_FILE)
except TclError:
    pass

config = load_config()
tool_paths = dict(config.get("tool_paths", {}))
source_var = StringVar(value=config.get("source", ""))
target_var = StringVar(value=config.get("target", ""))
process_mode = StringVar(value=config.get("spine_texture_format", "original"))
ui_process_mode = StringVar(value=config.get("ui_texture_format", "original"))
language_var = StringVar(value=config.get("language", "zh") if config.get("language", "zh") in ("zh", "en") else "zh")
res_type = StringVar(value=config.get("res_type", "spine"))
webp_quality_var = IntVar(value=config.get("webp_quality", 50))
spine_compat_var = BooleanVar(value=False)
force_bg_var = BooleanVar(value=config.get("force_bg", False))
video_transparency_var = BooleanVar(value=config.get("video_transparency", True))
video_crf_var = IntVar(value=config.get("video_crf", 36))


def on_resource_type_changed():
    selected = res_type.get()
    if selected != "spine":
        spine_compat_var.set(False)
    show_resource_options(selected)
    save_config()


def on_language_changed(event=None):
    selected = event.widget.get() if event is not None else language_var.get()
    language_var.set("zh" if selected == "中文 / Chinese" else "en")
    apply_language(language_var.get())
    save_config()

interface = build_interface(
    root_ui,
    {
        "source": source_var,
        "target": target_var,
        "process_mode": process_mode,
        "ui_process_mode": ui_process_mode,
        "language": language_var,
        "res_type": res_type,
        "quality": webp_quality_var,
        "spine_compat": spine_compat_var,
        "force_bg": force_bg_var,
        "video_alpha": video_transparency_var,
        "video_crf": video_crf_var,
    },
    {
        "select_source": select_source,
        "select_target": select_target,
        "save": save_config,
        "resource_changed": on_resource_type_changed,
        "language_changed": on_language_changed,
        "start": start_process,
        "statistics": calculate_package_size,
    },
    APP_VERSION,
)
globals().update(interface)
progress_tracker = ProgressTracker(root_ui, progress, progress_text_var)

if DND_AVAILABLE:
    source_entry.drop_target_register(DND_FILES)
    source_entry.dnd_bind("<<Drop>>", drop_source)
    target_entry.drop_target_register(DND_FILES)
    target_entry.dnd_bind("<<Drop>>", drop_target)
_schedule_log_flush()

log(f"SpineSlim v{APP_VERSION} | 外部工具目录: {DATA_DIR}")
for _tool_key, _tool_path in _refresh_tool_paths().items():
    if _tool_path:
        log(f"✅ 已检测到 {TOOL_INFO[_tool_key][0]}（路径：{_tool_path}）")

if not DND_AVAILABLE:
    dnd_warning = (
        "tkinterdnd2 is not installed. The app is running without drag-and-drop support.\n"
        "Install it with: python -m pip install tkinterdnd2"
    )
    log(f"[warning] {dnd_warning.replace('\n', ' ')}")
    root_ui.after(
        100,
        lambda: messagebox.showwarning("Drag-and-drop disabled", dnd_warning),
    )

root_ui.mainloop()
