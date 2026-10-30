# SpineSlim 2.0.0-alpha.9

Windows x64 预发布版 / Windows x64 pre-release.

## 本次更新

- **图集工具解析**：图集工具新增「打包 / 解析」切换。解析模式可选择或拖入 PixiJS / TexturePacker 的 JSON 与对应 PNG，按元数据还原每张小图（旋转与裁剪），并导出为 ZIP。
- **命名统一**：原「图集打包」模块更名为「图集工具」（Atlas tools），侧边栏、页面与文档同步更新。
- **文档**：补充图集解析的使用说明与限制，更新中英文 README 的截图与标题。

## 修复

- 无。

## 已知限制

- 解析一次只处理一页，多页图集需分别解析各页的 JSON。
- 解析的旋转方向按 TexturePacker 的常规约定处理，尚未用原始素材逐张对照。

## 安装

下载 Windows x64 完整安装包，不要只复制主 EXE。安装包包含桌面程序、Python worker、资源处理工具及 WebView2 离线安装组件；第三方组件遵循各自许可。AI 对话需用户自行配置模型与 API Key，并可能产生模型服务费用；本地体检无需联网或 API Key。

## What changed

- **Atlas unpack:** Atlas tools now has a Pack / Unpack switch. Unpack mode takes a PixiJS or TexturePacker JSON with its PNG, restores each sprite (rotation and trimming included) and exports a ZIP. Files can be chosen or dragged in.
- **Naming:** The atlas module is now "Atlas tools" in the app and documentation.
- **Docs:** Unpack instructions and limits, plus updated README headings and screenshots.

## Known limitations

- Unpack handles one page per run; multi-page atlases need each page's JSON unpacked separately.
- Rotation direction follows TexturePacker's usual convention and has not yet been checked sprite by sprite against original art.

## Install

The full Windows x64 installer includes the desktop app, Python worker, processing tools and the offline WebView2 installer. Bundled third-party tools retain their own licenses. AI chat uses your own model account and may incur provider charges. Local audits work without a network connection or API key.
