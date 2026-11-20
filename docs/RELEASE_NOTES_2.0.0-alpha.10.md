# SpineSlim 2.0.0-alpha.10

Windows x64 预发布版 / Windows x64 pre-release.

## 本次更新

- **粒子预览**：新增粒子查看器，可预览 `@pixi/particle-emitter` 的发射器 JSON，实时调整参数，并另存为新文件。
- **文档**：新增发布流程说明；README 改为英文并补充检索说明，移除 README.en-US。

## 修复

- **Spine 压缩遇到已有压缩格式资源时失败**：此前若贴图旁已存在同名的压缩格式文件（例如 `xxx.png` 旁已有旧的 `xxx.webp`），转换会报「输出名称冲突」并中断整个流程。现在会直接替换已有文件，处理正常完成。处理在输出目录的副本上进行，不会改动源素材。

## 已知限制

- 粒子查看器目前仅支持 `@pixi/particle-emitter` 的配置格式。
- Spine 骨骼文件转换（json / skel 互转）遇到同名输出仍会报冲突，行为未变。

## 安装

下载 Windows x64 完整安装包，不要只复制主 EXE。安装包包含桌面程序、Python worker、资源处理工具及 WebView2 离线安装组件；第三方组件遵循各自许可。AI 对话需用户自行配置模型与 API Key，并可能产生模型服务费用；本地体检无需联网或 API Key。

## What changed

- **Particle viewer:** Preview `@pixi/particle-emitter` emitter JSON, tweak parameters live and save as a new file.
- **Docs:** Added a release process guide; the README is now English with a search-friendly structure, and README.en-US is removed.

## Fixes

- **Spine compression failed when a compressed texture already existed:** if a same-named compressed file was already next to the source (for example an old `xxx.webp` beside `xxx.png`), conversion aborted with an "output name conflict". The existing file is now replaced and processing completes. Work happens on a copy in the output folder, so source assets are never modified.

## Known limitations

- The particle viewer only supports the `@pixi/particle-emitter` config format.
- Spine skeleton conversion (json / skel) still reports a conflict when the output name already exists; unchanged.

## Install

The full Windows x64 installer includes the desktop app, Python worker, processing tools and the offline WebView2 installer. Bundled third-party tools retain their own licenses. AI chat uses your own model account and may incur provider charges. Local audits work without a network connection or API key.
