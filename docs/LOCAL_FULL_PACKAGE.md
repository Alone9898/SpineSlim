# Windows 本地完整测试包

该包包含生产模式界面、Python 后台和当前处理流程需要的五个外部工具：ImageMagick、Basis Universal、FFmpeg、TexturePacker、SpineSkeletonDataConverter。安装程序附带 WebView2 离线安装组件。默认进入 Spine 预览，设置入口位于侧栏底部。

此构建仅用于本地测试，不代表第三方工具已获得公开再分发许可。TexturePacker 的激活状态不会随包迁移，换电脑后仍可能需要合法授权和激活。Spine 编辑器不在包中，也不是目录预览必需的组件。不要将本地完整包直接上传 GitHub Release。

## 构建

在 Windows x64 上安装项目依赖、Rust/MSVC、Python 和 PyInstaller 后运行：

```powershell
python scripts/build_local_full.py --tools-source "D:\tools-source" --imagemagick "D:\tools-source\ImageMagick-portable"
```

工具源目录应包含 `basisu.exe`、`ffmpeg.exe`、`SpineSkeletonDataConverter.exe`，以及完整的 `TexturePacker/bin` 和 `TexturePacker/resources`。ImageMagick 参数应指向官方便携目录，不应指向包含个人文件的通用目录。

脚本固定使用被 Git 忽略的 `output/local-full/`，不再创建时间戳目录。每次重新生成该目录内的 `payload/`，只复制选定的工具文件、依赖、协议及项目说明，不复制用户配置、游戏素材或系统中的激活信息。工具源目录必须位于 `payload/` 之外。每个资源文件的 SHA-256 记录在 `payload/bundle-manifest.json`。

安装包固定输出到 `output/local-full/SpineSlim_windows-x64_local-full-setup.exe`。构建成功后替换上一次安装包；构建失败时保留上一次成功的安装包。软件版本仍读取 `src-tauri/tauri.conf.json`。Rust 和 Python 构建缓存复用原目录，不需要每次手动清理。

先重建 Python 后台并验证五个工具的包内路径，再进行图片、UI 图集和视频处理测试，最后调用 Tauri 创建 NSIS 安装包。构建过程下载 WebView2 离线安装组件，因此构建机需要联网。普通轻量包的 Tauri 配置不变；完整包通过独立配置附加资源。

## 验证范围

- 不提供用户工具配置时，五个工具均从包内路径发现并通过执行检查。
- Spine 图片保留格式、WebP、JPG、Basis；UI 图片及图集；视频处理冒烟测试。
- 处理完成后源文件哈希保持不变。
- 全新 Windows、离线安装、第三方激活和完整预览导出流程仍需换机验收。

安装后请保留 `tools` 目录。可在设置中指定工具路径；有效的手动工具路径优先于包内工具，失效路径自动回退到包内工具。
