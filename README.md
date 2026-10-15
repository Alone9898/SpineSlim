# SpineSlim

Spine 资源优化与批量处理工具，支持版本转换、纹理压缩和 PC / 移动端资源整理。

A Windows desktop toolkit for Spine version conversion, texture compression, and PC/mobile asset organization.

如果这个工具对你有帮助，欢迎在 [GitHub](https://github.com/Alone9898/SpineSlim) 点一个 Star ★。

If you find SpineSlim useful, please consider giving the project a [Star on GitHub](https://github.com/Alone9898/SpineSlim).

独立第三方工具，与 Spine 官方无关联。Independent project, not affiliated with or endorsed by the makers of Spine.

## 功能 / Features

- Spine JSON 校验、升级至 4.2.11，以及 setup pose attachment 首帧迁移。
- PNG 转 WebP / KTX2，更新 Atlas 引用并复用共享纹理。
- 按 PC / 移动端整理资源，支持 UI 图集和艺术字处理。
- FFmpeg WebM / VP9 视频转换，可选保留透明通道。
- 桌面界面、拖拽目录、处理日志、进度及包体统计。

Spine conversion and setup-pose attachment migration, texture compression, shared atlas texture handling, UI/font processing, and video conversion with optional alpha preservation.

## 本地运行 / Run locally

### Windows EXE

从 [Releases](https://github.com/Alone9898/SpineSlim/releases/latest) 下载 `SpineSlim-1.0.0-windows-x64.zip`，解压到可写目录后双击 `SpineSlim-1.0.0-windows-x64.exe`。无需安装 Python。处理所需的外部工具仍需单独安装，并按下表放在 EXE 同目录下；配置也保存在该目录。EXE 未进行代码签名。已发布的 v1.0.0 仍含游戏名称功能，以下移除说明适用于最新源码。

Download the Windows x64 ZIP from [Releases](https://github.com/Alone9898/SpineSlim/releases/latest), extract it to a writable folder, and launch the EXE. Python is not required. Install external processing tools beside the EXE using the layout below. Settings and cache are saved beside the EXE. The executable is unsigned.

### Python 源码 / Python source

使用 Windows 和 Python 3.12+；当前使用 Python 3.13 验证。Use Windows and Python 3.12+; tested with Python 3.13.

```powershell
git clone https://github.com/Alone9898/SpineSlim.git
cd SpineSlim
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe .\main.py
```

界面可以直接启动；资源处理功能需要另外安装对应的外部工具，见下表。首次使用会保存本地 `config.json`，也可从 `config.example.json` 复制生成。

The UI starts without bundled external tools. Install the tools required by your workflow separately. Local settings are saved to `config.json`; an example is provided in `config.example.json`.

## 外部工具 / External tools

本仓库仅发布源码、测试及文档，不包含第三方可执行程序、商业素材或已打包应用。以下是当前代码查找工具的位置，相对项目根目录：

This repository contains source, tests, and documentation. Obtain external tools from their official publishers, verify their licenses, and place them at the paths below.

| 工具 / Tool | 路径 / Expected path | 用途 / Purpose |
| --- | --- | --- |
| [ImageMagick](https://imagemagick.org/) | `ImageMagick-7.1.2-19-portable-Q16-HDRI-x64/magick.exe` | 图片处理 / Image processing |
| [Basis Universal](https://github.com/BinomialLLC/basis_universal) | `basisu.exe` | KTX2 压缩 / Texture compression |
| [TexturePacker](https://www.codeandweb.com/texturepacker) | `TexturePacker/bin/TexturePacker.exe` 及配套 resources | UI 图集 / Sprite sheets |
| [BMFont](https://www.angelcode.com/products/bmfont/) | `bmfont1.14a/bmfont64.com` 及配套文件 | 艺术字 / Bitmap fonts |
| SpineSkeletonDataConverter | `SpineSkeletonDataConverter.exe` | Spine 版本转换 / Version conversion |
| [FFmpeg](https://ffmpeg.org/) | `ffmpeg.exe` | 视频转换 / Video conversion |

SpineSkeletonDataConverter 的获取来源及授权需使用者自行核实，仓库不提供该程序。ImageMagick 等目录需要完整的配套文件；若使用其他版本或目录，应调整 `main.py` 中的路径。使用 EXE 时，这些位置相对于 EXE 所在目录。

Verify the origin and license of SpineSkeletonDataConverter before use. Keep required companion files. For different installation paths or versions, update `main.py`. For packaged applications, these paths are relative to the EXE directory.

## 使用说明 / Usage

1. 选择源目录和已经存在的目标目录，再选择 `spine`、`ui` 或 `video`。
2. Spine 输入按叶子文件夹名称识别：名称包含 `mp` 的文件夹进入移动端，包含 `pc` 的进入 PC 端。
3. 选择压缩方式，按需启用 Spine 4.2.11 升级，然后开始处理。

**处理会清理对应输出目录。首次请使用素材副本和独立的空目标目录。UI 模式会清理 `program` 下除 `spine` 以外的内容。** Spine 模式会跳过目标 `program/spine`，避免重复扫描之前的输出。

Select existing source and target folders, choose the resource type and conversion options, then start processing. Spine inputs use leaf folders containing `mp` or `pc` in their names. **Processing clears relevant output folders. Use copies of your assets and a separate empty target for the first run. UI processing clears contents of `program` other than `spine`.**

最新源码已移除游戏名称、游戏列表缓存和远端列表请求。UI 图集帧名使用 `分组名/图片名`，不再添加原来的 `assets/<游戏标识>/game/` 前缀。依赖旧帧名的调用方需要同步调整；已有配置中的 `game_name` 会被忽略。

The latest source removes game-name input, game-list caching, and remote requests. UI atlas frame names use `group/image` instead of the previous `assets/<game>/game/group/image` format. Update consumers that depend on the old frame names. Legacy `game_name` settings are ignored. Published v1.0.0 binaries retain the previous behavior.

## 测试 / Tests

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
```

单元测试不需要真实第三方程序，不代表已验证所有外部工具组合或动画视觉效果。

Unit tests run without third-party executables. They do not verify every external tool combination or visual animation result.

## 打包 / Packaging

在安装了项目依赖和 PyInstaller 的 Python 环境中运行：

```powershell
python -m pip install -r requirements.txt pyinstaller
python -m PyInstaller --noconfirm --clean --distpath dist --workpath build SpineSlim.spec
python package_release.py
```

生成 EXE、带使用说明和运行依赖许可的 ZIP，以及 SHA-256 校验值。打包许可材料时需联网获取 Tcl 和 tkdnd 的许可文本。EXE 包含 Python、Tkinter、Pillow 和拖拽运行依赖，不包含外部资源处理工具、个人配置或游戏素材。窗口版本定义在 `app_runtime.py`，Windows 文件版本定义在 `version_info.txt`。也可运行 `build.ps1`。

Builds a standalone Windows EXE with Python and UI/image runtime dependencies. External asset-processing tools, local settings, and game assets are excluded. Update `app_runtime.py` and `version_info.txt` together for future releases.

**能成功打包不等于拥有分发权。对外分发前需核对全部依赖授权。** See [THIRD_PARTY.md](THIRD_PARTY.md) before redistribution. Successful packaging does not grant redistribution rights.

## 许可与商用 / Licensing and commercial use

本项目自有代码采用 [MIT License](LICENSE)，允许使用、修改、分发及商用，须保留许可和版权声明。第三方组件和用户素材不包含在该许可内。第三方使用及分发条件见 [THIRD_PARTY.md](THIRD_PARTY.md)，更多项目说明见 [main.md](main.md)。

The project's own code is licensed under the [MIT License](LICENSE), permitting use, modification, redistribution, and commercial use with the required license and copyright notice. Third-party software and user assets retain their respective licenses. See [THIRD_PARTY.md](THIRD_PARTY.md) for dependency notes.
