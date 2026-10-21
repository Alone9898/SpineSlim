# 匿名使用统计 / Anonymous Usage Analytics

SpineSlim 使用 PostHog Cloud 事件统计。设置中的「匿名使用统计」每次启动默认开启，包括旧配置曾保存关闭状态的情况；关闭仅对本次运行有效。未配置 PostHog 项目 Key 时不会发送事件。用户关闭后，应用立即停止发送后续事件并删除本机随机统计标识。统计请求失败不会影响任何本地功能。

SpineSlim uses PostHog Cloud event analytics. Anonymous usage statistics are on by default at every launch, including when an older configuration saved the option as off. Turning it off applies to the current session. No events are sent without a PostHog project key. Turning the option off immediately stops future events and deletes the locally stored random analytics ID. Network failures never block local work.

## 配置 / Configuration

仓库跟踪的 `.env.production` 已配置 PostHog **项目 API Key** 和美国区 `VITE_POSTHOG_HOST`，换电脑后直接构建即可。项目 Key 会写入客户端，本身不是个人 API Token；不要在此文件放任何私密凭据。开发模式不发送事件；更改配置后需重新构建。

The tracked `.env.production` already contains the PostHog **project API key** and US `VITE_POSTHOG_HOST`, so production builds work on another computer. The project key is public in the client; never put a personal API token or other secret in this file. Development mode does not send events. Rebuild after changing the configuration.

## 事件 / Events

事件名、模块名、操作、错误代码和阶段由 `frontend/src/telemetry.ts` 中的枚举定义。新增功能时先扩展枚举，再调用统一统计函数，避免不同模块使用不同名称。当前事件：

`module_open` 仅在实际进入新模块时发送一次；重复点击当前模块不会重复发送，离开后重新进入会再计一次。已开启统计的用户启动应用时，初始模块计一次；在设置页刚开启统计不会补记当前页面或本次启动。

`module_open` is sent once per actual module entry. Clicking the current module again does not duplicate the event; returning after leaving counts a new entry. Launching with consent records the initial module once. Enabling analytics in Settings does not backfill the current page or launch.

| Event | Properties | Purpose |
| --- | --- | --- |
| `app_open` | `module=app`, `action=open` | 启动次数 / App launches |
| `module_open` | Module enum, `action=open` | 模块使用 / Module usage |
| `process_start` | Module, action, operation ID, file-count bucket | 处理启动 / Processing starts |
| `process_success` / `process_cancel` | Same operation ID, duration and file-count buckets | 成功与取消 / Success and cancellation |
| `process_error` | Same operation ID, buckets, error code and stage | 失败原因 / Failure reasons |
| `feature_use` | Module, action, file-count bucket | 扫描、导出、试听等操作 / Scans, exports and previews |
| `app_error` | Module, action, safe error code and stage | 独立功能失败 / Standalone feature failures |

资源处理（Spine、UI、视频）和音频批量、拼接、音频图集共用处理流程埋点。每次任务生成随机 `operation_id`，开始一次，最终只记录成功、失败或取消其中一种；失败代码和阶段仅取固定白名单，不使用异常文本。其他模块只在用户实际完成扫描、导出、试听等操作时记录 `feature_use`，不会随渲染或进度更新重复记录。更新检查使用已有 `feature_use`；暂不增加 `app_update` 或 `app_close`。

Asset processing (Spine, UI, video) and audio batch, merge and sprite export share the operation lifecycle. Each task has a random `operation_id` and exactly one terminal event: success, error or cancel. Error codes and stages come from fixed allowlists, never exception text. Other modules record `feature_use` only after a real scan, export or preview succeeds, not on render or progress updates. Update checks use `feature_use`; `app_update` and `app_close` are not collected.

所有事件包含 `module`、`action`、`app_version`、`platform` 和 `region`。处理事件另含 `file_count_bucket`；最终事件另含 `duration_bucket`；失败事件另含 `error_code`、`stage`。`unknown` 表示文件数量暂不可得。/ Every event includes module, action, app version, platform and region. Processing events also include a file-count bucket; terminal events include a duration bucket; failures include a safe error code and stage. `unknown` means the file count is not available.

## 验收 / Verification

1. 在正式桌面构建中开启匿名统计，重启后依次进入 Spine、Rive、3D、图集、资源处理、音频和设置；在 PostHog Activity 中按匿名 ID 筛选，确认每次真实进入只有一个 `module_open`。反复点击当前模块不应增加事件。
2. 每个模块完成一次扫描或导出；资源处理分别运行 Spine、UI、视频和音频三种操作。确认每次任务只有一个 `process_start` 和一个终态事件，`operation_id` 相同。
3. 分别制造处理失败和取消，确认失败仅带白名单 `error_code`、`stage`，取消不算失败；检查事件属性中没有路径、文件名、素材内容或原始堆栈。
4. 关闭匿名统计，重复以上操作；确认 Activity 不再出现该安装 ID 的新事件。断网后重复操作，确认软件仍能正常处理。

Enable analytics in a production desktop build, then use PostHog Activity to verify one module event per real entry and one start plus one matching terminal event per processing task. Exercise success, failure and cancellation across modules, inspect properties for sensitive data, and verify opt-out and offline operation. Development mode intentionally sends no events.

所有事件只带固定枚举、版本及 `region`（系统语言环境中的国家/地区代码；无法取得时为 `unknown`）等信息。该字段是语言环境推断值，不代表用户实际所在地。不发送文件名、路径、素材内容、日志、错误原文或精确处理时长；不启用自动采集、会话回放、IP 地理位置解析或个人资料处理。统计标识由本机随机生成，不用于付费授权或身份验证。PostHog 作为接收方仍会在网络层接触请求 IP；收集真实用户数据前，应在产品隐私说明中公开统计服务、数据托管区域和退出方式。

Events contain only fixed enums, version metadata and `region`, a country/region code inferred from the system locale (`unknown` when unavailable). This is not the user's actual location. Filenames, paths, assets, logs, raw errors and exact processing times are not sent. Autocapture, session replay, IP geolocation enrichment and person-profile processing are disabled. The random local analytics ID is not a payment or identity credential. PostHog still receives the request IP at the network layer. Before collecting production data, disclose the analytics provider, hosting region and opt-out path in the product privacy notice.
