# SpineSlim 2.0.0-alpha.8

Windows x64 预发布版 / Windows x64 pre-release.

## 本次更新

- **字体裁剪**：新增字体工具页。选择 TTF / OTF 字体，粘贴需要保留的文字，或使用快速预设（常用 3000 字、数字 + 英文、中文标点、全角数字），按字符集裁剪字体并保留原格式。可选择输出为 WOFF。裁剪完成后显示体积对比与缩减比例，结果通过保存对话框下载。
- **字形查看**：列出字体中的全部字形（包括未映射的字形），支持按字符、`U+` 码位或字形名搜索，网格与列表两种视图，并可调节字形大小。
- **元信息编辑**：编辑字体家族、样式、版本、版权、授权等名称字段，显示字形数、Unicode 数、UPM、上升/下降高度、x 高度、大写高度与 Unicode 覆盖情况。修改后导出为新文件，原字体不会被改动。
- **资源制作导航**：侧边栏按"预览 / 资源制作 / 检查与工具"分组。Spine 动画、UI 图片、视频转换和音频处理等资源制作功能各自拥有独立页面，不再通过页内标签切换。
- **命名统一**：Spine 预览器、Rive 预览器、3D 模型预览器统一使用"预览器"称呼；"视频"模式更名为"视频转换"。

## 修复

- 侧边栏滚动条改为细的浅色样式，只在内容超出时显示。

## 安装

下载 Windows x64 完整安装包，不要只复制主 EXE。安装包包含桌面程序、Python worker、资源处理工具及 WebView2 离线安装组件；第三方组件遵循各自许可，TexturePacker 等工具可能需要单独授权。AI 对话需用户自行配置模型与 API Key，并可能产生模型服务费用；本地体检无需联网或 API Key。

## What changed

- **Font subsetting:** A new font tool trims TTF / OTF files to a chosen character set, with quick presets for common Chinese characters, digits and English, Chinese punctuation and full-width digits. Output keeps the original format or can be WOFF. After subsetting, the page shows the size before and after, and the result is saved through a save dialog.
- **Glyph view:** Lists every glyph in the font, including unmapped ones. Search by character, `U+` code point or glyph name; switch between grid and list views and adjust glyph size.
- **Metadata editing:** Edit family, style, version, copyright, license and other name fields, and review glyph counts, Unicode counts, vertical metrics, x-height, cap height and Unicode coverage. Edits are exported to a new file; the original font is left unchanged.
- **Asset navigation:** The sidebar groups entries into Preview, Create assets, and Inspect & tools. Spine animation, UI images, video conversion and audio processing each have their own page instead of tabs inside one page.
- **Naming:** Spine, Rive and 3D model tools are now called previewers. The video mode is renamed "Video conversion".

## Fixes

- Telemetry for asset pages now follows the new page structure; opening a page is still recorded.
- The sidebar scrollbar is thinner and lighter, and appears only when the menu overflows.

The full Windows x64 installer includes the desktop app, Python worker, processing tools and the offline WebView2 installer. Bundled third-party tools retain their own licenses; TexturePacker may require a separate license. AI chat uses your own model account and may incur provider charges. Local audits work without a network connection or API key.
