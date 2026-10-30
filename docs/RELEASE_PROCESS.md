# 发布流程 / Release process

本文记录 SpineSlim 发布一个版本的完整步骤，包括轻量包（CI 自动构建）和本地完整测试包（手动上传）。

## 一、发布版本号

版本号需要同步修改以下文件，搜索旧版本号确认没有遗漏：

```
git grep -n "2\.0\.0-alpha\.<旧号>" -- ':!docs'
```

- `package.json`、`package-lock.json`（两处）
- `src-tauri/Cargo.toml`、`src-tauri/Cargo.lock`
- `src-tauri/tauri.conf.json`
- `version_info.txt`（`filevers`、`prodvers`、`OriginalFilename`、`ProductVersion`）
- `app_runtime.py`（`APP_VERSION`）
- `frontend/src/App.tsx`（页脚回退版本号）
- `README.md`、`README.zh-CN.md`、`README.en-US.md`（当前源码版本）
- `llms.txt`

## 二、发布说明

新建 `docs/RELEASE_NOTES_<版本号>.md`，格式参照 `docs/RELEASE_NOTES_2.0.0-alpha.8.md`，包含：

- 本次更新、修复、已知限制（中英文）
- 安装说明

CI 会读取这个文件作为 Release 正文，文件名必须与标签对应：标签 `v2.0.0-alpha.9` 对应 `RELEASE_NOTES_2.0.0-alpha.9.md`。

## 三、提交与推送

```
git add <改动的文件>
git commit -m "release: <版本号>"
git push origin main
```

提交前确认 `output/`、`src-tauri/binaries/`、`src-tauri/target/` 没有被加入（它们已在 `.gitignore` 中）。

## 四、打标签，触发轻量包 Release

```
git tag -a v<版本号> -m "SpineSlim <版本号>"
git push origin v<版本号>
```

推送标签后，`.github/workflows/release.yml` 会自动：

1. 在 `windows-latest` 上安装 Node 22.12、Python 3.12、stable Rust；
2. 执行 `pip install -r requirements.txt pyinstaller`、`npm ci`、`python scripts/build_worker.py`、`npm run package`；
3. 上传 `src-tauri/target/release/bundle/nsis/*.exe`；
4. 创建 GitHub Release，正文为发布说明，名称含 `alpha` / `beta` / `rc` 的自动标为 pre-release。

进度在 https://github.com/Alone9898/SpineSlim/actions 查看。CI 产物是**轻量包**（不含外部工具），约 22 MB。

## 五、本地完整测试包（不公开发布）

完整包包含 ffmpeg、basisu、SpineSkeletonDataConverter、TexturePacker、ImageMagick。`docs/LOCAL_FULL_PACKAGE.md` 说明它仅供本地测试，第三方工具没有确认公开再分发许可，**不要上传到公开 Release**。

在 Windows x64 本机执行（Git Bash 下）：

```
python scripts/build_local_full.py --tools-source "<tools-source 目录>" --imagemagick "<ImageMagick 便携目录>"
```

`<tools-source 目录>` 必须包含：

- `ffmpeg.exe`
- `basisu.exe`
- `SpineSkeletonDataConverter.exe`
- `TexturePacker/bin/TexturePacker.exe` 及 `TexturePacker/resources/`

`<ImageMagick 便携目录>` 必须包含 `magick.exe`。

产物：`output/local-full/SpineSlim_windows-x64_local-full-setup.exe`（约 312 MiB），清单在 `output/local-full/payload/bundle-manifest.json`。

本机已知的工具位置（仅供参考）：

- tools-source：`output/full-tools-source/`（已含 ffmpeg、basisu、SpineSkeletonDataConverter、TexturePacker）
- ImageMagick：`/d/SpineSlim/tools/imagemagick`

## 六、手动上传完整包（如确需上传）

1. 确认每个第三方工具的再分发许可，尤其是 TexturePacker（商业软件，通常不允许再分发）。
2. 用你本机已登录的 `gh` 上传（需要先 `gh auth login`）：
   ```
   gh release upload v<版本号> "output/local-full/SpineSlim_windows-x64_local-full-setup.exe" --repo Alone9898/SpineSlim
   ```
   或在网页上打开 https://github.com/Alone9898/SpineSlim/releases/tag/v<版本号>，点 **Edit**，拖入附件后保存。
3. 上传后，任何人都可以下载该文件。

## 七、注意事项

- **令牌**：SSH 密钥只能推送 git 仓库，不能上传 Release 附件。上传需要 GitHub 令牌（fine-grained，只授予本仓库 Contents 读写权限）。令牌不要写进任何文件或提交到仓库，用完后到 GitHub 设置页撤销。
- **删除旧版本**：删除 Release 时，附件无法恢复；删除 tag 不会自动删除 Release。删除前先用 `curl https://api.github.com/repos/Alone9898/SpineSlim/releases/tags/<tag>` 确认对应的 Release。
- **首次运行 CI**：若 `build-windows` 失败，先看 Actions 日志，常见问题是 Windows 环境或依赖安装步骤。
