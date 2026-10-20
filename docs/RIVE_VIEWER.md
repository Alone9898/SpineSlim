# Rive 预览 / Rive Viewer

SpineSlim 桌面版新增 Rive 预览工作区。可选择单个 `.riv` 或目录，递归列出文件；画布支持画板、动画及状态机切换、播放/暂停、重置、全屏、适配和对齐。右侧面板可调整缩放、播放速度、背景色和棋盘格，打开画板检查信息，并展开状态机输入、状态时间轴和事件记录。若要在画布上点击或长按，请选择包含交互监听器的状态机并保持播放；单独播放线性动画不会执行状态机交互。动画模式下可拖动时间轴；状态机没有固定时长，因此不提供拖动定位。会话记录可导出本地 JSON，演示模式可隐藏文件和控制面板。

运行时 JS 与 WASM 随安装包提供；文件读取通过 Tauri 后台完成，限定为用户选择的本地资源，每个文件最大 64 MB。Rive 文件中引用的外部素材目前不会从网络自动下载；如遇到缺失素材，请使用嵌入素材导出的 `.riv`。最新 Rive 数据绑定属性与传统状态机输入属于不同机制，当前面板只展示后者。

The desktop Rive workspace opens a `.riv` file or scans a folder. It provides artboard, animation and state machine selection, playback speed, animation seeking, scale and layout settings, fullscreen and review modes, legacy Boolean/Number/Trigger inputs, a state timeline, an event log, and local JSON session export. For direct click and hold interactions on the canvas, select a state machine with interaction listeners and keep playback running; linear animation mode does not run state-machine interactions. State machines have no fixed duration and cannot be scrubbed. The runtime is bundled for offline use. External Rive assets are not fetched automatically, and data binding properties are not yet exposed in the input panel.
