# SpineSlim 2.0.0-alpha.1

> 发布说明草稿 / Release notes draft。对应当前源码版本；尚不代表已发布或已完成安装包验收。发布时核对实际附件、工具清单及测试结果。

## 中文

SpineSlim 2.0 使用 Tauri 2 + React + TypeScript + Python 后台，加入四个本地资源工作区，面向 Windows x64。

### 主要功能

- **Spine 预览**：3.8 / 4.0 / 4.1 / 4.2 的 JSON / SKEL；动画、皮肤、播放速度、时间轴、缩放平移、网格和全屏；可导出 GIF / MP4。
- **图集打包**：独立本地打包，无需 TexturePacker；透明裁剪、边距、边缘扩展、多页和实时布局；支持 Cocos、Unity、Godot 4、PixiJS、Phaser 3、Spine。
- **资源处理**：Spine JSON 升级、原格式 / WebP / PNG / JPG / Basis 纹理处理、UI 分类、位图字体和 WebM / VP9 视频；逐文件阶段进度、日志和包体统计。
- **音频处理**：批量转换 MP3 / OGG / WAV，试听、裁剪、淡入淡出、短音频拼接；音频图集输出 Howler.js / Phaser JSON，支持进度、取消与体积对比。
- **桌面体验**：中文默认、English 切换，侧栏 GitHub Star 与 TG 群入口；设置始终显示在侧栏底部，生产构建禁用右键菜单。修复窗口关闭权限及重复关闭监听，已验证普通、最大化及最小化恢复后的退出。

### 安装与依赖

请使用本次发布的完整 Windows x64 安装包或便携附件，不要只提取主 EXE。已打包程序无需安装 Python、Node.js、Rust；Windows 需要 WebView2。

预览与独立图集打包不需要外部处理工具。GIF / MP4、音频和视频需要 FFmpeg；纹理处理按格式需要 ImageMagick / Basis；资源处理中的 UI 图集需要 TexturePacker；JSON 升级需要独立转换器。默认构建不包含这些外部工具，工具在 PATH 中安装后请重启应用。

### 当前限制

- 这是 alpha 开发线；macOS 安装包尚未提供。
- Spine 预览不覆盖 3.5–3.7 / 4.3 和 Basis/KTX 贴图，GIF / MP4 单次导出最长 30 秒。
- Unity / Godot / Cocos 图集格式已做结构和坐标测试，实际编辑器导入仍需验证；Unity 附带导入脚本，不生成原生 `.spriteatlas`。
- 音频最多 500 个、单文件与总时长最多 2 小时；试听前 10 分钟，淡入淡出应用于导出。
- 当前已进行前端构建、Rust 检查、FFmpeg 集成及桌面开发流程测试；不等同于最终安装包在干净电脑通过验收。

[中文说明](../README.zh-CN.md) · [反馈问题](https://github.com/Alone9898/SpineSlim/issues) · [TG 群聊](https://t.me/+XlcsJcxyKZtlNGYy)

## English

SpineSlim 2.0 brings four local game-asset workspaces to Windows x64, built with Tauri 2, React, TypeScript and a Python worker.

- **Spine viewer:** JSON/SKEL 3.8, 4.0, 4.1 and 4.2, animation/skin controls, timeline, pan/zoom, grid/fullscreen and GIF/MP4 export.
- **Atlas packer:** local packing without TexturePacker, alpha trim, padding/extrusion, multiple pages and live layout. Export Cocos, Unity, Godot 4, PixiJS, Phaser 3 and Spine metadata.
- **Asset processing:** Spine JSON upgrades, original/WebP/PNG/JPG/Basis textures, UI classification, bitmap fonts and WebM/VP9 conversion, with per-file progress, logs and size statistics.
- **Audio processing:** batch MP3/OGG/WAV conversion, preview, trim/fades, short-clip merging, Howler.js/Phaser audio sprites, cancellation and size comparison.
- **Desktop UI:** Chinese/English, GitHub Star and Telegram links. Packaged builds hide Settings and disable the context menu.

Use the complete Windows package, not the main EXE alone. Python, Node.js and Rust are not required to run packaged builds; Windows needs WebView2. External tools are not included in the default build: FFmpeg is needed for audio/video and GIF/MP4, ImageMagick/Basis for texture processing, TexturePacker for the UI classification atlas workflow, and a converter for JSON upgrades. Install required tools on PATH and restart.

This is an alpha line, with no macOS installer yet. Viewer versions/textures and exports have the limits described in the guide. Unity/Godot/Cocos editor imports need project validation; Unity uses an included importer rather than a native `.spriteatlas`. Audio is limited to 500 clips/two hours, with preview of the first ten minutes. Development checks do not replace clean-machine installer acceptance.

[English guide](../README.en-US.md) · [Issues](https://github.com/Alone9898/SpineSlim/issues) · [Telegram](https://t.me/+XlcsJcxyKZtlNGYy)

## 发布前补全 / Before publishing

- 核对实际版本号、附件名称、架构及 SHA-256；注明 WebView2 和外部工具是否随包提供。
  Verify version, artifact names, architecture and hashes; list bundled runtimes and external tools.
- 在干净 Windows 环境验收安装、启动、预览、导出、取消和缺工具提示。
  Validate installation, launch, preview, exports, cancellation and missing-tool behavior on a clean Windows machine.
- 按 [第三方说明](../THIRD_PARTY.md) 核对实际分发组件、许可材料与适用条件；本地完整测试包不能直接视为可公开分发包。
  Verify actual bundled components and their license requirements. A local full-test package is not automatically a redistributable release.
