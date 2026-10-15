import tkinter as tk
from tkinter import ttk
import webbrowser
import sys
from pathlib import Path


REPOSITORY_URL = "https://github.com/Alone9898/SpineSlim"

TRANSLATIONS = {
    "让资源更轻，让工作更简单。": "Make assets lighter, make work simpler.",
    "WINDOWS  /  v": "WINDOWS  /  v",
    "01  项目路径": "01  Project paths",
    "源目录": "Source folder",
    "目标目录": "Output folder",
    "选择文件夹": "Choose folder",
    "02  处理设置": "02  Processing",
    "Spine 动画": "Spine animation",
    "UI 图片": "UI images",
    "视频": "Video",
    "纹理格式": "Texture format",
    "原格式 · 默认": "Original · default",
    "WebP · 有损压缩": "WebP · lossy",
    "PNG · 仅无损压缩": "PNG · lossless",
    "JPG · 白底，无透明": "JPG · white background",
    "Basis · GPU 压缩": "Basis · GPU compressed",
    "视频格式": "Video format",
    "升级至 Spine 4.2.11": "Upgrade to Spine 4.2.11",
    "任意目录名 · 保留源目录结构输出": "Any folder name · preserve source structure",
    "启用后迁移 Setup Pose attachment，保留已有动画关键帧": "When enabled, migrate Setup Pose attachments and preserve animation keys",
    "全部图片按背景图处理": "Process all images as backgrounds",
    "保留视频透明通道 · WebM / VP9": "Preserve video alpha · WebM / VP9",
    "视频 CRF": "Video CRF",
    "越大体积越小 · 建议 32–40": "Higher means smaller · recommended 32–40",
    "WebP 质量": "WebP quality",
    "JPG 质量": "JPG quality",
    "0–100 · 越高越清晰": "0–100 · higher means clearer",
    "处理会更新目标输出目录，请先备份素材。": "Processing updates the output folder. Back up assets first.",
    "统计包体": "Package stats",
    "开始处理": "Start",
    "03  运行日志": "03  Activity log",
    "文件状态": "File status",
    "喜欢这个工具？给个 Star ★": "Like this tool? Give it a Star ★",
}

FORMAT_LABELS = {
    "zh": ["原格式 · 默认", "WebP · 有损压缩", "PNG · 仅无损压缩", "JPG · 白底，无透明", "Basis · GPU 压缩"],
    "en": ["Original · default", "WebP · lossy", "PNG · lossless", "JPG · white background", "Basis · GPU compressed"],
}
FORMAT_VALUES = {label: value for label, value in zip(FORMAT_LABELS["zh"], ("original", "imagemagick", "png", "jpg", "basis"))}
FORMAT_VALUES.update({label: value for label, value in zip(FORMAT_LABELS["en"], ("original", "imagemagick", "png", "jpg", "basis"))})


