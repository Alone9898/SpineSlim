# SpineSlim 2.0.0-alpha.4

Windows x64 预发布版 / Windows x64 pre-release.

## 新功能与改进

- **3D 模型查看器**：本地打开 GLB、GLTF、FBX、OBJ / MTL 和 STL 文件或目录；查看材质、模型动画、尺寸与网格，切换照明和渲染模式，进行两点测距，并通过 FFmpeg 导出 MP4。
- **Spine 预览**：选中动画后可一键复制原始动画名；按钮可反复点击，方便粘贴到游戏代码中。
- **预览导入页**：Rive 与 3D 模型查看器使用统一的拖拽提示、格式说明和文件 / 文件夹入口。
- **双语文档**：补充 Rive、3D 模型查看器截图及格式、依赖说明。

| 3D 模型查看器 | Rive 预览 |
| --- | --- |
| ![3D 模型查看器](https://raw.githubusercontent.com/Alone9898/SpineSlim/v2.0.0-alpha.4/assets/screenshots/model-zh.png) | ![Rive 预览](https://raw.githubusercontent.com/Alone9898/SpineSlim/v2.0.0-alpha.4/assets/screenshots/rive-zh.png) |

## 使用与限制

- 3D 模型的外部贴图、GLTF `.bin` 和 OBJ 材质文件应与模型放在所选目录中。测距单位取决于模型本身；不支持原生 `.blend`、CAD 或 Unity 工程文件。
- MP4 导出、音频及视频处理使用 FFmpeg；完整安装包中的第三方工具仍遵循各自许可。TexturePacker 不附带个人授权或激活信息。见 `THIRD_PARTY.md`、`PACKAGE-README.txt` 和 `licenses`。
- 仅提供 Windows x64 安装包；软件更新会提示下载，不执行应用内自动安装。

## 验证

- 前端构建通过；Rust 4 项测试通过；Python 74 项测试通过，其中 6 项跳过。
- 本地全包校验了 ImageMagick、Basis、TexturePacker、Spine 转换器和 FFmpeg，并通过 Spine / UI / 视频处理冒烟测试。

## Features and improvements

- **3D model viewer:** Open local GLB, GLTF, FBX, OBJ / MTL and STL files or folders. Inspect materials, animation clips, dimensions and meshes; adjust lighting and render modes, measure between points and export MP4 with FFmpeg.
- **Spine viewer:** Copy the selected animation's original name with a button that remains available for repeated use.
- **Preview import pages:** Rive and 3D now share clear drag-and-drop guidance, format notes and file/folder actions.
- **Documentation:** Add Rive and 3D screenshots to the Chinese and English guides.

## Usage and limits

- Keep external textures, GLTF `.bin` files and OBJ materials in the selected model folder. Measurements use model units. Native `.blend`, CAD and Unity project files are not supported.
- MP4 export, audio and video processing use FFmpeg. Bundled third-party tools retain their own licenses; TexturePacker activation is not included. See `THIRD_PARTY.md`, `PACKAGE-README.txt` and `licenses`.
- Windows x64 only. Update checks open the download page and do not install updates automatically.

## Verification

- Frontend build passed; 4 Rust tests passed; 74 Python tests passed, with 6 skipped.
- The local full package verified ImageMagick, Basis, TexturePacker, the Spine converter and FFmpeg, then passed Spine, UI and video processing smoke tests.
