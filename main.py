import os
import shutil
import json
import threading
import subprocess
import sys
import webbrowser
from tkinter import *
from tkinter import filedialog, messagebox, ttk
try:
    from tkinterdnd2 import TkinterDnD, DND_FILES
    DND_AVAILABLE = True
except ImportError:
    TkinterDnD = None
    DND_FILES = None
    DND_AVAILABLE = False
import re
import os
import struct
from concurrent.futures import ThreadPoolExecutor, as_completed
import time
from pathlib import Path
from app_runtime import APP_VERSION, get_application_directory

from spine_tools.atlas import process_atlas_textures
from spine_tools.converter import check_spine_converter
from spine_tools.pipeline import collect_spine_copy_tasks, preflight_spine_paths, process_spine_directories
from video_tools import VIDEO_EXTENSIONS, convert_video_pair


MAX_WORKERS = max(4, os.cpu_count() or 4)
LOG_FLUSH_INTERVAL_MS = 50
MAX_LOG_LINES = 1000
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
APP_ICON_FILE = os.path.join(RESOURCE_DIR, "icon.ico")
DEFAULT_CONFIG_FILE = os.path.join(RESOURCE_DIR, "config.json")
CONFIG_FILE = os.path.join(DATA_DIR, "config.json")
IMAGEMAGICK_DIR = os.path.join(DATA_DIR, "ImageMagick-7.1.2-19-portable-Q16-HDRI-x64")
IMAGEMAGICK_EXE = os.path.join(IMAGEMAGICK_DIR, "magick.exe")
BASISU_EXE = os.path.join(DATA_DIR, "basisu.exe")
TEXTUREPACKER_DIR = os.path.join(DATA_DIR, "TexturePacker/bin")
TEXTUREPACKER_EXE = os.path.join(TEXTUREPACKER_DIR, "TexturePacker.exe")
BMFONT_EXE = os.path.join(DATA_DIR, "bmfont1.14a", "bmfont64.com")
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
    return {"source": "", "target": "", "res_type": "spine", "process_mode": "imagemagick", "webp_quality": 50, "force_bg": False, "video_transparency": True, "video_crf": 36, "tp_license_accepted": False}

def save_config():
    data = {
        "source": source_var.get(),
        "target": target_var.get(),
        "res_type": res_type.get(),
        "process_mode": process_mode.get(),
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
    with _log_lock:
        _log_buffer.append(str(msg))
    _schedule_log_flush()


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
            self.stage_text = text
            self.is_complete = False
        self._schedule_refresh()

    def start(self, stages, text="0%  准备中"):
        with self.lock:
            self.stages = stages or [{"name": "处理中", "weight": 1}]
            self.stage_index = -1
            self.stage_total = 1
            self.stage_done = 0
            self.stage_text = text
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
            return f"{base} · {detail}"
        return base

    def _schedule_refresh(self):
        with self.lock:
            if self.refresh_scheduled:
                return
            self.refresh_scheduled = True
        self.root.after(0, self._apply)

    def _apply(self):
        with self.lock:
            ratio = self._compute_ratio()
            stage_text = self.stage_text
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
    {"name": "转换 Mobile 纹理", "weight": 17},
    {"name": "转换 PC 纹理", "weight": 17},
    {"name": "修复 Atlas 引用", "weight": 6},
]

