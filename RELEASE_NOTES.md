# SpineSlim v1.0.0

首个公开 Windows x64 桌面版本。First public Windows x64 desktop release.

## 下载 / Downloads

- 推荐 `SpineSlim-1.0.0-windows-x64.zip`：包含 EXE、运行说明及许可文件。
- `SpineSlim-1.0.0-windows-x64.exe`：独立 EXE，无需安装 Python。
- `SHA256SUMS.txt`：下载文件的 SHA-256 校验值。
- `licenses.zip`：EXE 内置运行依赖的许可材料。

Extract the ZIP into a writable folder and launch the EXE. Python is not required. The ZIP includes instructions and license notices. SHA-256 checksums and runtime license materials are provided separately as well.

## 功能 / Features

- Spine JSON 升级及 setup pose attachment 时间线处理。
- WebP / KTX2 纹理处理，PC / 移动端资源整理。
- UI 图集、艺术字和 WebM 视频处理。
- 修复共用 PNG 被提前删除和重复扫描输出目录导致 `_1` 副本的问题。

Spine JSON conversion, attachment timeline handling, texture compression, PC/mobile asset organization, UI/font workflows, and video processing. Shared textures are converted once; output folders are excluded from source scanning.

## 外部依赖 / External processing tools

**EXE 包含 Python 及界面运行依赖，但不包含 ImageMagick、BasisU、TexturePacker、BMFont、SpineSkeletonDataConverter 或 FFmpeg。** 按需从各自发布方获取适用版本并核实授权，再按 README 放到 EXE 同目录的指定位置。

**External processing tools are installed separately.** Obtain the tools required by your workflow from their publishers, verify their licenses, and follow the directory layout in README. The project's MIT license does not cover those tools.

## 验证与限制 / Validation and limitations

- 单元测试覆盖资源扫描、共享纹理、转换失败清理、Spine JSON 处理与 EXE 工具目录定位。
- EXE 在构建电脑的独立目录中执行启动检查；尚未在另一台全新电脑上完整验证所有资源处理流程。
- 未进行 Windows 代码签名。处理会清理对应输出目录，首次请使用素材副本和独立空目标目录。

Unit tests cover scanning, shared textures, failure cleanup, Spine transformations, and frozen application paths. Startup is checked in an isolated directory on the build machine; full workflows on a separate clean computer remain to be verified. This release is unsigned. Use copied assets and an empty target folder for initial testing.
