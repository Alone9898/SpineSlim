const labels: Record<string, [string, string]> = {
  title: ['Rive 预览', 'Rive viewer'], description: ['预览本地 .riv 动画和状态机。', 'Preview local .riv animations and state machines.'],
  folder: ['打开文件夹', 'Open folder'], file: ['打开 .riv', 'Open .riv'], search: ['搜索文件', 'Search files'], empty: ['选择 .riv 文件或文件夹开始预览', 'Choose a .riv file or folder to preview'],
  noFiles: ['未找到 .riv 文件', 'No .riv files found'], loading: ['正在加载 Rive 资源…', 'Loading Rive asset…'], artboard: ['画板', 'Artboard'], animation: ['动画', 'Animation'], machine: ['状态机', 'State machine'], mode: ['播放模式', 'Playback mode'],
  play: ['播放', 'Play'], pause: ['暂停', 'Pause'], reset: ['重置', 'Reset'], layout: ['画布适配', 'Fit'], align: ['对齐', 'Alignment'], contain: ['包含', 'Contain'], cover: ['覆盖', 'Cover'], fill: ['填充', 'Fill'], center: ['居中', 'Center'], topLeft: ['左上', 'Top left'],
  background: ['背景颜色', 'Background'], checker: ['透明棋盘', 'Checkerboard'], fullscreen: ['全屏', 'Fullscreen'], inputs: ['状态机输入', 'State machine inputs'], noInputs: ['此状态机没有传统输入控件', 'No legacy inputs in this state machine'],
  events: ['事件日志', 'Event log'], clear: ['清空日志', 'Clear log'], copy: ['复制日志', 'Copy log'], noEvents: ['尚无事件', 'No events yet'], noMachine: ['此画板没有状态机', 'No state machines on this artboard'], noAnimation: ['此画板没有动画', 'No animations on this artboard'],
  noDesktop: ['请在 SpineSlim 桌面窗口中选择本地文件。', 'Choose local files in the SpineSlim desktop window.'],
  controls: ['Rive 动画控制面板', 'Rive animation controls'], reviewMode: ['演示模式', 'Review mode'], editMode: ['退出演示', 'Exit review'], newRive: ['加载新 Rive', 'Load new Rive'],
  collapseFiles: ['折叠文件列表', 'Collapse files'], expandFiles: ['展开文件列表', 'Expand files'], timelineSeek: ['动画时间轴', 'Animation timeline'],
  layoutHeading: ['布局', 'Layout'], fit: ['适合', 'Fit'], scale: ['缩放', 'Scale'], speed: ['速度', 'Speed'], inspector: ['检查员', 'Inspector'],
  fitWidth: ['适合宽度', 'Fit width'], fitHeight: ['适合高度', 'Fit height'], scaleDown: ['仅缩小', 'Scale down'], none: ['无适配', 'None'],
  topCenter: ['顶部居中', 'Top center'], topRight: ['右上', 'Top right'], centerLeft: ['左侧居中', 'Center left'], centerRight: ['右侧居中', 'Center right'], bottomLeft: ['左下', 'Bottom left'], bottomCenter: ['底部居中', 'Bottom center'], bottomRight: ['右下', 'Bottom right'],
  inputCount: ['输入', 'inputs'], fire: ['触发', 'Fire'], stateTimeline: ['状态时间轴', 'State timeline'], noStates: ['尚无状态变化', 'No state changes yet'], export: ['导出 JSON', 'Export JSON'],
  'rive.export': ['会话导出失败，请检查目标路径。', 'Could not export the session. Check the destination.'],
  'rive.read': ['文件读取失败，请检查权限。', 'Could not read the file. Check permissions.'], 'rive.large': ['文件超过 64 MB 预览限制。', 'File exceeds the 64 MB preview limit.'], 'rive.limit': ['目录超过 50,000 项，请选择较小的目录。', 'Folder exceeds 50,000 entries. Choose a smaller folder.'], 'rive.expired': ['文件会话已过期，请重新打开。', 'File session expired. Reopen the folder.'],
};

export function label(language: 'zh' | 'en', key: string) { return labels[key]?.[language === 'zh' ? 0 : 1] ?? key; }
