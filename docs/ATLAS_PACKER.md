# 图集工具 / Atlas tools

本地开发版菜单中的独立模块，顶部可在「打包」和「解析」之间切换。打包模式布局为素材列表、图集预览、打包设置三栏。导入空状态支持选择图片或文件夹。参考页面仅用于布局和交互参考，打包实现使用 MIT 许可的 MaxRects 与 ZIP 库。

## 解析

切换到「解析」后，选择或拖入一份图集的 JSON 与对应 PNG，程序会按 JSON 中的位置信息把每张小图还原出来，并导出为 ZIP。

1. 同时选择（或拖入）图集的 `.json` 与 `meta.image` 指定的 `.png`，两者需要一起提供。
2. 解析时按 `rotated` 标记逆时针转回旋转的图，再按 `spriteSourceSize` 贴回 `sourceSize` 大小的透明画布，恢复裁剪前的尺寸。
3. 点击「导出小图 ZIP」，ZIP 内每张图的路径与 JSON 的帧名一致，保留扩展名为 `.png`。

支持的输入：PixiJS spritesheet JSON 与 TexturePacker JSON（`frames` + `meta.image` 结构）。一次只处理一页，多页图集需要分别解析各页的 JSON。单个 JSON 最多 500 个帧，PNG 解码后不超过 8192 px 且不超过 32 Mi 像素。

限制：

- 解析结果是 PNG，原图若为 JPG 或 WebP，格式无法从图集中恢复。
- 如果打包时设置了输出缩放（非 100%），像素已被重采样，无法还原到原始分辨率。
- 不会自动关联 `related_multi_packs`，也不做拖放以外的批量处理。
- 旋转方向按 TexturePacker 的常规约定处理，尚未用原始素材逐张对照验证。

## 使用

1. 选择 PNG、JPG 或 WebP 图片，或选择/拖入目录。可以继续追加素材；文件夹保留相对路径。
2. 设置最大尺寸、2 的幂尺寸、固定尺寸、多页、输出缩放、透明裁剪、透明度阈值、图片间距和边缘扩展。参数变化自动重新打包。
3. 点击素材定位所在图集；支持缩放、适应画布、页签切换和边框显示。
4. 选择目标引擎并导出 ZIP。支持 PixiJS、Spine、Cocos、Godot 4、Unity 和 Phaser 3；PNG 始终随包导出。

## 游戏引擎格式

| 目标 | 导出内容 | 导入方式 |
| --- | --- | --- |
| Cocos Creator / cocos2d-x | 每页 PNG + plist（format 3） | PNG 和 plist 同时放入资源目录，按 SpriteFrame 使用；包含透明裁剪偏移 |
| PixiJS | 每页 PNG + JSON | Spritesheet / Assets 加载，保留多页关联 |
| Spine | PNG + 一个多页 Atlas | 作为骨架对应图集加载 |
| Godot 4 | PNG + 每个区域一个 AtlasTexture `.tres` | 保留 ZIP 中目录结构一起放入项目，把 `.tres` 赋给 Sprite2D / TextureRect / SpriteFrames |
| Unity | PNG + `.spineslim.json` + Editor 导入脚本 | 脚本安装到 Assets/Editor 一次，菜单 Tools → SpineSlim → Import Atlas 选择清单，生成 Multiple Sprites |
| Phaser 3 | PNG + `.phaser.json` | `this.load.multiatlas('atlas', 'name.phaser.json')` |

Unity 模式自动关闭透明裁剪，保留原画布和中心轴点；切回其他引擎时恢复原裁剪选项。Unity 坐标转换为左下原点，PPU 为 100 × 输出缩放，使用 FullRect 网格；它是图片图集切片导入器，不生成 Unity `.spriteatlas` 资源。Editor 脚本仅需安装一次，避免重复导入同名脚本。

Cocos 和 Godot 的裁剪偏移遵守各自坐标规则；Cocos/Godot/Phaser 的输出缩放直接改变像素尺寸，必要时调整节点缩放。每种新格式的 ZIP 附有中英导入说明。

无需安装 TexturePacker，素材不上传服务器。普通浏览器也可运行图片打包与下载；桌面版支持原生目录选择、文件夹拖放以及保存 ZIP。

