# SpineSlim 2.0.0-alpha.5

Windows x64 预发布版 / Windows x64 pre-release.

## 新功能与改进

- **Spine 版本转换**：资源处理默认将 JSON 升级到 Spine 4.2.11；高级模式可指定 3.5–3.8、4.0–4.2 范围内的完整 `x.y.z` 目标版本，对 JSON 或 SKEL 升级、降级。
- **输出格式**：高级模式可保持骨骼原格式，或输出 JSON、SKEL；转换结果保存至独立的 `program/spine-converted`，保留源文件和现有 `program/spine`。
- **处理保护**：校验目标版本、检测输出重名，并在转换成功后才提交结果；界面显示转换阶段进度。

## 使用与限制

- 降级可能改变较新版本的曲线、约束和时间线。请使用目标 Spine 运行时检查动画、Atlas 和贴图。
- 高级模式再次运行会替换已有的 `program/spine-converted` 内容。转换功能使用随完整安装包提供的 SpineSkeletonDataConverter；第三方工具遵循各自许可。
- 仅提供 Windows x64 安装包；软件更新会提示下载，不自动安装。

## 验证

- 前端构建通过；Python 80 项测试通过（其中 6 项跳过）；Rust 4 项测试通过。
- 完整安装包通过 ImageMagick、Basis、TexturePacker、Spine 转换器、FFmpeg 和资源处理冒烟测试。

## Features and improvements

- **Spine version conversion:** Resource processing upgrades JSON to Spine 4.2.11 by default. Advanced mode accepts a full `x.y.z` target version in the 3.5–3.8 or 4.0–4.2 ranges and converts JSON or SKEL in either direction.
- **Output format:** Advanced mode keeps the source skeleton format or writes JSON or SKEL. Results go to `program/spine-converted`, preserving the source and existing `program/spine`.
- **Safer processing:** Validate target versions, detect output-name collisions, and commit results only after successful conversion. The UI reports conversion progress.

## Usage and limits

- Downgrades may change newer curves, constraints and timelines. Check animation, Atlas and textures with the target Spine runtime.
- Running advanced mode again replaces existing `program/spine-converted` contents. Conversion uses the bundled SpineSkeletonDataConverter; third-party licenses still apply.
- Windows x64 only. Update checks open the download page and do not install updates automatically.

## Verification

- Frontend build passed; 80 Python tests passed (6 skipped); 4 Rust tests passed.
- The full package passed bundled-tool checks for ImageMagick, Basis, TexturePacker, the Spine converter and FFmpeg, plus asset-processing smoke tests.
