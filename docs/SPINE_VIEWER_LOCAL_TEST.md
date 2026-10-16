# Spine 预览器：首轮本地测试记录

日期：2026-10-16。状态：第一批本地 Alpha 已实现，完整验收尚未完成。未推送、未创建 Release。

[设计方案](SPINE_VIEWER_DESIGN.md) · [完整验收方案](SPINE_VIEWER_ACCEPTANCE.md)

## 已交付的本地功能

- 现有 Tauri 窗口新增「Spine 预览」；目录选择、导出文件集合选择、目录拖放和刷新。
- 递归扫描、版本识别、保留层级的目录树、搜索/筛选、虚拟列表和目录栏收起。
- 同名/同目录唯一 Atlas 自动匹配，有歧义时手动选择；多页纹理按 Atlas 相对路径读取，异常具体到文件。
- 3.8、4.0、4.1、4.2 的运行时适配；4.0 使用 runtime-4.1 内置的 4.0 兼容解析分支；JSON 与 SKEL 加载；PNG/JPG/WebP 解码路径。
- 动画、皮肤、播放/暂停、循环、速度、时间定位、缩放/平移、适应画布、背景/网格/原点、骨骼调试和 Alpha 选择。
- 初次加载优先 idle，否则选首个非零时长动画；有限时间采样动画范围，避免画布初始构图过小。采样最多 5 秒动画/100ms 计算预算，超出使用已采样范围。
- 窄窗口属性抽屉、中英界面与结构化错误、诊断复制；离页暂停绘制，切换释放旧实例与 GPU 资源。
- 原生侧只读会话、已扫描文件 ID 读取、过期会话拒绝、链接/junction 检查和大小限制。

## 本轮验证结果

环境：当前 Windows 开发机、Tauri Debug + WebView2，使用独立 WebView 测试目录运行自动化。未覆盖干净电脑或全部显卡。

| 骨架实际导出版本 | Runtime | JSON | SKEL |
| --- | --- | --- | --- |
| 3.8.55 | pixi-spine runtime-3.8 4.0.6 | 通过首轮检查 | 通过首轮检查 |
| 4.0.31 | pixi-spine runtime-4.1 4.0.6（4.0 兼容） | 通过兼容回归 | 通过兼容回归 |
| 4.1.17 | pixi-spine runtime-4.1 4.0.6 | 通过首轮检查 | 通过首轮检查 |
| 4.2.22 | spine-webgl 4.2.120 | 通过首轮检查 | 通过首轮检查 |

素材：官方 spine-runtimes 各分支的 spineboy-pro，位于忽略目录 `output/viewer-fixtures`。

### Spine 4.0.64 兼容修复

对照本地 `Editor2.html` 使用的 pixi-spine 通用加载器，4.0 与 4.1 均交给 runtime-4.1。该运行时的二进制解析器根据文件版本设置 `ver40`，不是修改源文件版本号。原来直接调用 runtime-4.0 时，`base_door.skel` 的动画姿态和边界与参考加载器不同。

浏览器回归脚本 `tests/viewer_adapters_smoke.js` 验证了四个版本的八个官方 JSON/SKEL 样例，以及本地 4.0.64 素材的 `in`、`loop`、`out` 动画：边界有效、画面非空、不同时间点像素发生变化。截图位于忽略目录 `output/playwright/base-door-fixed.png`。此轮测试为 Chromium + WebGL，不等同于完整显卡兼容验收。

运行方式：先启动 Vite，使用 Playwright CLI 的 `run-code --filename tests/viewer_adapters_smoke.js`。官方样例由 `scripts/fetch_viewer_fixtures.py` 下载；用户素材只在本机 `output/door-fixture` 存在时追加检查，不纳入源码或安装包。

本轮检查包含：版本路由、骨架/Atlas/纹理解析、walk 动画固定步进至 0.5 秒、WebGL 非空像素读取、重置后相同时刻的包围盒一致性；界面逐项切换 8 个资源、选择 walk、暂停、定位到 0.5 秒、适应画布和恢复播放。源素材测试前后 SHA-256 一致。

另验证：路径穿越、绝对路径和网络 URL page 被拒绝；释放后的目录会话不能继续读取。Rust 二进制版本头测试通过。TypeScript + Vite 生产前端构建通过；有 Pixi 延迟加载 chunk 大于 500 kB 的体积提示，不影响构建。

检查截图位于本机 `output/playwright/viewer-0.png` 至 `viewer-7.png`。截图发现并修复旧版骨骼调试默认显示的问题；重复定位测试发现并修复旧版包围盒读取受显示对象变换影响的问题。

这些结果是加载和交互冒烟测试，不等价于与 Spine 编辑器逐帧视觉对照通过，也不证明该版本族的所有补丁或特性兼容。

