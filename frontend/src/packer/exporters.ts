import type { Options, Sheet } from './engine';
import unityImporter from './unity-importer.cs?raw';

export const exportFormats = ['both', 'pixi', 'spine', 'cocos', 'godot', 'unity', 'phaser'] as const;
export type ExportFormat = typeof exportFormats[number];
export const packingOptions = (options: Options, format: ExportFormat): Options => format === 'unity' ? { ...options, trim: false } : options;
const xml = (value: string) => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character]!);

export function engineMetadata(sheets: Sheet[], name: string, scale: number, format: ExportFormat): Record<string, string> {
  const output: Record<string, string> = Object.create(null);
  if (format === 'cocos') {
    for (const [index, sheet] of sheets.entries()) {
      const pageName = `${name}-${index + 1}`;
      const frames = sheet.frames.map(frame => `<key>${xml(frame.name)}</key><dict>
<key>aliases</key><array/>
<key>spriteOffset</key><string>{${frame.left + frame.width / 2 - frame.sourceWidth / 2},${frame.sourceHeight / 2 - frame.top - frame.height / 2}}</string>
<key>spriteSize</key><string>{${frame.width},${frame.height}}</string>
<key>spriteSourceSize</key><string>{${frame.sourceWidth},${frame.sourceHeight}}</string>
<key>textureRect</key><string>{{${frame.x},${frame.y}},{${frame.width},${frame.height}}}</string>
<key>textureRotated</key><false/>
</dict>`).join('\n');
      output[`${pageName}.plist`] = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict><key>frames</key><dict>${frames}</dict><key>metadata</key><dict>
<key>format</key><integer>3</integer>
<key>pixelFormat</key><string>RGBA8888</string>
<key>premultiplyAlpha</key><false/>
<key>textureFileName</key><string>${xml(pageName)}.png</string>
<key>realTextureFileName</key><string>${xml(pageName)}.png</string>
<key>size</key><string>{${sheet.canvas.width},${sheet.canvas.height}}</string>
</dict></dict></plist>\n`;
    }
    output['IMPORT-Cocos.txt'] = 'Cocos Creator / cocos2d-x: import each .plist together with its matching PNG.\nCocos Creator：将每页 plist 与同名 PNG 一起导入 assets。\nFrames keep their relative filenames, including extensions. Coordinates include trim offsets.\n帧名称保留相对路径与扩展名。每一页是独立图集，导入全部页即可。\nOutput scaling changes sprite pixel dimensions; adjust node scale if needed.\n输出缩放会改变像素尺寸，可按需要调整节点缩放。\n';
  } else if (format === 'godot') {
    for (const [index, sheet] of sheets.entries()) for (const frame of sheet.frames) {
      const resource = `godot/${frame.name.replace(/\.[^/.]+$/, '')}.tres`;
      const parent = '../'.repeat(resource.split('/').length - 1);
      output[resource] = `[gd_resource type="AtlasTexture" load_steps=2 format=3]

[ext_resource type="Texture2D" path=${JSON.stringify(`${parent}${name}-${index + 1}.png`)} id="1"]

[resource]
atlas = ExtResource("1")
region = Rect2(${frame.x}, ${frame.y}, ${frame.width}, ${frame.height})
margin = Rect2(${frame.left}, ${frame.top}, ${frame.sourceWidth - frame.width}, ${frame.sourceHeight - frame.height})
filter_clip = true
`;
    }
    output['IMPORT-Godot.txt'] = 'Godot 4.x: copy the PNG files and godot/ folder together into your project, keeping their relative layout.\nGodot 4.x：将 PNG 与 godot 文件夹一起放入项目，保留相对目录结构。\nUse the .tres AtlasTexture resources on Sprite2D, TextureRect or SpriteFrames. Do not move the resources independently of the PNGs.\n把 .tres 资源赋给 Sprite2D、TextureRect 或 SpriteFrames。不要单独移动贴图或资源文件。\nTrim margins restore the original scaled canvas size. Scaling is baked into pixels.\n裁剪边距恢复缩放后的原画布尺寸；输出缩放已应用到像素。\n';
  } else if (format === 'phaser') {
    output[`${name}.phaser.json`] = JSON.stringify({ textures: sheets.map((sheet, index) => ({ image: `${name}-${index + 1}.png`, format: 'RGBA8888', size: { w: sheet.canvas.width, h: sheet.canvas.height }, scale: 1,
      frames: sheet.frames.map(frame => ({ filename: frame.name, frame: { x: frame.x, y: frame.y, w: frame.width, h: frame.height }, rotated: false,
        trimmed: frame.width !== frame.sourceWidth || frame.height !== frame.sourceHeight,
        spriteSourceSize: { x: frame.left, y: frame.top, w: frame.width, h: frame.height }, sourceSize: { w: frame.sourceWidth, h: frame.sourceHeight } }))
    })), meta: { app: 'SpineSlim', version: '1.0', outputScale: scale } }, null, 2);
    output['IMPORT-Phaser.txt'] = `Phaser 3: load with this.load.multiatlas('atlas', ${JSON.stringify(`${name}.phaser.json`)}). Keep the PNGs next to the JSON.\nPhaser 3：使用 this.load.multiatlas 加载，PNG 与 JSON 保持同目录。\nUse this.add.image(x, y, 'atlas', 'folder/sprite.png') with the original relative filename.\n帧名称是原图相对路径（包含扩展名），支持多页与透明裁剪。\n`;
  } else if (format === 'unity') {
    if (sheets.some(sheet => sheet.frames.some(frame => frame.left !== 0 || frame.top !== 0 || frame.width !== frame.sourceWidth || frame.height !== frame.sourceHeight))) throw new Error('unityTrim');
    output[`${name}.spineslim.json`] = JSON.stringify({ version: 1, pixelsPerUnit: 100 * scale, pages: sheets.map((sheet, index) => ({ image: `${name}-${index + 1}.png`, width: sheet.canvas.width, height: sheet.canvas.height,
      sprites: sheet.frames.map(frame => ({ name: frame.name.replace(/\.[^/.]+$/, ''), x: frame.x, y: sheet.canvas.height - frame.y - frame.height, width: frame.width, height: frame.height })) })) }, null, 2);
    output['Editor/SpineSlimAtlasImporter.cs'] = unityImporter;
    output['IMPORT-Unity.txt'] = `Unity 2021.3+ / Unity 6 editor importer\n\n1. Install Editor/SpineSlimAtlasImporter.cs ONCE in Assets/Editor. Reuse it for later exports; do not add duplicate copies.\n2. Copy the PNG pages and ${name}.spineslim.json into a folder under Assets.\n3. Choose Tools > SpineSlim > Import Atlas and select the JSON manifest.\n4. Expand the PNG assets to access the sliced Sprites.\n\n1. 将导入脚本放入 Assets/Editor，仅安装一次，后续导出复用，避免重复类。\n2. 把 PNG 和 .spineslim.json 放到 Assets 下同一目录。\n3. 菜单 Tools > SpineSlim > Import Atlas，选择 JSON，自动设置 Multiple Sprite 并切片。\n4. 展开 PNG 资源即可使用 Sprite。\n\nUnity exports keep transparent padding to preserve canvas size and centered pivots. PPU is 100 × output scale. Existing import settings on these PNGs will be updated.\nUnity 模式关闭透明裁剪以保留原画布和中心轴点；PPU 为 100 × 输出缩放。导入会更新对应 PNG 的导入设置。\nThis is an image atlas importer, not a Unity .spriteatlas asset.\n这是图片图集切片导入器，输出不包含 Unity .spriteatlas 资源。\n`;
  }
  return output;
}
