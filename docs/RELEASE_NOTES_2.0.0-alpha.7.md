# SpineSlim 2.0.0-alpha.7

Windows x64 预发布版 / Windows x64 pre-release.

## 本次更新

- **AI 智能体检正式接入本地扫描**：选择或拖入资源目录，检查精确重复、缺失依赖、图片尺寸与透明边距、文件体积、命名和格式异常。显示真实任务进度、严重程度、证据、规则覆盖及未检查项。
- **报告与定位**：按严重程度筛选或搜索问题，打开涉及文件所在目录，导出 JSON / HTML 报告。体检只读取资源，不修改原文件。
- **可选 AI 对话**：扫描后在右侧固定面板讨论结果。默认仅发送数量和问题类型；相对文件名与证据需要主动勾选。模型由用户配置，只有点击发送时才联系模型服务，AI 不执行自动清理。
- **体验与修复**：AI 回复按 Markdown 排版；更新 DeepSeek 默认地址为 `https://api.deepseek.com` 并迁移旧预设；改进模型密钥状态刷新、网络错误提示和长响应等待时间。

![AI 智能体检：本地扫描、风险列表与可选 AI 对话](https://raw.githubusercontent.com/Alone9898/SpineSlim/v2.0.0-alpha.7/assets/screenshots/ai-audit-en.png)

## 安装

下载 Windows x64 完整安装包，不要只复制主 EXE。安装包包含桌面程序、Python worker、资源处理工具及 WebView2 离线安装组件；第三方组件遵循各自许可，TexturePacker 等工具可能需要单独授权。AI 对话需用户自行配置模型与 API Key，并可能产生模型服务费用；本地体检无需联网或 API Key。

## What changed

- **Real local AI Asset Audit:** Choose or drop an asset directory to check exact duplicates, missing dependencies, image dimensions and padding, large files, naming and format issues. Progress, severity, evidence, rule coverage and unchecked items reflect the actual scan.
- **Reports and navigation:** Filter or search findings, open containing folders, and export JSON or HTML reports. Audits read assets without modifying them.
- **Optional AI chat:** A sticky panel beside the findings discusses the report. The default summary includes counts and issue types only; relative file names and evidence require explicit selection. Requests go to the configured model only after Send. No automatic cleanup is performed.
- **Polish and fixes:** Markdown replies, DeepSeek default endpoint and migration, refreshed key status, clearer network errors and a longer model response timeout.

The full Windows x64 installer includes the desktop app, Python worker, processing tools and the offline WebView2 installer. Bundled third-party tools retain their own licenses; TexturePacker may require a separate license. AI chat uses your own model account and may incur provider charges. Local audits work without a network connection or API key.