UI_PROGRESS_STAGES = [
    {"name": "清理 Program 目录", "weight": 8},
    {"name": "分类复制资源", "weight": 38},
    {"name": "复制艺术字源文件", "weight": 10},
    {"name": "转换 BG 资源", "weight": 14},
    {"name": "生成 BG Mobile/PC", "weight": 12},
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
        webp_path = png_path[:-4] + ".webp"

        run_hidden([
            IMAGEMAGICK_EXE,
            png_path,
            "-quality", str(self.quality),
            "-define", "webp:method=6",
            webp_path
        ], check=True)

        if self.output_ext == ".webp":
            return webp_path

        output_path = png_path[:-4] + self.output_ext
        if os.path.normcase(os.path.abspath(output_path)) == os.path.normcase(os.path.abspath(png_path)):
            os.remove(png_path)
        elif os.path.exists(output_path):
            os.remove(output_path)

        os.replace(webp_path, output_path)
        return output_path

    def get_output_ext(self):
        return self.output_ext


class PngConverter(ImageConverter):
    """Rewrite PNG files as real, losslessly compressed PNG files."""

    def convert(self, png_path):
        temporary_path = png_path + ".tmp.png"
        run_hidden([
            IMAGEMAGICK_EXE,
            png_path,
            "-strip",
            "-define", "png:compression-level=9",
            "-define", "png:compression-filter=5",
            "-define", "png:compression-strategy=1",
            temporary_path,
        ], check=True)
        os.replace(temporary_path, png_path)
        return png_path

    def get_output_ext(self):
        return ".png"

# ------basis
class BasisConverter(ImageConverter):
    def convert(self, png_path):
        basis_path = png_path[:-4] + ".basis"

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


def process_bg_assets(bg_dir, mobile_bg_dir, pc_bg_dir, progress_callback=None):
    bg_files = [
        file for file in os.listdir(bg_dir)
        if os.path.isfile(os.path.join(bg_dir, file))
    ]

    def worker(file_name):
        src_path = os.path.join(bg_dir, file_name)
        lower_name = file_name.lower()

        if lower_name.endswith((".webp", ".jpg", ".jpeg", ".png")):
            shutil.copy2(src_path, os.path.join(pc_bg_dir, file_name))

            width, height = get_image_size_fast(src_path)
            dst_path = os.path.join(mobile_bg_dir, file_name)

            try:
                if width and height and (width > 1024 or height > 1024):
                    run_hidden([
                        IMAGEMAGICK_EXE,
                        src_path,
                        "-resize", "1024x1024>",
                        dst_path
                    ], check=True)
                    action = f"缩小mobile: {file_name} ({width}x{height})"
                else:
                    shutil.copy2(src_path, dst_path)
                    action = f"复制mobile: {file_name}"
            except Exception as e:
                shutil.copy2(src_path, dst_path)
                action = f"处理mobile失败后回退复制: {file_name} -> {e}"

            if os.path.exists(src_path):
                os.remove(src_path)

            return action

        shutil.copy2(src_path, os.path.join(pc_bg_dir, file_name))
        shutil.copy2(src_path, os.path.join(mobile_bg_dir, file_name))
        return f"复制非图片文件: {file_name}"

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        futures = {executor.submit(worker, file_name): file_name for file_name in bg_files}

        for future in as_completed(futures):
            file_name = futures[future]
            try:
                message = future.result()
                log(message)
            except Exception as e:
                log(f"BG 处理失败: {file_name} -> {e}")
            finally:
                if progress_callback:
                    progress_callback(file_name)

    return len(bg_files)


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
def fix_atlas_references(folder, converter: ImageConverter, progress_callback=None):
    log("修复 atlas 引用")

    target_ext = converter.get_output_ext()
    modified = 0

    atlas_files = []
    for root, _, files in os.walk(folder):
        for f in files:
            if f.endswith(".atlas"):
                atlas_files.append(os.path.join(root, f))

    for path in atlas_files:
        f = os.path.basename(path)
        try:
            with open(path, "r", encoding="utf-8") as file:
                lines = file.readlines()

            new_lines = []
            changed = False

            for line in lines:
                stripped = line.strip()

                # 只替换“纯图片文件名”
                if stripped.lower().endswith(".png") \
                   and " " not in stripped \
                   and ":" not in stripped:

                    new_line = line.replace(".png", target_ext)
                    new_lines.append(new_line)
                    changed = True
                else:
                    new_lines.append(line)

            if changed:
                with open(path, "w", encoding="utf-8") as file:
                    file.writelines(new_lines)

                modified += 1
                log(f"已修复: {f}")
        finally:
            if progress_callback:
                progress_callback(f)

    log(f"atlas 修复完成: {modified} 个")
# -------------------- 图片转换 --------------------
def convert_images(folder, converter: ImageConverter, progress_callback=None):
    log(f"开始转换: {converter.__class__.__name__}")

    png_files = [
        os.path.join(folder, f)
        for f in os.listdir(folder)
        if f.lower().endswith(".png")
    ]

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
def convert_png_to_basis(folder):
    log("开始 Basis 转换")

    png_files = []
    for root, _, files in os.walk(folder):
        for f in files:
            if f.lower().endswith(".png"):
                png_files.append(os.path.join(root, f))

    total = len(png_files)
    log(f"找到 {total} 个 PNG")

    for i, png_path in enumerate(png_files):
        basis_path = os.path.splitext(png_path)[0] + ".basis"

        try:
            run_hidden([
                BASISU_EXE,
                "-q", "255",
                "-file", png_path,
                "-output_file", basis_path
            ], check=True)

            log(f"[{i+1}/{total}] 转换: {os.path.basename(png_path)}")

        except Exception as e:
            log(f"失败: {png_path} -> {e}")

    log("Basis 转换完成")

def process_atlas_parallel(program_dir, quality, progress_callback=None, excluded_dirs=None):
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
            executor.submit(process_single_atlas, program_dir, item, quality): item
            for item in tasks
        }

        for future in as_completed(futures):
            item = futures[future]
            future.result()
            if progress_callback:
                progress_callback(item)

    log("🎉 全部 atlas 处理完成")

