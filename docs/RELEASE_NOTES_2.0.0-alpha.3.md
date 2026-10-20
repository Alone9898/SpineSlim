# SpineSlim 2.0.0-alpha.3

> Windows x64 完整安装包。所含第三方工具不附带个人授权或激活信息；请阅读安装目录中的 `THIRD_PARTY.md`、`PACKAGE-README.txt` 和 `licenses`，并确认自身具备相应使用权。

## 新功能

- **Rive 预览**：打开单个 `.riv` 或扫描目录，切换画板、动画和状态机；支持播放控制、动画时间轴、全屏、布局调整、传统状态机输入、事件记录和本地会话 JSON 导出。运行时随前端打包，可离线预览嵌入素材的文件。
- **软件更新检查**：启动时查询 GitHub Releases；设置中可手动检查。发现更高版本且有 Windows EXE 时显示版本和发布页入口。当前流程由用户自行下载安装，不会自动替换程序。

## 修复

- 修复 GitHub 发布列表顺序与版本号顺序不一致时可能漏报新版本的问题。
- 修复 Spine 并发升级中进度回调异常时可能遗留临时 JSON 文件的问题。
- 统一 Spine / Rive 预览与其他工作区的顶部留白、侧栏菜单项高度。
- 修正 Rive 画布缩放后的点击坐标，启用默认数据绑定，并避免加载提示遮挡画布交互。

## 优化

- Spine JSON 升级最多并发运行 8 个转换任务，减少重复读取和校验；进度按实际完成顺序更新，同时保持结果列表的文件顺序。16 份 Spine 3.8 测试素材的升级阶段由约 0.78–0.82 秒降至 0.20–0.22 秒；实际整批处理还取决于素材、磁盘、复制和纹理转换耗时。
- 侧栏移除语言下拉；中文 / English 切换集中在设置页。

## 已知限制

- 目前仅提供 Windows x64 桌面构建；软件更新仅提示并打开下载页，不执行应用内安装。
- Rive 外部素材不会自动从网络加载；数据绑定属性暂未纳入传统状态机输入面板。

## 本地验证

- 前端 `npm run build` 通过；Rust 单元测试 3 项通过；Spine / worker 测试 29 项通过、1 项因系统不允许创建符号链接而跳过。
- 用真实交互 `.riv` 验证状态机：点击 Launch 进入仪表盘，长按加速器时 `isAccelerating` 变为 `true`。
- 完整安装包已构建并完成部分处理流程冒烟测试；第三方组件的再分发条款尚未完成独立核验。

## Features

- **Rive viewer:** Open a `.riv` file or scan a folder; switch artboards, animations and state machines. Playback, animation seeking, fullscreen, layout controls, legacy state-machine inputs, event logs and local JSON session export are available. The runtime is bundled for offline previews of embedded assets.
- **Update checks:** Check GitHub Releases at startup or manually in Settings. A newer release with a Windows EXE shows its version and download page. Installation remains a manual step.

## Fixes

- Select the highest eligible release by version, even when GitHub returns releases in a different order.
- Clean up temporary Spine JSON files if a progress callback fails during parallel conversion.
- Align the Spine and Rive viewer spacing with other workspaces and normalize sidebar navigation rows.
- Correct pointer coordinates after zooming the Rive canvas, enable default data binding, and prevent the loading overlay from intercepting input.

## Improvements

- Run up to eight Spine JSON converter tasks concurrently, avoid redundant JSON reads, and report progress as files finish while preserving result order. In a 16-file Spine 3.8 sample, the upgrade stage fell from about 0.78–0.82 s to 0.20–0.22 s; end-to-end gains depend on assets, disk I/O and texture processing.
- Move the Chinese / English selector from the sidebar into Settings.

## Known limits

- Windows x64 only for now. Update checks do not install releases automatically.
- External Rive assets are not fetched, and data binding properties are not yet shown among legacy state-machine inputs.

## Local verification

- Frontend build passed; 3 Rust tests passed; 29 Spine/worker tests passed, with 1 skipped because symlink creation is unavailable on this system.
- Verified an interactive `.riv` sample: clicking Launch opens the dashboard, and holding the accelerator sets `isAccelerating` to `true`.
- The full installer was built and smoke-tested for selected processing flows; third-party redistribution terms have not been independently verified.
