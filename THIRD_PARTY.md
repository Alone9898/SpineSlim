# 第三方组件与商用 / Third-party components and commercial use

## Tauri 预览模块 / Tauri viewer modules

3D 模型查看器使用 MIT 许可的 `three`，许可文本见 `docs/licenses/THREE.txt`。FBX、GLTF、OBJ 和 STL 加载器来自同一包；模型和贴图仍受素材作者授权约束。

The 3D model viewer uses MIT-licensed `three` and its FBX, GLTF, OBJ and STL loaders. See `docs/licenses/THREE.txt`. Model and texture rights remain with their owners.

Rive 预览模块使用 `@rive-app/canvas` 2.45.0（MIT 许可），随前端构建打包其 WebAssembly 运行时，离线加载本地 `.riv`。Rive 作品及其外部素材仍需遵循素材权利人的许可。

The Rive viewer uses MIT-licensed `@rive-app/canvas` 2.45.0 and bundles its WebAssembly runtime for offline local `.riv` previews. Rive artwork and external assets retain their owners' terms.

图集打包模块使用 `maxrects-packer` 3.0.0 和 `fflate` 0.8.3，均为 MIT 许可。对应声明见 `docs/licenses/MAXRECTS-PACKER.txt` 和 `docs/licenses/FFLATE.txt`。该模块在本地完成打包和 ZIP 导出，不调用 TexturePacker。参考页面仅用于功能与布局参考。

The atlas packer uses MIT-licensed maxrects-packer 3.0.0 and fflate 0.8.3. Notices are bundled under docs/licenses. Packing and ZIP export run locally without TexturePacker.

AI 对话使用 MIT 许可的 `react-markdown` 10.1.0 排版模型回复；其依赖版本见 `package-lock.json`。模型服务由用户自行选择，只有主动发送时才会联网。

AI chat renders model replies with MIT-licensed `react-markdown` 10.1.0. Dependency versions are recorded in `package-lock.json`. The selected model service is contacted only after the user sends a message.

新增预览模块使用 `pixi.js` 7.4.3、`@pixi-spine/base` 与 3.8/4.0/4.1 适配器 4.0.6，以及 `@esotericsoftware/spine-webgl` 4.2.120。精确依赖树见 `package-lock.json`。Spine Runtime 不属于项目 MIT 许可范围，其使用与再分发适用对应的 Spine Runtimes License Agreement。当前仅本地测试，不代表已完成商业分发许可审计。

The local viewer alpha adds PixiJS 7.4.3, pixi-spine 4.0.6 adapters and spine-webgl 4.2.120. Spine runtime code is subject to its own license, not the project's MIT license. Distribution eligibility has not been established by local testing.

- [Spine 4.2 Runtime notice](docs/licenses/SPINE-RUNTIME-4.2.txt)：取自安装的 npm 包。
- [pixi-spine runtime notice](docs/licenses/PIXI-SPINE.txt)：取自 https://github.com/pixijs/spine/blob/v4.0.6/SPINE-LICENSE （npm 子包未包含该文件）。
- [PixiJS notice](docs/licenses/PIXI.txt)：取自安装的 npm 包。

官方 spineboy 样例仅下载到被 Git 忽略的本地测试目录，不随应用打包。发布前仍需完成全部传递依赖的许可材料收集和适用条件核验。

## 已发布旧版 / Published legacy application

本仓库不附带外部资源处理程序或游戏素材。Release EXE 包含 Python、Tcl/Tk、Pillow、tkinterdnd2、tkdnd 及 PyInstaller 引导程序；其许可材料随发布 ZIP 提供，也可单独下载 `licenses.zip`。公开项目源码、添加免责声明或接受许可提示，都不代表取得第三方的额外使用或分发授权。以下按开发环境中检查到的信息整理，不是完整的依赖授权审计；应以实际使用版本及权利方提供的条款为准。

External asset-processing tools and game assets are not bundled. Release executables include Python, Tcl/Tk, Pillow, tkinterdnd2, tkdnd, and the PyInstaller bootloader; license materials are included in the release ZIP and available in `licenses.zip`. Publishing source or accepting a license prompt does not grant additional rights. These notes reflect information inspected in the development environment, not a complete license audit. Verify the terms for the exact versions you use.

| 组件 / Component | 注意事项 / Conditions to verify |
| --- | --- |
| TexturePacker | 开发环境随附协议限制被许可方内部使用，并禁止向第三方提供其功能或服务；试用许可禁止商业用途。需确认适用于内部使用、对外服务或分发的授权。`--agree-to-license` 不代表购买或激活。The inspected agreement restricts use to the licensee's internal purposes and prohibits providing its functionality as a third-party service. Evaluation use is not commercial authorization. |
| BMFont（旧版 / Legacy） | 最新源码已移除此程序依赖，艺术字由 Pillow 生成；已发布 v1.0.0 仍有程序检查。旧程序的分发要求应核实作者许可。The latest source uses Pillow instead; published v1.0.0 retains the legacy executable check. Verify the author's terms if redistributing the old program. |
| FFmpeg | 开发环境的二进制为 GPL v3 或更新版本构建。可商用，但分发必须履行适用的许可、归属和对应源码义务。独立进程调用本身不能直接决定整个 Python 项目的许可。The inspected binary is GPL v3-or-later. Commercial use is permitted subject to applicable terms; redistribution carries license and corresponding-source obligations. |
| ImageMagick | 允许商业使用及分发；分发时应附带许可并提供适用归属声明，也需核对随附依赖。Commercial use and redistribution are permitted subject to the applicable license, attribution, and bundled dependency terms. |
| Basis Universal | 核对实际二进制、源码和第三方依赖的许可及归属要求。Verify the exact build and dependency licenses. |
| SpineSkeletonDataConverter | 来源及授权尚未在本项目中确认。使用或分发前需核实，尤其是 Spine 相关的适用条款。Origin and license are not established by this repository; verify before use or distribution. |
| Python / Tcl/Tk / Pillow / tkinterdnd2 / PyInstaller | 安装包会包含这些运行时或依赖，发布构建时需收集实际版本的许可、版权声明及适用条款。Collect notices and fulfill applicable terms for the runtime, libraries, packager, and their bundled dependencies when distributing builds. |

公司内部使用、发布处理后的资源、向客户分发软件，以及对外提供处理服务，是不同场景。用户还应确认游戏素材、字体和动画的使用及发布权利。

Internal use, publishing generated assets, distributing applications, and providing services are different scenarios. Verify rights to all game assets, fonts, and animations as well.