def process_single_atlas(program_dir, item, quality):
    item_path = os.path.join(program_dir, item)

    png_count = sum(1 for f in os.listdir(item_path) if f.lower().endswith(".png"))
    if png_count == 0:
        return

    log(f"为 {item} 打图集 ({png_count} 个 PNG 文件)...")

    success = pack_atlas(item_path, item, item)

    if not success:
        log(f"❌ {item} 图集生成失败")
        return

    log(f"开始转换 {item} 的 atlas PNG 到 WebP...")

    atlas_dir = os.path.join(program_dir, "atlas")
    atlas_convert_count = 0

    for file in os.listdir(atlas_dir):
        if file.startswith(item) and file.endswith('.json'):
            json_path = os.path.join(atlas_dir, file)

            png_file = file.replace('.json', '.png')
            png_path = os.path.join(atlas_dir, png_file)

            webp_file = file.replace('.json', '.webp')

            if os.path.exists(png_path):
                try:
                    if quality < 0 or quality > 100:
                        quality = 50

                    converter = WebPConverter(quality)
                    webp_path = converter.convert(png_path)
                    os.remove(png_path)

                    atlas_convert_count += 1

                    with open(json_path, 'r', encoding='utf-8') as f:
                        data = json.load(f)

                    data['meta']['image'] = webp_file

                    with open(json_path, 'w', encoding='utf-8') as f:
                        json.dump(data, f, indent=2)

                except Exception as e:
                    log(f"❌ 转换失败: {e}")

    log(f"✅ {item} 完成（{atlas_convert_count} 个）")

