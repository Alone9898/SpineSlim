const words: Record<string, [string, string]> = {
  pixi: ['PixiJS · JSON', 'PixiJS · JSON'], spine: ['Spine · Atlas', 'Spine · Atlas'],
  cocos: ['Cocos · plist', 'Cocos · plist'], godot: ['Godot 4 · AtlasTexture', 'Godot 4 · AtlasTexture'],
  unity: ['Unity · 带导入脚本', 'Unity · Editor importer'], phaser: ['Phaser 3 · 多页 JSON', 'Phaser 3 · Multiatlas JSON'],
  unityTrim: ['Unity 模式保留完整画布，透明裁剪已关闭。', 'Unity keeps the full canvas; transparent trimming is disabled.'],
  'format.both': ['导出 PNG、PixiJS JSON 和 Spine Atlas。', 'Export PNG, PixiJS JSON and Spine Atlas.'],
  'format.pixi': ['每页 JSON，包含多页关联信息。', 'One JSON per page, with multipack references.'],
  'format.spine': ['一个 Atlas 描述全部 PNG 页面。', 'One Atlas describes all PNG pages.'],
  'format.cocos': ['每页 PNG + plist，可导入 Cocos Creator / cocos2d-x。', 'PNG + plist per page for Cocos Creator / cocos2d-x.'],
  'format.godot': ['生成 Godot 4 的 .tres 资源，保留裁剪边距。', 'Generate Godot 4 .tres resources with trim margins.'],
  'format.unity': ['附带 Editor 导入脚本，自动切片为 Multiple Sprites。脚本只需安装一次。', 'Includes an Editor importer for Multiple Sprites. Install the script once.'],
  'format.phaser': ['使用 Phaser 3 的 load.multiatlas 加载全部页面。', 'Load all pages with Phaser 3 load.multiatlas.'],
  title: ['图集打包', 'Atlas packer'], description: ['将零散图片整理成图集，预览布局并导出引擎资源。', 'Pack images into atlases, inspect the layout and export engine assets.'],
  emptyTitle: ['选择或拖入图片、文件夹', 'Choose or drop images and folders'], emptyHint: ['本地打包，实时预览。支持 Cocos、Unity、Godot、PixiJS、Phaser 和 Spine。', 'Pack locally with a live preview. Export for Cocos, Unity, Godot, PixiJS, Phaser and Spine.'],
  files: ['选择图片', 'Choose images'], folder: ['选择文件夹', 'Choose folder'], local: ['完全本地处理，无需 TexturePacker', 'Fully local · No TexturePacker required'], formats: ['支持 PNG / JPG / WebP · 保留相对路径', 'PNG / JPG / WebP · Relative paths preserved'],
  sprites: ['素材', 'Sprites'], preview: ['图集预览', 'Atlas preview'], settings: ['打包设置', 'Packing settings'], layout: ['布局', 'Layout'], width: ['最大宽度', 'Max width'], height: ['最大高度', 'Max height'], pot: ['2 的幂尺寸', 'Power of two'], fixed: ['固定为最大尺寸', 'Use maximum size'], multipage: ['允许多页', 'Allow multiple pages'],
  scale: ['输出缩放', 'Output scale'], trim: ['裁剪透明边缘', 'Trim transparent edges'], threshold: ['透明度阈值', 'Alpha threshold'], padding: ['图片间距', 'Shape padding'], extrude: ['边缘扩展', 'Extrude edges'], borders: ['显示边框', 'Show borders'], fit: ['适应画布', 'Fit'],
  exporter: ['导出', 'Export'], name: ['图集名称', 'Atlas name'], format: ['元数据格式', 'Metadata format'], both: ['PixiJS JSON + Spine Atlas', 'PixiJS JSON + Spine Atlas'], export: ['导出 ZIP', 'Export ZIP'], reset: ['重置参数', 'Reset options'], clear: ['清空素材', 'Clear images'], remove: ['移除', 'Remove'],
  importing: ['正在导入', 'Importing'], packing: ['正在打包', 'Packing'], exporting: ['正在导出…', 'Exporting…'], saved: ['已保存', 'Saved'], download: ['已生成下载文件', 'Download ready'], pages: ['页', 'pages'], image: ['图片', 'images'], search: ['搜索素材…', 'Search images…'], select: ['点击素材可定位到图集', 'Select an image to locate it in the atlas'],
  empty: ['未找到支持的图片。', 'No supported images found.'], read: ['无法读取图片或目录。', 'Cannot read the image or folder.'], write: ['导出失败，请检查路径及权限。', 'Export failed. Check the path and permissions.'], zipPath: ['请以 .zip 扩展名保存。', 'Save with a .zip extension.'],
  limit: ['资源超出限制：最多 500 张、源图总计 3200 万像素、输出最多 16 页。', 'Resource limit exceeded: 500 images, 32 million source pixels, 16 output pages.'],
  duplicate: ['导出名称重复，请重命名素材或从共同父目录导入：', 'Duplicate export name. Rename the files or import their common parent folder:'],
  invalidName: ['名称不能包含换行、冒号或上级路径。', 'Names cannot contain line breaks, colons or parent traversal.'], invalidOptions: ['请检查尺寸、边距和缩放参数。', 'Check the size, spacing and scale options.'],
  oversize: ['图片超过图集尺寸，请增加尺寸或降低缩放：', 'Image exceeds atlas size. Increase the size or reduce the scale:'], multiple: ['一页放不下，请开启多页或增加尺寸。', 'Images do not fit one page. Enable multiple pages or increase the size.'],
  trimHint: ['裁剪信息会写入元数据，保留原始画布尺寸。', 'Trim metadata preserves each image’s original canvas size.'],
};
export const label = (language: 'zh' | 'en', key: string) => words[key]?.[language === 'zh' ? 0 : 1] ?? key;
export const diagnostic = (language: 'zh' | 'en', error: unknown) => {
  const [key, ...details] = String(error).replace(/^Error: /, '').split('|');
  return `${label(language, key)}${details.length ? ' ' + details.join('|') : ''}`;
};
