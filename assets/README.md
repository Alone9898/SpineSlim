# 图标资源 / Icon assets

- `app-icon.ico`：Windows EXE 和窗口图标，包含多个尺寸。Windows executable and window icon in multiple resolutions.
- `app-icon.png`：512 × 512 的界面图标。512 × 512 icon used by the desktop interface.
- `brand.png`：用户提供的原始图标，用于重新生成资源，不随 EXE 打包。Original artwork retained for regeneration; not bundled in the executable.

在项目根目录执行 `python prepare_icon.py assets/brand.png` 可重新生成图标。脚本按原始图片的固定区域裁剪，适用于当前这张原图；PNG 使用无损压缩。

Run `python prepare_icon.py assets/brand.png` from the project root to regenerate icons. The crop is specific to the current original artwork. PNG compression is lossless.

当前项目不使用根目录的 `icon.ico`。更改图标后，需要重新打包 EXE 才会更新已发布程序的图标。

This project does not use a root-level `icon.ico`. Rebuild the executable after changing icons to update packaged applications.