# -------------------- 打图集 --------------------
def pack_atlas(source_dir, atlas_name, first_part):
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
        source_dir_norm = os.path.normpath(source_dir).replace("\\", "/")
        n = "{n}";
        cmd = [
            TEXTUREPACKER_EXE,
            "--multipack",  # 启用自动打多个图集的模式
            "--data", output_json_base+ n + ".json",
            "--sheet", output_sheet_base + n + ".png",
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
        print(f"❌ 没有匹配的图片: {folder_path}")
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

    print(f"✅ 完成: {folder_path}")

def get_art_group_name(root):
    return os.path.basename(os.path.normpath(root))

#处理艺术字
def process_winnum_fonts(program_dir, progress_callback=None, font_dir_names=None):
    log("=== 开始处理艺术字 BMFont ===")

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

    if not os.path.exists(BMFONT_EXE):
        log(f"错误: 未找到 BMFont: {BMFONT_EXE}")
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


def create_font_json(bmfontdata, fc_data, aim):

    # 清除旧 icon 区域
    fcstring = re.sub(r"# imported icon images[\s\S]*", "# imported icon images\n", fcstring)

    num_ascii = ""
    image_resource_path = ""
    idx = 0

    for name in fc_data["num_name"]:
        normalized_name = normalize_art_char(name)
        ascii_code = ord(normalized_name)

        if name == '。':
            ascii_code = ord('.')

        image_path = fc_data["num_PNG_path"][idx]
        idx += 1

        image_resource_path += f'icon="{image_path}",{ascii_code},0,0,0\n'
        num_ascii += f"{ascii_code},"

    # 替换 chars
    fcstring = re.sub(r"chars=([\d,-]+)", f"chars={num_ascii}", fcstring)

    # 拼接 icon
    fcstring += image_resource_path

    # Windows 路径
    fcstring = fcstring.replace("/", "\\")

    # 写回 bmfc
    with open(bmfontdata["bmfc_path"], "w", encoding="utf-8") as f:
        f.write(fcstring)

    # 创建目录
    os.makedirs(bmfontdata["savefile_path"], exist_ok=True)

    # 执行 bmfont
    cmd = f'bmfont64.com -c "{bmfontdata["bmfc_path"]}" -o "{bmfontdata["outfntpath"]}"'
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True)

    if result.returncode == 0:
        # 读取 fnt
        with open(bmfontdata["outfntpath"], "r", encoding="utf-8") as f:
            fntstring = f.read()

        # 替换 font name
        fntstring = re.sub(r'info face="(.*?)"', f'info face="{fc_data["fontname"]}"', fntstring)
        fntstring = re.sub(r'file="(.*?)"', f'file="{fc_data["fontname"]}.png"', fntstring)

        with open(bmfontdata["outfntpath"], "w", encoding="utf-8") as f:
            f.write(fntstring)

        # 处理 png rename
        temp_png = bmfontdata["outpngpath"].replace(".png", "_0.png")
        if os.path.exists(temp_png):
            os.rename(temp_png, bmfontdata["outpngpath"])

        # 拷贝
        if os.path.exists(bmfontdata["outfntpath"]) and os.path.exists(bmfontdata["outpngpath"]):
            shutil.copy2(bmfontdata["outfntpath"], bmfontdata["copyfntpath"])
            shutil.copy2(bmfontdata["outpngpath"], bmfontdata["copypngpath"])

        print(f"字体生成成功: {fc_data['fontname']}")
    else:
        print("bmfont 执行失败：", result.stderr)

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
    if last_folder != selected_type:
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
    mp_count = 0
    pc_count = 0
    ui_count = 0
    video_count = 0

    if type == "spine":
        compat_enabled = active_spine_compat
        tasks = collect_spine_copy_tasks(
            Path(source), Path(target) / "program" / "spine"
        )

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
        mobile_dir = os.path.join(target, "mobile")
        pc_dir = os.path.join(target, "pc")
        os.makedirs(mobile_dir, exist_ok=True)
        os.makedirs(pc_dir, exist_ok=True)

        # ✅ 先清空旧内容
        log("清理旧文件...")
        cleanup_total = len(os.listdir(mobile_dir)) + len(os.listdir(pc_dir))
        progress_tracker.begin_stage(0, cleanup_total or 1)
        clear_directory(
            mobile_dir,
            lambda _name: progress_tracker.advance(detail="清理 mobile")
        )
        clear_directory(
            pc_dir,
            lambda _name: progress_tracker.advance(detail="清理 pc")
        )
        progress_tracker.finish_stage("清理完成")
        log("清理完成")

        mp_count = 0
        pc_count = 0

        progress_tracker.begin_stage(1, len(tasks) or 1)
        for root, f in tasks:
            folder = os.path.basename(root).lower()
            src = os.path.join(root, f)

            if "mp" in folder:
                copy_safe(src, mobile_dir)
                mp_count += 1
                log(f"MP -> {f}")
            elif "pc" in folder:
                copy_safe(src, pc_dir)
                pc_count += 1
                log(f"PC -> {f}")

            progress_tracker.advance(detail=f)
        progress_tracker.finish_stage("资源复制完成")

        if compat_enabled:
            spine_json_total = sum(
                1
                for folder in (mobile_dir, pc_dir)
                for _path in Path(folder).rglob("*.json")
            )
            progress_tracker.begin_stage(2, spine_json_total or 1)
            log("开始 Spine 4.2.11 升级与 Setup Pose attachment 迁移...")
            batch_result = process_spine_directories(
                [Path(mobile_dir), Path(pc_dir)],
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

        mode = process_mode.get()
        converter = None

        if mode == "imagemagick":
            quality = webp_quality_var.get()

            # 防御（防止用户乱填）
            if quality < 0 or quality > 100:
                quality = 50

            converter = WebPConverter(quality)
        elif mode == "basis":
            converter = BasisConverter()

        mobile_png_total = sum(
            1 for f in os.listdir(mobile_dir) if f.lower().endswith(".png")
        )
        progress_tracker.begin_stage(3, mobile_png_total or 1)
        if compat_enabled:
            mobile_texture_result = process_atlas_textures(Path(mobile_dir), converter)
            log(
                "Mobile纹理: "
                f"converted={mobile_texture_result.converted}, "
                f"basis_skipped={mobile_texture_result.basis_skipped}, "
                f"atlas_modified={mobile_texture_result.atlas_modified}"
            )
        else:
            convert_images(
                mobile_dir,
                converter,
                lambda msg: progress_tracker.advance(detail=msg)
            )
        progress_tracker.finish_stage("Mobile 转换完成")

        pc_png_total = sum(
            1 for f in os.listdir(pc_dir) if f.lower().endswith(".png")
        )
        progress_tracker.begin_stage(4, pc_png_total or 1)
        if compat_enabled:
            pc_texture_result = process_atlas_textures(Path(pc_dir), converter)
            log(
                "PC纹理: "
                f"converted={pc_texture_result.converted}, "
                f"basis_skipped={pc_texture_result.basis_skipped}, "
                f"atlas_modified={pc_texture_result.atlas_modified}"
            )
        else:
            convert_images(
                pc_dir,
                converter,
                lambda msg: progress_tracker.advance(detail=msg)
            )
        progress_tracker.finish_stage("PC 转换完成")

        #配置修改
        atlas_fix_total = 0
        for folder in [mobile_dir, pc_dir]:
            for root, _, files in os.walk(folder):
                atlas_fix_total += sum(1 for f in files if f.endswith(".atlas"))

        progress_tracker.begin_stage(5, atlas_fix_total or 1)
        if compat_enabled:
            progress_tracker.advance(detail="Atlas 已按成功纹理结果更新")
            progress_tracker.finish_stage("Atlas 引用已安全更新")
        else:
            fix_atlas_references(
                mobile_dir,
                converter,
                lambda name: progress_tracker.advance(detail=name)
            )
            fix_atlas_references(
                pc_dir,
                converter,
                lambda name: progress_tracker.advance(detail=name)
            )
            progress_tracker.finish_stage("Atlas 引用修复完成")
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

        # 对bg目录下的png文件进行webp转换
        bg_dir = os.path.join(target, "program", "bg")
        quality = webp_quality_var.get()
        if quality < 0 or quality > 100:
            quality = 50
        if os.path.exists(bg_dir):
            log("开始转换 bg 目录下的 PNG 为 WebP")
            converter = None
            t0 = time.perf_counter()
            bg_png_total = sum(
                1 for f in os.listdir(bg_dir) if f.lower().endswith(".png")
            )
            progress_tracker.begin_stage(3, bg_png_total or 1)
            # Background images are resized/split first. PNG compression happens
            # after that step in the mobile and PC output directories.
            progress_tracker.finish_stage("BG 转换完成")
            log(f"⏱️ BG转换耗时: {time.perf_counter() - t0:.2f}s")
            log("bg 目录转换完成")

            # 对bg进行mobile/pc处理
            log("开始处理 bg mobile/pc...")
            mobile_bg_dir = os.path.join(bg_dir, "mobile")
            pc_bg_dir = os.path.join(bg_dir, "pc")
            os.makedirs(mobile_bg_dir, exist_ok=True)
            os.makedirs(pc_bg_dir, exist_ok=True)

            bg_file_count = sum(
                1 for file in os.listdir(bg_dir)
                if os.path.isfile(os.path.join(bg_dir, file))
            )
            progress_tracker.begin_stage(4, bg_file_count or 1)
            process_bg_assets(
                bg_dir,
                mobile_bg_dir,
                pc_bg_dir,
                lambda file_name: progress_tracker.advance(detail=file_name)
            )
            # Unity 资源约定保留 .png 后缀，但这里使用 WebP 编码压缩。
            # 必须在 mobile 缩放完成后再压缩，避免缩放阶段重新输出大 PNG。
            bg_converter = WebPConverter(quality, output_ext=".png")
            for folder in (mobile_bg_dir, pc_bg_dir):
                convert_images(
                    folder,
                    bg_converter,
                    lambda msg: progress_tracker.advance(detail=msg)
                )

            progress_tracker.finish_stage("BG PNG 压缩完成")
            progress_tracker.finish_stage("BG Mobile/PC 处理完成")
            log("bg mobile/pc 处理完成")
        else:
            progress_tracker.begin_stage(3, 1, "未发现 BG 目录")
            progress_tracker.finish_stage("无 BG 资源")
            progress_tracker.begin_stage(4, 1, "跳过 BG Mobile/PC")
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
        progress_tracker.begin_stage(5, len(atlas_tasks) or 1)
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
                art_group_names
            )
            progress_tracker.finish_stage("图集处理完成")
            log(f"⏱️ Atlas阶段耗时: {time.perf_counter() - t0:.2f}s")

        ## 处理艺术字
        t0 = time.perf_counter()
        art_font_dirs = [
            item for item in art_group_names
            if os.path.isdir(os.path.join(program_dir, item))
        ]
        progress_tracker.begin_stage(6, len(art_font_dirs) or 1)
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
        call_on_ui_thread(lambda: messagebox.showinfo("完成", f"mobile: {mp_count}\npc: {pc_count}"))
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

    total_mobile = 0
    total_pc = 0

    log("=== 开始统计包体 ===")

    # ---------------- atlas ----------------
    atlas_dir = os.path.join(program_dir, "atlas")
    atlas_size = get_dir_size(atlas_dir) if os.path.exists(atlas_dir) else 0
    log(f"atlas: {format_size(atlas_size)}")

    # ---------------- bg ----------------
    bg_mobile = os.path.join(program_dir, "bg", "mobile")
    bg_pc = os.path.join(program_dir, "bg", "pc")

    bg_mobile_size = get_dir_size(bg_mobile) if os.path.exists(bg_mobile) else 0
    bg_pc_size = get_dir_size(bg_pc) if os.path.exists(bg_pc) else 0

    total_mobile += bg_mobile_size
    total_pc += bg_pc_size

    log(f"bg mobile: {format_size(bg_mobile_size)}")
    log(f"bg pc: {format_size(bg_pc_size)}")

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
    spine_mobile = os.path.join(spine_dir, "mobile")
    spine_pc = os.path.join(spine_dir, "pc")

    spine_mobile_size = get_dir_size(spine_mobile) if os.path.exists(spine_mobile) else 0
    spine_pc_size = get_dir_size(spine_pc) if os.path.exists(spine_pc) else 0

    total_mobile += spine_mobile_size
    total_pc += spine_pc_size

    log(f"spine mobile: {format_size(spine_mobile_size)}")
    log(f"spine pc: {format_size(spine_pc_size)}")

    # ---------------- 汇总 ----------------
    log("----- 总计 -----")
    log(f"Mobile 总包体: {format_size(total_mobile)}")
    log(f"PC 总包体: {format_size(total_pc)}")

    messagebox.showinfo(
        "统计完成",
        f"Mobile: {format_size(total_mobile)}\nPC: {format_size(total_pc)}"
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
    start_btn.config(state="normal", text="开始处理")

    log(f"⏱️ 总耗时: {total:.2f} 秒")
    if success:
        log("✅ 已完成，可再次操作")
    else:
        log("⚠️ 处理未完成")

# -------------------- GUI --------------------
root_ui = TkinterDnD.Tk() if DND_AVAILABLE else Tk()
root_ui.title(f"SpineSlim v{APP_VERSION}")
root_ui.geometry("650x590")
try:
    root_ui.iconbitmap(APP_ICON_FILE)
except TclError:
    pass

config = load_config()
source_var = StringVar(value=config.get("source", ""))
target_var = StringVar(value=config.get("target", ""))
process_mode = StringVar(value=config.get("process_mode", "imagemagick"))
res_type = StringVar(value=config.get("res_type", "spine"))
webp_quality_var = IntVar(value=config.get("webp_quality", 50))
spine_compat_var = BooleanVar(value=False)
force_bg_var = BooleanVar(value=config.get("force_bg", False))
video_transparency_var = BooleanVar(value=config.get("video_transparency", True))
video_crf_var = IntVar(value=config.get("video_crf", 36))


def on_resource_type_changed():
    selected = res_type.get()
    if selected == "spine":
        spine_compat_frame.grid()
        force_bg_frame.grid_remove()
        video_options_frame.grid_remove()
        quality_frame.grid()
    elif selected == "ui":
        spine_compat_var.set(False)
        spine_compat_frame.grid_remove()
        force_bg_frame.grid()
        video_options_frame.grid()
        quality_frame.grid()
    else:
        spine_compat_var.set(False)
        spine_compat_frame.grid_remove()
        force_bg_frame.grid_remove()
        video_options_frame.grid()
        quality_frame.grid_remove()
    save_config()

frame = Frame(root_ui)
frame.pack(pady=10)

Label(frame, text="源目录").grid(row=0, column=0)
source_entry = Entry(frame, textvariable=source_var, width=55)
source_entry.grid(row=0, column=1)
Button(frame, text="选择", command=select_source).grid(row=0, column=2)

Label(frame, text="目标目录").grid(row=1, column=0)
target_entry = Entry(frame, textvariable=target_var, width=55)
target_entry.grid(row=1, column=1)
Button(frame, text="选择", command=select_target).grid(row=1, column=2)
mode_frame = Frame(frame)
mode_frame.grid(row=2, column=1, columnspan=2, sticky="w", pady=10)

Label(mode_frame, text="处理方式:").pack(side=LEFT)

Radiobutton(mode_frame, text="ImageMagick (WebP)",
            variable=process_mode, value="imagemagick",
            command=save_config).pack(side=LEFT, padx=(10, 5))

Radiobutton(mode_frame, text="BasisU (KTX2)",
            variable=process_mode, value="basis",
            command=save_config).pack(side=LEFT, padx=5)

type_frame = Frame(frame)
type_frame.grid(row=3, column=1, columnspan=2, sticky="w", pady=5)

Label(type_frame, text="资源类型:").pack(side=LEFT)

Radiobutton(type_frame, text="spine",
            variable=res_type, value="spine",
            command=on_resource_type_changed).pack(side=LEFT, padx=(10, 5))

Radiobutton(type_frame, text="ui",
            variable=res_type, value="ui",
            command=on_resource_type_changed).pack(side=LEFT, padx=5)

Radiobutton(type_frame, text="video",
            variable=res_type, value="video",
            command=on_resource_type_changed).pack(side=LEFT, padx=5)

spine_compat_frame = Frame(frame)
spine_compat_frame.grid(row=4, column=1, columnspan=2, sticky="w", pady=(0, 5))

Checkbutton(
    spine_compat_frame,
    text="升级至 Spine 4.2.11 并处理 attachment 首帧",
    variable=spine_compat_var,
    onvalue=True,
    offvalue=False,
).pack(anchor="w")
Label(
    spine_compat_frame,
    text="执行 clear_setup_pose，不裁剪动画关键帧",
    fg="gray",
).pack(anchor="w", padx=(22, 0))

quality_frame = Frame(frame)
quality_frame.grid(row=7, column=1, columnspan=2, sticky="w", pady=5)

force_bg_frame = Frame(frame)
force_bg_frame.grid(row=5, column=1, columnspan=2, sticky="w", pady=(0, 5))
Checkbutton(
    force_bg_frame,
    text="全部图片按背景图处理（跳过碎图打图集）",
    variable=force_bg_var,
    onvalue=True,
    offvalue=False,
    command=save_config,
).pack(anchor="w")
video_options_frame = Frame(frame)
video_options_frame.grid(row=6, column=1, columnspan=2, sticky="w", pady=(0, 5))
Checkbutton(
    video_options_frame,
    text="视频保留透明通道（WebM / VP9）",
    variable=video_transparency_var,
    onvalue=True,
    offvalue=False,
    command=save_config,
).pack(anchor="w")
video_quality_row = Frame(video_options_frame)
video_quality_row.pack(anchor="w", pady=(3, 0))
Label(video_quality_row, text="视频质量 CRF:").pack(side=LEFT)
Entry(video_quality_row, textvariable=video_crf_var, width=5).pack(side=LEFT, padx=(5, 0))
Label(video_quality_row, text="(0-63，越大体积越小，推荐 32-40)").pack(side=LEFT)

Label(quality_frame, text="WebP质量:").pack(side=LEFT)

Entry(quality_frame, textvariable=webp_quality_var, width=5).pack(side=LEFT)
Label(quality_frame, text="(0-100)").pack(side=LEFT)

if res_type.get() == "spine":
    force_bg_frame.grid_remove()
    video_options_frame.grid_remove()
elif res_type.get() == "ui":
    spine_compat_frame.grid_remove()
else:
    spine_compat_frame.grid_remove()
    force_bg_frame.grid_remove()
    quality_frame.grid_remove()

# 拖拽支持
if DND_AVAILABLE:
    source_entry.drop_target_register(DND_FILES)
    source_entry.dnd_bind("<<Drop>>", drop_source)
    target_entry.drop_target_register(DND_FILES)
    target_entry.dnd_bind("<<Drop>>", drop_target)

start_btn = Button(
    root_ui,
    text="开始处理",
    command=start_process,
    bg="green",
    fg="white",
    width=20
)
start_btn.pack(pady=10)

Button(
    root_ui,
    text="统计包体",
    command=calculate_package_size,
    bg="blue",
    fg="white",
    width=20
).pack(pady=5)

progress_text_var = StringVar(value="0%  待开始")
Label(root_ui, textvariable=progress_text_var, anchor="w").pack(fill="x", padx=20)

progress = ttk.Progressbar(root_ui, length=500, mode="determinate")
progress.pack(pady=5)
progress_tracker = ProgressTracker(root_ui, progress, progress_text_var)

github_frame = Frame(root_ui)
github_frame.pack(side=BOTTOM, fill="x", padx=10, pady=(0, 8))
github_link = Label(
    github_frame,
    text="GitHub: github.com/Alone9898/SpineSlim",
    fg="#0969da",
    cursor="hand2",
)
github_link.pack(side=LEFT)
github_link.bind(
    "<Button-1>",
    lambda event: webbrowser.open("https://github.com/Alone9898/SpineSlim"),
)
ttk.Button(
    github_frame,
    text="喜欢这个工具？给个 Star ★",
    command=lambda: webbrowser.open("https://github.com/Alone9898/SpineSlim"),
).pack(side=RIGHT)

log_text = Text(root_ui, height=18)
log_text.pack(fill="both", expand=True, padx=10, pady=10)
_schedule_log_flush()

log(f"SpineSlim v{APP_VERSION} | 外部工具目录: {DATA_DIR}")

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
