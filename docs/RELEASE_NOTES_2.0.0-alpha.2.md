# SpineSlim 2.0.0-alpha.2

## 修复日志

- 修复 Spine 资源处理提交阶段的 Windows `WinError 5`。
- 输出目录 `program/spine` 现在保留原目录，内容逐项迁移到备份并支持失败回滚。
- 修复已构建桌面版没有同步最新 Python worker 的问题。
- worker 构建增加 `Pillow` 与 `tkinterdnd2` 依赖预检，避免生成无法启动的后台程序。
- 增加输出目录被占用时的中文和英文提示。

## Fix log

- Fixed Windows `WinError 5` during Spine output commits.
- The `program/spine` directory is preserved while its contents are moved item by item with rollback support.
- Synchronized the packaged desktop app with the latest Python worker.
- Added build-time checks for the `Pillow` and `tkinterdnd2` worker dependencies.
- Added bilingual guidance when the output directory is locked by another process.

## 验证 / Verification

- Python worker tests: 18 passed, 1 skipped.
- End-to-end Spine processing completed successfully in an isolated temporary directory.
- Packaged worker startup and Pillow import verified.
- Windows x64 Tauri desktop build completed.