## 导出约定

- PNG 为 straight alpha，未旋转；默认透明边缘裁剪并扩展边缘像素 1 px。
- 每页生成 `atlas-1.png`、`atlas-1.json` 等文件。JSON 为 PixiJS spritesheet 格式，多页通过 `related_multi_packs` 关联。
- 所有页共用 `atlas.atlas`。区域名称为相对路径去掉扩展名，裁剪 offset 按 Spine 的底部原点写入。
- PixiJS 的 `spriteSourceSize` 保留左上角裁剪坐标，`sourceSize` 保留缩放后的完整画布尺寸。
- 完全透明素材保留为 1 × 1 透明区域，原画布尺寸保留在元数据中。
- 名称冲突时阻止导入，避免同名资源被覆盖。可更名后重试，或从共同父目录导入以保留路径区别。
- 原图不修改；导出写入临时文件，成功后替换用户选定的 ZIP。

## 当前范围

已提供中英文界面及窄窗口布局。最大 500 张图片、源图总计 32 Mi 像素、每个文件 32 MiB、输出最多 16 页/64 Mi 像素，尺寸上限 8192。旋转打包、重复纹理合并和压缩纹理格式尚未加入。

## 验证

- `npm run build`、`cargo check --manifest-path src-tauri/Cargo.toml`。
- `tests/packer_smoke.js`：通过 Playwright CLI 运行；合成透明素材验证裁剪、边缘扩展、无重叠多页、超单页限制、ZIP 内容，以及 PixiJS 与 Spine 运行时的元数据读回；测试 15 张图片导入、下载、中英文界面和 960 px 宽布局。
- `tests/packer_native_smoke.js`：连接本地 Tauri 调试窗口；验证目录扫描、图片读取、会话过期拒绝、ZIP 保存、无效 ZIP 拒绝。输入为忽略目录中的官方预览样例与前一脚本生成的 ZIP。运行此脚本时不要同时发起新的图片导入。
- 原生 ZIP 和浏览器 ZIP 的 SHA-256 相同；无效 ZIP 保存失败后，原文件哈希未变化。
- `tests/packer_formats_smoke.js`：验证全部七个导出选项、Unity 裁剪切换和偏好恢复、中英文标签，生成 `output/packer-formats.zip`。
- `tests/test_packer_exports.py`：通过 plistlib 解析 Cocos 输出、核对 Godot 资源相对路径与 margin、检查 Unity 未裁剪尺寸/底部坐标/缩放、Phaser 多页及按格式隔离输出。五项检查通过。
- 本机未安装 Unity、Godot 或 Cocos 编辑器；新格式已验证文件结构与坐标，但这些编辑器的实际项目导入、Unity 脚本编译尚待实测，不代表覆盖所有引擎版本。Unity 脚本使用 TextureImporter API，面向 2021.3 及以后版本。
- 系统保存对话框的自动化测试未覆盖，已验证其后端实际写入命令；尚未重新制作安装包或发布。

## English

The standalone Atlas packer provides an image list, atlas preview and packing settings. Import PNG/JPEG/WebP files or directories, adjust dimensions, power-of-two sizing, scaling, alpha trimming, padding and extrusion, then export PNG pages with PixiJS JSON and/or Spine Atlas metadata in a ZIP.

Packing runs locally without TexturePacker. Relative paths are preserved; duplicate export names are rejected. Export targets include PixiJS, Spine, Cocos plist, Godot 4 AtlasTexture, Unity with a bundled Editor importer, and Phaser 3 multiatlas. Unity keeps full canvases and centered pivots; install its importer once under Assets/Editor. New formats have structure and coordinate tests, but Unity/Godot/Cocos editor imports still require project testing. Rotation and duplicate texture merging are not implemented yet. This feature is included in the 2.0 alpha releases.

## 格式参考

- Cocos sprite frame cache: https://github.com/cocos2d/cocos2d-x/blob/v4/cocos/2d/CCSpriteFrameCache.cpp
- Godot AtlasTexture: https://github.com/godotengine/godot/blob/4.3/scene/resources/atlas_texture.cpp
- Phaser JSON array parser: https://github.com/phaserjs/phaser/blob/v3.90.0/src/textures/parsers/JSONArray.js
