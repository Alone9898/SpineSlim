# SpineSlim 2.0.0-alpha.6

Windows x64 预发布版 / Windows x64 pre-release.

## 本次更新

- **AI 智能体检预览**：新增独立模块，可点击中央图标或按钮体验持续动效、递增进度、分阶段分析日志和风险卡片。当前仅为交互演示，风险内容均标注为示例；不会读取、修改或上传项目文件，也不会执行清理。
- **后续开发方向**：接入用户主动选择的本地项目目录，先生成资源清单、引用关系与重复项分析，再给出纹理、音频、动画等优化建议及可核查的风险报告。真正的自动清理需在预览、确认和回退机制完成后再提供；本版尚不包含这些能力。
- **匿名统计完善**：记录模块进入、处理开始及唯一最终结果，并按固定枚举统计失败阶段和原因；不上传文件路径、名称、素材或原始异常。设置中可在本次运行期间关闭统计；每次启动默认开启。详见 [匿名使用统计](TELEMETRY.md)。

## 安装与验证

- 完整 Windows x64 安装包包含桌面应用、Python worker 和资源处理工具。第三方组件遵循各自许可，部分工具可能需要单独授权。
- AI 智能体检当前为 UI 预览，点击后显示的进度及风险不是实际扫描结果。现有 Spine、Rive、3D、图集、资源处理和音频模块继续可用。
- 软件更新会提示前往下载页，不会自动安装。

## What changed

- **AI Asset Audit preview:** A new module demonstrates the animated centerpiece, increasing progress, staged analysis log and sample risk cards. This is an interactive preview only. It does not read, change or upload project files, and performs no cleanup.
- **Coming next:** User-selected local project scanning, an asset inventory, reference and duplicate analysis, then reviewable suggestions for textures, audio and animation. Automatic cleanup will require preview, confirmation and rollback safeguards. None of these scanning or cleanup capabilities are included in this build.
- **Anonymous analytics:** Module entries, processing starts and one terminal outcome per task are counted with fixed error and stage categories. File paths, names, assets and raw exceptions are not uploaded. Analytics can be turned off for the current session and starts enabled at each launch. See [Anonymous Usage Analytics](TELEMETRY.md).

## Installation and verification

- The full Windows x64 installer includes the desktop app, Python worker and asset-processing tools. Third-party licenses still apply; some tools may need separate authorization.
- AI Asset Audit progress and risks are illustrative, not actual scan results. Existing Spine, Rive, 3D, atlas, asset-processing and audio modules remain available.
- Update checks open the download page; they do not install updates automatically.