## 尚未完成的验收与已知边界

- 3.6、3.7、4.3+ 未接入；Basis/KTX/KTX2 未接入，显示不支持提示。
- 4.2 同一 Atlas 的页面混用 PMA/straight alpha 时明确拒绝；不能宣称此项已兼容。
- 多动画编排尚未实现；GIF/MP4 已按后续用户要求加入，见下节。
- 目录会话刷新目前重新选择第一项；尚未实现刷新保留选择、追加授权纹理目录、手动覆盖未知导出版本、侧栏拖拽调整宽度。
- 当前同目录唯一 Atlas 的推荐不预先解析全部 attachment；实际加载不匹配时会报错，用户可重新选择。
- 目录扫描跳过无法识别的普通/损坏 JSON，尚未区分所有损坏骨架与普通 JSON。
- 超大图片的解码尺寸在解码后验证；压缩图片解码峰值内存、大文件扫描性能仍需专门压力测试。
- PNG 官方样例已实际绘制；JPG/WebP、多页 Atlas、复杂皮肤、物理约束、PMA 边缘及多种混合模式需要补充素材矩阵。
- Windows 10/11 干净安装、断网完整启动、长时间内存曲线、WebGL 丢失恢复和原处理流程完整回归尚未执行。
- 本轮未重新生成安装包，之前的安装包不含此模块。请使用当前开发窗口测试。
- 运行时许可文本已收集并加入 Tauri bundle 资源配置；商业分发条件和全部传递依赖审计仍未完成。

## 增补：全屏、网格拖拽、GIF / MP4

本地已实现并测试：

- 播放条「画布全屏」按钮进入原生 WebView 全屏，按钮或 Esc 退出，保留播放条和参数面板。
- 左键/中键拖动画布平移；网格和原点与骨架使用相同视图坐标，滚轮缩放同步更新网格。
- 参数面板下方「导出 GIF / MP4」，选择最长边 512/720/1080 和 15/24/30/60 FPS；使用当前动画、皮肤、速度和取景，不包含网格、调试线或音频。
- GIF 可透明（GIF 为二值透明，不保留半透明渐变）；MP4 为 H.264/yuv420p，以当前背景色合成，无透明通道。
- 独立离屏渲染器按固定步进生成 PNG 帧，本地 FFmpeg 编码；需要在设置中配置 FFmpeg。导出单周期，按速度计算最长 30 秒；静态姿态生成 1 秒。
- 原生保存对话框选择目标；输出名保留对应扩展名。编码完成前不替换目标文件，取消/失败清理临时帧；异常断电或强制结束应用仍可能留下隐藏临时目录。
- 可取消导出；换资源时取消旧导出，关闭窗口时提示取消当前导出。进度区编码阶段为真实等待状态，不假造百分比。

验证记录：`tests/viewer_controls_smoke.js` 通过拖拽网格、全屏进入/退出和 Esc 测试；`tests/viewer_export_smoke.js` 通过官方 4.2 样例的 GIF/MP4 实际导出、帧生成阶段取消、编码交接阶段取消和坏帧编码失败。512×512、15 FPS、1 秒 MP4 用 FFmpeg 完整解码 15 帧；GIF 用 Pillow 检查 15 帧、循环和每帧透明角点。取消/失败前后已有目标文件哈希一致，无残留临时帧目录。尚未做全部运行时/分辨率/FPS 的组合矩阵和长时间编码压力测试。

## 开发与复现

先按 Tauri 开发环境安装依赖，保留 Python worker 构建结果：

```powershell
npm ci
python scripts/build_worker.py
npm run desktop
```

获取本地测试素材（需要网络，素材不提交、不打包）：

```powershell
python scripts/fetch_viewer_fixtures.py
```

在启用 WebView2 CDP 的独立测试窗口中，用 Playwright CLI 附加对应端口；避免对用户正在操作的窗口执行自动化。开发窗口使用 `src-tauri/target/debug/spineslim.exe`，先启动 Vite，设置 `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9224`，并为测试进程设置独立 `WEBVIEW2_USER_DATA_FOLDER`。

```powershell
npx --yes --package @playwright/cli playwright-cli -s=viewer-test attach --cdp http://127.0.0.1:9224
npx --yes --package @playwright/cli playwright-cli -s=viewer-test run-code --filename tests/viewer_smoke.js
npx --yes --package @playwright/cli playwright-cli -s=viewer-test run-code --filename tests/viewer_ui_smoke.js
```

测试脚本假定中文界面和默认 Debug 输出路径。运行时测试会释放其目录会话，应与用户窗口隔离。UI 脚本生成截图，运行时脚本会在任何断言失败时抛错。