def build_interface(root, variables, commands, version):
    background = "#f3f6fb"
    foreground = "#172b4d"
    muted = "#74829a"
    accent = "#2563eb"
    root.configure(background=background)
    style = ttk.Style(root)
    style.theme_use("clam")
    style.configure(".", font=("Microsoft YaHei UI", 10), foreground=foreground)
    style.configure("Page.TFrame", background=background)
    style.configure("Card.TFrame", background="white", borderwidth=0)
    style.configure("TLabel", background="white")
    style.configure("Page.TLabel", background=background)
    style.configure("Brand.TLabel", background=background, font=("Segoe UI", 22, "bold"))
    style.configure("Subtitle.TLabel", background=background, foreground=muted)
    style.configure("Heading.TLabel", font=("Microsoft YaHei UI", 12, "bold"))
    style.configure("Muted.TLabel", foreground=muted)
    style.configure("Version.TLabel", background="#e7efff", foreground=accent, padding=(12, 5))
    style.configure("TEntry", padding=(10, 6), fieldbackground="#f8faff", bordercolor="#dce4ef")
    style.map("TEntry", bordercolor=[("focus", accent)])
    style.configure("TCombobox", padding=(10, 6), fieldbackground="#f8faff", background="#f8faff", bordercolor="#dce4ef", arrowcolor=muted)
    style.map("TCombobox", fieldbackground=[("readonly", "#f8faff"), ("focus", "#f8faff")], bordercolor=[("focus", accent), ("hover", accent)], arrowcolor=[("focus", accent)])
    style.configure("TSpinbox", padding=(8, 7), fieldbackground="#f8faff", bordercolor="#dce4ef")
    style.configure("TButton", padding=(16, 6), background="#edf3ff", foreground=accent, borderwidth=0)
    style.map("TButton", background=[("active", "#dfeaff"), ("pressed", "#d2e2ff")])
    style.configure("Primary.TButton", padding=(28, 10), background=accent, foreground="white", font=("Microsoft YaHei UI", 11, "bold"))
    style.map("Primary.TButton", background=[("disabled", "#a8bce8"), ("pressed", "#1d4ed8"), ("active", "#3474fa")], foreground=[("disabled", "#f4f7ff")])
    style.configure("Secondary.TButton", padding=(24, 10), background="#eaf0f8", foreground=foreground, font=("Microsoft YaHei UI", 11))
    style.configure("TRadiobutton", background="white", padding=(0, 5))
    style.map("TRadiobutton", background=[("active", "white")])
    style.layout("Tab.TRadiobutton", style.layout("TButton"))
    style.configure("Tab.TRadiobutton", padding=(16, 7), background="#edf2f9", foreground=muted)
    style.map("Tab.TRadiobutton", background=[("selected", accent), ("active", "#dfeaff")], foreground=[("selected", "white")])
    style.configure("TCheckbutton", background="white", padding=(0, 6))
    style.map("TCheckbutton", background=[("active", "white")])
    style.configure("Horizontal.TProgressbar", thickness=6, troughcolor="#e4ebf5", background=accent, borderwidth=0, lightcolor=accent, darkcolor=accent)
    style.configure("TSeparator", background="#e8edf5")

    root.columnconfigure(0, weight=1)
    root.rowconfigure(0, weight=1)
    page = ttk.Frame(root, style="Page.TFrame", padding=(24, 14, 24, 10))
    page.grid(sticky="nsew")
    page.columnconfigure(0, weight=1)
    page.rowconfigure(5, weight=1)

    header = ttk.Frame(page, style="Page.TFrame")
    header.grid(row=0, column=0, sticky="ew", pady=(0, 8))
    header.columnconfigure(1, weight=1)
    asset_directory = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parent)) / "assets"
    root.brand_icon = tk.PhotoImage(file=str(asset_directory / "app-icon.png")).subsample(8, 8)
    root.iconphoto(True, root.brand_icon)
    ttk.Label(header, image=root.brand_icon, style="Page.TLabel").grid(row=0, column=0, rowspan=2, padx=(0, 14), sticky="w")
    ttk.Label(header, text="SpineSlim", style="Brand.TLabel").grid(row=0, column=1, sticky="w")
    ttk.Label(header, text="让资源更轻，让工作更简单。", style="Subtitle.TLabel").grid(row=1, column=1, sticky="w", pady=(3, 0))
    ttk.Label(header, text=f"WINDOWS  /  v{version}", style="Version.TLabel").grid(row=0, column=2, rowspan=2, sticky="e")
    language_select = ttk.Combobox(header, values=("中文 / Chinese", "English"), state="readonly", width=16)
    language_select.grid(row=0, column=3, rowspan=2, padx=(12, 0), sticky="e")
    language_select.current(0 if variables["language"].get() == "zh" else 1)
    language_select.bind("<<ComboboxSelected>>", commands["language_changed"])

    paths = ttk.Frame(page, style="Card.TFrame", padding=(18, 10))
    paths.grid(row=1, column=0, sticky="ew", pady=(0, 12))
    paths.columnconfigure(1, weight=1)
    ttk.Label(paths, text="01  项目路径", style="Heading.TLabel").grid(row=0, column=0, columnspan=3, sticky="w", pady=(0, 8))
    entries = {}
    for row, key, label, command in (
        (1, "source", "源目录", "select_source"),
        (2, "target", "目标目录", "select_target"),
    ):
        ttk.Label(paths, text=label).grid(row=row, column=0, sticky="w", padx=(0, 18), pady=3)
        entry = ttk.Entry(paths, textvariable=variables[key])
        entry.grid(row=row, column=1, sticky="ew", pady=3)
        ttk.Button(paths, text="选择文件夹", command=commands[command]).grid(row=row, column=2, padx=(12, 0), pady=3)
        entries[key] = entry

    options = ttk.Frame(page, style="Card.TFrame", padding=(18, 10))
    options.grid(row=2, column=0, sticky="ew", pady=(0, 12))
    options.columnconfigure(0, weight=1)
    ttk.Label(options, text="02  处理设置", style="Heading.TLabel").grid(row=0, column=0, sticky="w")
    resource_types = ttk.Frame(options, style="Card.TFrame")
    resource_types.grid(row=0, column=1, sticky="e")
    for label, value in (("Spine 动画", "spine"), ("UI 图片", "ui"), ("视频", "video")):
        ttk.Radiobutton(resource_types, text=label, style="Tab.TRadiobutton", variable=variables["res_type"], value=value, command=commands["resource_changed"]).pack(side="left", padx=(4, 0))
    ttk.Separator(options).grid(row=1, column=0, columnspan=2, sticky="ew", pady=(6, 9))
    settings = ttk.Frame(options, style="Card.TFrame")
    settings.grid(row=2, column=0, columnspan=2, sticky="ew")
    settings.columnconfigure(2, weight=1)
    mode_frame = ttk.Frame(settings, style="Card.TFrame")
    mode_frame.grid(row=0, column=0, sticky="nw", padx=(0, 24))
    ttk.Label(mode_frame, text="纹理格式", style="Muted.TLabel").pack(anchor="w", pady=(0, 3))
    texture_formats = {
        "原格式 · 默认": "original",
        "WebP · 有损压缩": "imagemagick",
        "PNG · 仅无损压缩": "png",
        "JPG · 白底，无透明": "jpg",
        "Basis · GPU 压缩": "basis",
    }
    format_label = tk.StringVar()
    format_select = ttk.Combobox(mode_frame, textvariable=format_label, values=FORMAT_LABELS["zh"], state="readonly", width=23)
    format_select.pack(anchor="w", pady=(4, 0))
    video_format = ttk.Frame(settings, style="Card.TFrame")
    video_format.grid(row=0, column=0, sticky="nw", padx=(0, 24))
    ttk.Label(video_format, text="视频格式", style="Muted.TLabel").pack(anchor="w", pady=(0, 8))
    ttk.Label(video_format, text="WebM · VP9").pack(anchor="w")
    ttk.Separator(settings, orient="vertical").grid(row=0, column=1, sticky="ns", padx=(0, 24))
    details = ttk.Frame(settings, style="Card.TFrame")
    details.grid(row=0, column=2, sticky="nsew")
    details.columnconfigure(0, weight=1)
    spine_frame = ttk.Frame(details, style="Card.TFrame")
    spine_frame.grid(row=0, column=0, sticky="ew")
    ttk.Checkbutton(spine_frame, text="升级至 Spine 4.2.11", variable=variables["spine_compat"]).pack(anchor="w")
    ttk.Label(spine_frame, text="任意目录名 · 保留源目录结构输出", style="Muted.TLabel").pack(anchor="w")
    ttk.Label(spine_frame, text="启用后迁移 Setup Pose attachment，保留已有动画关键帧", style="Muted.TLabel", wraplength=380).pack(anchor="w", padx=(23, 0), pady=(0, 6))
    force_frame = ttk.Frame(details, style="Card.TFrame")
    force_frame.grid(row=0, column=0, sticky="ew")
    ttk.Checkbutton(force_frame, text="全部图片按背景图处理", variable=variables["force_bg"], command=commands["save"]).pack(anchor="w")
    video_frame = ttk.Frame(details, style="Card.TFrame")
    video_frame.grid(row=0, column=0, sticky="ew")
    ttk.Checkbutton(video_frame, text="保留视频透明通道 · WebM / VP9", variable=variables["video_alpha"], command=commands["save"]).pack(anchor="w")
    video_quality = ttk.Frame(video_frame, style="Card.TFrame")
    video_quality.pack(anchor="w")
    ttk.Label(video_quality, text="视频 CRF").pack(side="left", padx=(0, 12))
    ttk.Spinbox(video_quality, from_=0, to=63, width=5, textvariable=variables["video_crf"]).pack(side="left")
    ttk.Label(video_quality, text="越大体积越小 · 建议 32–40", style="Muted.TLabel").pack(side="left", padx=12)
    quality_frame = ttk.Frame(details, style="Card.TFrame")
    quality_frame.grid(row=1, column=0, sticky="ew", pady=(4, 0))
    quality_label = ttk.Label(quality_frame, text="WebP 质量")
    quality_label.pack(side="left", padx=(0, 12))
    ttk.Spinbox(quality_frame, from_=0, to=100, width=5, textvariable=variables["quality"]).pack(side="left")
    ttk.Label(quality_frame, text="0–100 · 越高越清晰", style="Muted.TLabel").pack(side="left", padx=12)
    root.update_idletasks()
    settings.columnconfigure(0, minsize=max(panel.winfo_reqwidth() for panel in (mode_frame, video_format)) + 24)
    details.rowconfigure(0, minsize=max(panel.winfo_reqheight() for panel in (spine_frame, force_frame, video_frame)))
    details.rowconfigure(1, minsize=quality_frame.winfo_reqheight() + 4)

    def show_resource_options(selected):
        panels = {
            "spine": spine_frame,
            "ui": force_frame,
            "video": video_frame,
        }
        for resource_type, panel in panels.items():
            if resource_type == selected:
                panel.grid()
            else:
                panel.grid_remove()
        if selected == "video":
            mode_frame.grid_remove()
            quality_frame.grid_remove()
            video_format.grid()
        else:
            video_format.grid_remove()
            mode_frame.grid()
            mode = variables["ui_process_mode" if selected == "ui" else "process_mode"].get()
            language = variables["language"].get() if variables["language"].get() in ("zh", "en") else "zh"
            format_label.set(FORMAT_LABELS[language][tuple(FORMAT_VALUES.values()).index(mode)])
            quality_label.configure(text=("JPG 质量" if mode == "jpg" else "WebP 质量") if language == "zh" else ("JPG quality" if mode == "jpg" else "WebP quality"))
            if mode in ("original", "png", "basis"):
                quality_frame.grid_remove()
            else:
                quality_frame.grid()

    def on_texture_format_changed(event):
        mode_key = "ui_process_mode" if variables["res_type"].get() == "ui" else "process_mode"
        variables[mode_key].set(FORMAT_VALUES[format_label.get()])
        show_resource_options(variables["res_type"].get())
        commands["save"]()

    format_select.bind("<<ComboboxSelected>>", on_texture_format_changed)

    def apply_language(language):
        def update_widget(widget):
            key = getattr(widget, "_spineslim_text", None)
            if key and key in TRANSLATIONS:
                widget.configure(text=key if language == "zh" else TRANSLATIONS[key])
            for child in widget.winfo_children():
                update_widget(child)

        update_widget(page)
        language_select.set("中文 / Chinese" if language == "zh" else "English")
        format_select.configure(values=FORMAT_LABELS[language])
        show_resource_options(variables["res_type"].get())

    def remember_texts(widget):
        try:
            text = widget.cget("text")
        except tk.TclError:
            text = None
        if text in TRANSLATIONS:
            widget._spineslim_text = text
        for child in widget.winfo_children():
            remember_texts(child)

    remember_texts(page)
    show_resource_options(variables["res_type"].get())

    actions = ttk.Frame(page, style="Page.TFrame")
    actions.grid(row=3, column=0, sticky="ew", pady=(1, 8))
    actions.columnconfigure(0, weight=1)
    ttk.Label(actions, text="处理会更新目标输出目录，请先备份素材。", style="Subtitle.TLabel").grid(row=0, column=0, sticky="w")
    ttk.Button(actions, text="统计包体", style="Secondary.TButton", command=commands["statistics"]).grid(row=0, column=1, padx=(12, 10))
    start_button = ttk.Button(actions, text="开始处理", style="Primary.TButton", command=commands["start"])
    start_button.grid(row=0, column=2)

    status = ttk.Frame(page, style="Page.TFrame")
    status.grid(row=4, column=0, sticky="ew", pady=(0, 10))
    status.columnconfigure(0, weight=1)
    ttk.Label(status, text="文件状态", style="Page.TLabel").grid(row=0, column=0, sticky="w", pady=(0, 2))
    progress_var = tk.StringVar(value="0%  待开始")
    ttk.Label(status, textvariable=progress_var, style="Page.TLabel").grid(row=1, column=0, sticky="w", pady=(0, 4))
    progress = ttk.Progressbar(status, mode="determinate")
    progress.grid(row=2, column=0, sticky="ew", ipady=2)

    logs = ttk.Frame(page, style="Card.TFrame", padding=(18, 8))
    logs.grid(row=5, column=0, sticky="nsew")
    logs.columnconfigure(0, weight=1)
    logs.rowconfigure(1, weight=1)
    ttk.Label(logs, text="03  运行日志", style="Heading.TLabel").grid(row=0, column=0, sticky="w", pady=(0, 8))
    log_text = tk.Text(logs, height=7, wrap="word", font=("Consolas", 10), background="#f7f9fd", foreground="#334563", relief="flat", borderwidth=0, padx=12, pady=10, highlightthickness=1, highlightbackground="#e5ebf4", selectbackground="#dbe8ff")
    log_text.grid(row=1, column=0, sticky="nsew")
    scrollbar = ttk.Scrollbar(logs, command=log_text.yview)
    scrollbar.grid(row=1, column=1, sticky="ns")
    log_text.configure(yscrollcommand=scrollbar.set)

    footer = ttk.Frame(page, style="Page.TFrame")
    footer.grid(row=6, column=0, sticky="ew", pady=(8, 0))
    footer.columnconfigure(0, weight=1)
    github_link = ttk.Label(footer, text="GitHub  /  Alone9898 · SpineSlim", foreground=accent, style="Page.TLabel", cursor="hand2")
    github_link.grid(row=0, column=0, sticky="w")
    github_link.bind("<Button-1>", lambda event: webbrowser.open(REPOSITORY_URL))
    ttk.Button(footer, text="喜欢这个工具？给个 Star ★", command=lambda: webbrowser.open(REPOSITORY_URL)).grid(row=0, column=1, sticky="e")

    remember_texts(page)
    apply_language(variables["language"].get() if variables["language"].get() in ("zh", "en") else "zh")

    return {
        "show_resource_options": show_resource_options,
        "apply_language": apply_language,
        "language_select": language_select,
        "source_entry": entries["source"],
        "target_entry": entries["target"],
        "spine_compat_frame": spine_frame,
        "force_bg_frame": force_frame,
        "video_options_frame": video_frame,
        "quality_frame": quality_frame,
        "start_btn": start_button,
        "progress_text_var": progress_var,
        "progress": progress,
        "log_text": log_text,
        "github_link": github_link,
    }
