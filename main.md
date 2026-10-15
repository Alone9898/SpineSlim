##### 运行
python -m pip install -r requirements.txt
python .\main.py

##### 打包
python -m pip install -r requirements.txt pyinstaller
python -m PyInstaller --noconfirm --clean --distpath dist-current --workpath build-current ResManage.spec

##### 说明
- 不要直接使用 `pyinstaller` 命令，机器上有多套 Python 时容易调用到错误环境。
- 先用 `python -c "import sys; print(sys.executable)"` 确认当前解释器。
- 如果打包后提示 `No module named PIL`，说明打包时没有走当前这套 Python 环境。
- 优先使用 `dist-current` 里的新包，不要继续运行旧的 `dist\ResManage-v1.1.exe`。
- 打包产物必须包含 `SpineSkeletonDataConverter.exe`，用于可选的 Spine 4.2 兼容处理。
- v1.4 打包产物必须包含 `ffmpeg.exe`，用于生成 `program/video/pc` 和 `program/video/mobile` 下的 WebM 视频。


##### 处理规则
- fr_开头的为序列帧,使用当前的目录名称为分组打图集
- winnum开头的为艺术字,使用当前的目录名称为字体名称

##### 开源与商用注意事项
- 本项目集成了第三方资源处理工具。公开项目源码不代表取得这些工具的商业使用或再分发授权；添加本说明也不能替代相应授权或许可证义务。
- 发布源码前，应确认代码版权归属及公司、客户或其他合同限制。项目自有代码的开源许可应通过正式的 `LICENSE` 文件明确，本说明不授予开源许可，也不改变第三方组件的许可。
- 建议公开 Python 源码、测试、依赖清单、运行文档和脱敏示例配置。第三方可执行程序由使用者从官方渠道获取，并按各自许可证安装、使用。
- 对外发布前，应移除无权发布的游戏素材、字体、游戏列表、内网地址和个人路径，并排除构建产物、缓存及诊断素材。还应检查 Git 历史；仅删除当前文件或添加 `.gitignore` 不会清除历史内容。

| 第三方组件 | 使用及分发注意事项 |
| --- | --- |
| TexturePacker | 当前随附协议限制为被许可方内部使用，禁止向第三方提供其功能或服务；试用许可禁止商业用途。对外提供相关功能或随产品分发前，应向权利方确认并取得适用授权。代码中的 `--agree-to-license` 仅表示接受协议，不代表购买、激活或取得分发权。 |
| BMFont | 当前随附说明允许免费使用，但分发该程序需联系作者取得许可。说明同时提到源码采用 zlib 许可，如选择自行构建，应核实对应源码及依赖的许可条件。 |
| FFmpeg | 当前随附二进制采用 GPL v3 或更新版本许可。允许商业使用，但分发时须履行适用的许可、版权声明及对应源码提供义务。通过独立进程调用，不应直接推导为整个 Python 项目必须开源。 |
| ImageMagick | 允许商业使用及随产品分发；分发时需附带许可证并保留适用的归属声明。 |
| SpineSkeletonDataConverter、BasisU 及其他依赖 | 发布前需核实实际版本、来源、许可证和分发条件，不能仅凭文件可运行或可下载认定允许商用或再分发。 |

- 公司内部使用、向客户分发软件和对外提供处理服务属于不同场景，应分别核对适用条款。
- 以上说明依据当前项目随附的许可信息整理，不是完整的依赖授权审计。组件版本或获取来源变化后，应重新核对；如需发布包含第三方程序的安装包，也应先完成授权及随包许可材料准备。
