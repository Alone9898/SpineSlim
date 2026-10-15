# SpineSlim v1.1.0

## 更新内容

- 重新设计 Windows 界面，加入应用图标、GitHub / Star 入口及中英文切换。
- Spine 支持任意输入目录名，输出保留源目录结构，不再要求 `mp` / `pc`。
- Spine 和 UI 图片分别支持原格式（默认）、WebP、PNG、JPG 和 Basis。
- PNG 使用无损压缩，结果更大时保留原文件；JPG 透明部分合成白底。
- UI 背景图统一输出到 `program/bg`，保留原尺寸。
- 优化工具检测：自动搜索、手动指定路径、官网下载入口，保存已选择的路径。
- 移除游戏名称及远端配置请求，艺术字改用 Pillow 生成。
- 完善中英文文档、完整窗口截图和二期路线图。

## What's new

- Redesigned Windows UI with the application icon, GitHub / Star links, and Chinese/English selection.
- Arbitrary Spine input folder names with source paths preserved in output.
- Independent Spine/UI texture choices: original (default), WebP, PNG, JPG, and Basis.
- Lossless PNG compression keeps the original when larger; JPG flattens alpha onto white.
- UI backgrounds go directly to `program/bg` at their original dimensions.
- Tool discovery, manual path selection, official download links, and saved tool paths.
- Removed game-name input and remote configuration requests; bitmap fonts now use Pillow.
- Separate Chinese/English documentation, full-window screenshots, and phase-two plans.

## 下载 / Downloads

- `SpineSlim-1.1.0-windows-x64.zip`：推荐，含 EXE、中英文说明、截图及许可文件。Recommended: EXE, bilingual documentation, screenshots, and license notices.
- `SpineSlim-1.1.0-windows-x64.exe`：独立程序，无需 Python。Standalone executable; Python is not required.
- `licenses.zip`：运行依赖许可。Runtime license notices.
- `SHA256SUMS.txt`：下载文件校验值。Download checksums.

## 使用说明 / Usage notes

EXE 包含 Python、Pillow、Tkinter 和拖拽运行依赖，不含外部资源处理程序。ImageMagick、Basis Universal、TexturePacker、SpineSkeletonDataConverter、FFmpeg 需按功能另行获取；BMFont 不再需要。第三方工具和素材遵循各自授权，不包含在项目 MIT 许可内。

The EXE includes Python, Pillow, Tkinter, and drag-and-drop dependencies. Install external processing tools separately as needed: ImageMagick, Basis Universal, TexturePacker, SpineSkeletonDataConverter, and FFmpeg. BMFont is no longer required. Third-party tools and assets retain their respective licenses.

处理会清理相应输出目录。Spine 清空 `program/spine`；UI 清理 `program` 下除 `spine` 外的内容；视频模式清理输出目录中的旧 WebM。请先使用素材副本和独立空目标目录验证。UI 图集帧名已不含旧游戏标识前缀，依赖旧路径的项目需同步调整。

Processing clears relevant output folders. Spine clears `program/spine`; UI clears everything under `program` except `spine`; video mode removes old output WebM files. Test with copied assets and a separate empty target. UI atlas frame names no longer include the legacy game identifier prefix; update consumers that depend on it.

当前主要支持 Windows x64，EXE 未签名。部分运行日志、工具提示和弹窗仍可能包含中文。单元测试不替代实际动画视觉验证，也不代表已在全新电脑上验证所有第三方工具组合。

Windows x64 is the primary supported platform. The EXE is unsigned. Some runtime messages, tool prompts, and dialogs may still contain Chinese. Unit tests do not replace animation visual checks or validation of all external tool combinations on a clean computer.

## 二期规划 / Phase two

计划加入 Spine 在线查看器，支持资源加载、动画与皮肤切换、播放控制和处理前后对比。尚未实现，版本支持范围和上线时间待确定。

An online Spine viewer is planned for asset loading, animation/skin selection, playback controls, and before/after comparisons. It is not included in this release; support and timing remain to be determined.
