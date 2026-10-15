# SpineSlim

[English](README.en-US.md) · [下载发布版本](https://github.com/Alone9898/SpineSlim/releases) · [反馈问题](https://github.com/Alone9898/SpineSlim/issues)

SpineSlim 是一个 Windows 桌面工具，用于批量整理和压缩 Spine、UI 图片与视频资源。

![SpineSlim 中文界面](assets/ui-zh.png)

如果工具对你有帮助，欢迎在 [GitHub](https://github.com/Alone9898/SpineSlim) 点 Star。SpineSlim 是独立第三方项目，与 Spine 官方无关联。

## 功能

- Spine JSON 校验与升级至 Spine 4.2.11。
- 迁移 Setup Pose attachment，同时保留已有动画关键帧。
- Spine 和 UI 图片支持原格式、WebP、PNG、JPG、Basis。
- Atlas 引用随纹理输出格式自动更新。
- 任意 Spine 文件夹名称，递归复制并保留源目录结构。
- UI 图片、图集、艺术字、BG 资源和 WebM / VP9 视频处理。
- 中英文界面、拖拽目录、进度显示、运行日志和包体统计。

本文描述当前源码功能；下载的发行版请同时查看对应的 Release 说明。当前以 Windows 为主要支持平台，尚未提供 macOS 安装包。Spine 在线查看器属于二期规划，当前版本尚未提供动画预览。

## 纹理格式怎么选

| 选项 | 行为 | 建议用途 |
| --- | --- | --- |
| 原格式（默认） | 保留扩展名；PNG 尝试无损压缩，其他已有格式保留 | 保持现有资源接入方式 |
| WebP | 有损压缩，可调质量，支持透明度 | 运行环境支持 WebP 时减小体积 |
| PNG | 无损压缩，保留尺寸与透明度；已有 PNG 压缩后更大则保留原文件 | 需要无损与透明度 |
| JPG | 有损压缩，可调质量；透明区域合成为白底 | 不需要透明度的背景 |
| Basis | 当前转换器输出 `.basis`，需要运行端解码或转码支持 | 已接入 GPU 纹理流程的项目 |

格式选择适用于当前处理流程中的纹理，并不代表会转换文件夹中的所有文件类型。Spine 的 Atlas 纹理与其他 PNG 会分别处理；UI 背景流程处理 PNG/JPG/JPEG，原格式模式仅压缩其中的 PNG。Spine 与 UI 的格式设置独立保存。WebP/JPG 质量范围为 0–100，数值越高通常越清晰、体积越大；压缩比例取决于素材。

## 输出目录

```text
目标目录/
└─ program/
   ├─ spine/          # 保留所选 Spine 源目录内部层级
   ├─ bg/             # UI 背景图，保留原尺寸
   ├─ atlas/          # UI 图集输出
   ├─ fonts/          # TTF / OTF 字体
   ├─ part/           # part 文件夹中的 JSON
   └─ video/
      ├─ pc/          # WebM，原尺寸
      └─ mobile/      # WebM，约一半宽高，并调整为偶数尺寸
```

上图只列出主要目录，具体输出取决于模式和素材。Spine 不要求输入目录叫 `mp` 或 `pc`，例如 `源/角色/hero.atlas` 会输出到 `目标/program/spine/角色/hero.atlas`。视频仍按 PC/Mobile 输出，和 Spine、UI BG 的规则不同。

### UI 分类规则

- 支持 PNG/JPG/JPEG；文件名包含 `guide` 的文件会跳过。
- 名称按 `_` 分隔后，第三段为 `pce` 时进入碎图图集流程，为 `pack` 时作为背景图。
- 没有上述标记时，JPG/JPEG 作为背景；宽小于 2048 且高小于 1024 的 PNG 作为碎图，其余作为背景。
- `winnum` 开头的文件进入艺术字流程；使用 Pillow 生成位图字体，无需 BMFont。
- 启用“全部图片按背景图处理”会跳过普通碎图打图集；字体、艺术字、视频仍有各自的分类流程。

### 视频选项

支持 MOV、MP4、M4V、WebM、MKV、AVI 输入，输出为 WebM / VP9。有音轨时编码为 Opus。CRF 范围为 0–63，数值越大通常体积越小，建议从 32–40 试起。“保留透明通道”要求源视频本身带有透明通道，并且播放端支持 VP9 Alpha。

## 本地运行

从 [Releases](https://github.com/Alone9898/SpineSlim/releases/latest) 下载 Windows x64 压缩包，解压后运行 EXE，无需 Python。程序会自动搜索外部工具；缺少工具时可自动搜索、手动指定路径或打开官网下载页面。

源码运行需要 Windows 和 Python 3.12+：

```powershell
git clone https://github.com/Alone9898/SpineSlim.git
cd SpineSlim
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe .\main.py
```

## 外部工具

程序不捆绑第三方工具，请按需从官方来源获取：

| 工具 | 用途 |
| --- | --- |
| [ImageMagick](https://imagemagick.org/) | 图片压缩与格式转换 |
| [Basis Universal](https://github.com/BinomialLLC/basis_universal) | Basis / KTX2 压缩 |
| [TexturePacker](https://www.codeandweb.com/texturepacker) | UI 图集 |
| SpineSkeletonDataConverter | Spine 版本转换 |
| [FFmpeg](https://ffmpeg.org/) | 视频转换 |

Spine 版本升级工具只在启用升级时使用；图片转换使用 ImageMagick 或 Basis Universal，UI 图集使用 TexturePacker，视频使用 FFmpeg。当前 UI 模式的启动检查会检查 ImageMagick 和 TexturePacker，即使选择全部背景图模式也需要通过检查。UI 输入包含视频时，还需要 FFmpeg。

支持读取已保存的工具路径、应用目录、系统 PATH，以及 TexturePacker 常见安装目录。手动选择可执行文件后会保存到 `config.json`。便携工具应保留配套文件，不能只复制单个 EXE。SpineSkeletonDataConverter 是独立第三方转换器，请自行核实其来源与授权；它不是 Spine 编辑器。

## 使用流程

1. 在右上角选择中文或 English。
2. 选择源目录、目标目录和资源类型：Spine、UI 图片或视频。
3. 选择纹理格式；默认“原格式”会保留输入扩展名。
4. 确认选项后点击“开始处理”。

处理会清理对应输出目录。第一次运行请使用素材副本和独立的空目标目录。Spine 输出位于 `目标/program/spine` 并保留源目录结构；UI BG 输出位于 `目标/program/bg`，不再生成 `mobile` / `pc` 子目录。

- Spine 模式会清空整个 `program/spine`，包括以前生成的 `mobile` / `pc`。源目录不能位于该输出目录内。
- UI 模式会清理 `program` 下除 `spine` 外的内容，因此也会影响已有 UI、字体和视频输出。
- 视频模式会清理 `program/video/pc` 和 `program/video/mobile` 中已有的 WebM。
- Spine 4.2 升级是可选操作，不是所有输入版本都能转换；以预检和转换日志为准。转换后应在项目运行环境中检查动画效果。

当前 JSON 兼容预检接受 3.5、3.6、3.7、3.8、4.0、4.1 系列进入升级流程，4.2 系列识别为已是 4.2；其他版本会标记为不支持。版本号符合范围不代表每份素材都能成功转换，仍取决于 JSON 内容及外部转换器。当前未提供 `.skel` 二进制骨骼的版本升级流程。

## 常见问题

| 问题 | 处理方式 |
| --- | --- |
| `Atlas PNG page missing` | 检查 Atlas 页名引用的纹理是否存在、相对路径是否正确；选择包含 JSON、Atlas 和纹理的完整素材目录 |
| 兼容汇总 `failed=0`，但任务失败 | 该汇总只代表版本兼容阶段；继续查看后续纹理、Atlas 或视频阶段的错误 |
| 找不到外部工具 | 使用自动搜索或手动指定路径，确认选择了对应可执行程序并保留配套文件 |
| 拖拽不可用 | 源码环境安装 `tkinterdnd2`；仍可使用“选择文件夹”按钮 |
| 压缩后体积变化很小 | 素材可能已压缩；无损 PNG 不保证显著变小，可按运行端能力尝试 WebP |
| JPG 出现白底 | JPG 不支持透明度；需要透明效果时使用 PNG、WebP 或原格式 |

反馈问题时，请附软件版本、Windows 版本、处理模式、格式选项和相关错误日志；如可提供复现素材，请使用有权公开的最小示例。

## 路线图

### 一期：Windows 批量处理工具

当前重点是 Spine/UI/视频处理、格式选择、工具路径检测、中英文界面与输出流程完善。已提供源码与 Windows 打包流程，具体发行内容以 Releases 为准。

### 二期：Spine 在线查看器（计划中）

计划增加浏览器中的 Spine 动画查看能力，方便在压缩、转换前后检查资源。拟定范围：

- 加载骨骼文件、Atlas 和对应纹理，优先支持本地文件选择或拖入。
- 动画和皮肤切换，播放、暂停、循环与速度调节。
- 画布缩放、拖动，以及背景色或棋盘格切换。
- 显示资源信息与加载错误，辅助检查纹理引用问题。
- 探索原始资源与处理后资源的预览对比，以及桌面工具与查看器的衔接。

以上均为规划，尚未实现，也未承诺上线时间。支持的 Spine 版本、JSON/二进制格式及纹理解码范围，将在选定运行库并验证后公布；在线查看器地址也将在可用后补充。

## 测试与打包

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
python -m pip install pyinstaller
python -m PyInstaller --noconfirm --clean --distpath dist --workpath build SpineSlim.spec
```

## 许可

项目自有代码采用 [MIT License](LICENSE)，允许修改、分发和商用，但必须保留许可与版权声明。第三方工具、组件和用户素材遵循各自授权条款，详见 [THIRD_PARTY.md](THIRD_PARTY.md)。
