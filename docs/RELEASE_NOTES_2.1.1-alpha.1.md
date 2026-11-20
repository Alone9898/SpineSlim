# SpineSlim 2.1.1-alpha.1

Windows x64 预发布版 / Windows x64 pre-release.

## 本次更新

- **WebP · 保留原后缀**：纹理格式新增该选项。图片内容转为 WebP，文件名与后缀保持不变（`xxx.png` 仍为 `xxx.png`），无需修改引用。Spine 与 UI 模式均可使用，图像质量可调。
- **UI 背景图保留子目录**：UI 模式下，背景图按源目录结构输出到 `bg/` 下，例如 `mo/`、`pc/` 不再被合并到一起；源目录自带的 `bg` 层级不会重复嵌套。「WebP · 保留原后缀」等格式选项在子目录内同样生效。

## 修复

- 无。

## 已知限制

- 「WebP · 保留原后缀」生成的文件后缀与内容不一致，引擎需按内容而非后缀识别格式才能加载，请先在实际项目中验证。
- UI 模式仅背景图保留子目录；小图打包生成的图集仍按名称前缀分组输出到 `atlas/`。

## 安装

下载 Windows x64 完整安装包，不要只复制主 EXE。安装包包含桌面程序、Python worker、资源处理工具及 WebView2 离线安装组件；第三方组件遵循各自许可，TexturePacker 可能需要另行授权。AI 对话需用户自行配置模型与 API Key，并可能产生模型服务费用；本地体检无需联网或 API Key。

## What changed

- **WebP · keep extension:** New texture format option. Image data is re-encoded as WebP while the file name and extension stay unchanged (`xxx.png` remains `xxx.png`), so no references need updating. Available in Spine and UI modes, with adjustable quality.
- **UI backgrounds keep sub-folders:** In UI mode, background images are written under `bg/` following the source folder structure, so folders such as `mo/` and `pc/` are no longer merged. A `bg` folder already in the source is not nested again. Format options, including "WebP · keep extension", apply inside sub-folders too.

## Fixes

- None.

## Known limitations

- Files from "WebP · keep extension" have an extension that does not match their content; the engine must detect the format by content rather than extension. Verify in your project first.
- In UI mode only background images keep sub-folders; atlases packed from small images are still grouped by name prefix into `atlas/`.

## Install

The full Windows x64 installer includes the desktop app, Python worker, processing tools and the offline WebView2 installer. Bundled third-party tools retain their own licenses; TexturePacker may require a separate license. AI chat uses your own model account and may incur provider charges. Local audits work without a network connection or API key.
