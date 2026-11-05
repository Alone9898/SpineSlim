const labels: Record<string, [string, string]> = {
  title: ['粒子查看器', 'Particle viewer'], description: ['预览并调整 PixiJS 粒子发射器 JSON，保存为新文件。', 'Preview and tweak PixiJS particle emitter JSON, then save it as a new file.'],
  folder: ['打开文件夹', 'Open folder'], file: ['打开 JSON', 'Open JSON'], search: ['搜索文件', 'Search files'],
  empty: ['把粒子 JSON 或文件夹拖到这里', 'Drop a particle JSON or folder here'],
  hint: ['选择文件夹时会同时读取其中的贴图；贴图按文件名自动匹配，缺失时用圆点代替。', 'Choosing a folder also loads its textures. Textures are matched by file name; a dot is used when one is missing.'],
  noFiles: ['未找到粒子 JSON', 'No particle JSON found'], loading: ['正在加载…', 'Loading…'],
  configs: ['粒子配置', 'Configs'], images: ['贴图', 'Textures'],
  play: ['播放', 'Play'], pause: ['暂停', 'Pause'], restart: ['重新播放', 'Restart'], loop: ['循环播放', 'Loop'], speed: ['速度', 'Speed'], zoom: ['缩放', 'Zoom'],
  resetView: ['重置视图', 'Reset view'], background: ['背景颜色', 'Background'], fullscreen: ['全屏', 'Fullscreen'],
  collapseFiles: ['折叠文件列表', 'Collapse files'], expandFiles: ['展开文件列表', 'Expand files'],
  params: ['参数', 'Parameters'], reset: ['还原修改', 'Revert changes'], saveAs: ['另存为…', 'Save as…'], saved: ['已保存', 'Saved'], modified: ['已修改', 'Modified'],
  particles: ['粒子', 'particles'], missingTextures: ['缺失贴图', 'Missing textures'], textures: ['张贴图', 'textures'],
  noDesktop: ['请在 SpineSlim 桌面窗口中选择本地文件。', 'Choose local files in the SpineSlim desktop window.'],
  invalid: ['不是有效的粒子 JSON。', 'Not a valid particle JSON.'], emitterError: ['发射器创建失败，请检查参数。', 'Could not create the emitter. Check the parameters.'],
  'particle.read': ['文件读取失败，请检查权限。', 'Could not read the file. Check permissions.'], 'particle.limit': ['目录文件过多，请选择较小的目录。', 'Folder has too many files. Choose a smaller folder.'],
  'particle.expired': ['文件会话已过期，请重新打开。', 'File session expired. Reopen the folder.'], 'particle.save': ['保存失败，请检查目标路径。', 'Could not save. Check the destination.'],
};

export function label(language: 'zh' | 'en', key: string) { return labels[key]?.[language === 'zh' ? 0 : 1] ?? key; }
