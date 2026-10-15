# 第三方组件与商用 / Third-party components and commercial use

本仓库不附带第三方程序或游戏素材。公开项目源码、添加免责声明或接受许可提示，都不代表取得第三方的使用或分发授权。以下按开发环境中检查到的信息整理，不是完整的依赖授权审计；应以实际使用版本及权利方提供的条款为准。

This repository does not bundle third-party executables or game assets. Publishing source or accepting a license prompt does not grant additional rights. These notes reflect information inspected in the development environment, not a complete license audit. Verify the terms for the exact versions you use.

| 组件 / Component | 注意事项 / Conditions to verify |
| --- | --- |
| TexturePacker | 开发环境随附协议限制被许可方内部使用，并禁止向第三方提供其功能或服务；试用许可禁止商业用途。需确认适用于内部使用、对外服务或分发的授权。`--agree-to-license` 不代表购买或激活。The inspected agreement restricts use to the licensee's internal purposes and prohibits providing its functionality as a third-party service. Evaluation use is not commercial authorization. |
| BMFont | 随附说明允许免费使用，但分发该程序需联系作者许可；另提到源码使用 zlib 许可，自行构建也应核对相应源码及依赖条款。The inspected binary distribution asks users to obtain the author's permission before redistribution; its readme also identifies a zlib-licensed source release. |
| FFmpeg | 开发环境的二进制为 GPL v3 或更新版本构建。可商用，但分发必须履行适用的许可、归属和对应源码义务。独立进程调用本身不能直接决定整个 Python 项目的许可。The inspected binary is GPL v3-or-later. Commercial use is permitted subject to applicable terms; redistribution carries license and corresponding-source obligations. |
| ImageMagick | 允许商业使用及分发；分发时应附带许可并提供适用归属声明，也需核对随附依赖。Commercial use and redistribution are permitted subject to the applicable license, attribution, and bundled dependency terms. |
| Basis Universal | 核对实际二进制、源码和第三方依赖的许可及归属要求。Verify the exact build and dependency licenses. |
| SpineSkeletonDataConverter | 来源及授权尚未在本项目中确认。使用或分发前需核实，尤其是 Spine 相关的适用条款。Origin and license are not established by this repository; verify before use or distribution. |
| Python / Tcl/Tk / Pillow / tkinterdnd2 / PyInstaller | 安装包会包含这些运行时或依赖，发布构建时需收集实际版本的许可、版权声明及适用条款。Collect notices and fulfill applicable terms for the runtime, libraries, packager, and their bundled dependencies when distributing builds. |

公司内部使用、发布处理后的资源、向客户分发软件，以及对外提供处理服务，是不同场景。用户还应确认游戏素材、字体和动画的使用及发布权利。

Internal use, publishing generated assets, distributing applications, and providing services are different scenarios. Verify rights to all game assets, fonts, and animations as well.
