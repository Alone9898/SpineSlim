# 音频处理 / Audio processing

本地 Tauri 桌面模块，复用 Python worker 和 FFmpeg；不上传音频，不需要 ffprobe。
Local Tauri module using the Python worker and FFmpeg. No uploads or ffprobe dependency.

## 操作 / Workflow

1. 在「音频处理」添加文件、导入目录或从系统拖入。支持 MP3、OGG、WAV、FLAC、M4A、AAC、OPUS、AIFF、WMA。
   Add files, import a folder, or drop files/folders from the desktop.
2. 选择音频，设置起止时间、淡入淡出。列表上下按钮或拖动可调整拼接顺序。资源名称可编辑，必须是唯一的相对路径。
   Select clips to edit trim/fade times and names. Reorder with arrow buttons or drag and drop. Names must be unique relative paths.
3. 选择批量转换、拼接或音频图集，设置格式、采样率、声道、质量或码率，选择输出目录。
   Choose batch conversion, merge, or audio sprite; configure encoding and an output folder.
4. 开始导出。可取消任务；完成后打开结果目录。显示输入与输出体积。
   Export with progress and cancellation, then open the result folder. Input/output sizes are shown.

## 输出 / Output

- 批量：保留导入目录的相对结构，转换为 MP3、OGG Vorbis 或 PCM 16-bit WAV。
  Batch: preserve relative folders and export MP3, OGG Vorbis, or PCM 16-bit WAV.
- 拼接：按列表顺序输出 `audio.*`。先统一 PCM 采样率及声道，再合并并编码，兼容混合格式。
  Merge: normalize to PCM, concatenate in order, then encode `audio.*`.
- 图集：输出 `audio.*`、`audio.howler.json`、`audio.phaser.json`。间隔只出现在片段之间，时间由 PCM 帧数计算。
  Audio sprite: export audio plus Howler/Phaser JSON. Gaps separate clips; offsets use exact PCM frame counts.
- 每次在所选目录生成唯一的 `SpineSlim-audio-*` 子目录。失败、取消清理临时文件；源文件不覆盖。
  Each export creates a unique subfolder; failed/cancelled jobs clean temporary files and preserve sources.
- `report.json` 记录输入输出大小；输出体积统计包含图集 JSON，但不包含报告自身。
  The report records sizes; output size includes sprite JSON but excludes the report itself.

## 游戏集成 / Game integration

Howler.js：读取 JSON，将对象传给 `new Howl(config)`，然后 `sound.play('sfx/clip0')`。
Load the JSON and pass it to `new Howl(config)`, then play a named sprite.

Phaser 3：`this.load.audioSprite('sfx', 'audio.phaser.json')`，随后 `this.sound.playAudioSprite('sfx', 'sfx/clip0')`。
Use Phaser's audio sprite loader and playback API. Adjust the audio resource URL for your deployment directory.

Unity、Godot、Cocos：使用批量输出的独立音频文件，由引擎导入；图集 JSON 不作为这些引擎的专用导入格式。
For Unity, Godot and Cocos, import individual batch output audio files.

## 限制与验收 / Limits and validation

- 仅桌面环境；需 FFmpeg 包含 libmp3lame、libvorbis。自动沿用配置、应用 tools 目录及 PATH 查找。
  Desktop only; FFmpeg needs libmp3lame and libvorbis. Existing configured/bundled/PATH discovery is reused.
- 最多 500 个文件，单文件及总处理时长不超过 2 小时。中间 PCM 文件占用额外磁盘空间。
  Up to 500 files; each source and total processing duration are limited to two hours. PCM intermediates require disk space.
- 试听加载原文件的前 10 分钟，支持裁剪范围试听；淡入淡出在导出时应用。
  Preview loads the first ten minutes of source audio and supports trim-range playback. Fades apply at export.
- 所有导出重新编码。MP3 VBR 0 最好、9 最小；OGG VBR 9 最好、0 最小；WAV 不提供码率设置。
  All exports re-encode. MP3 VBR 0 is highest quality; OGG VBR 9 is highest quality. WAV uses PCM.
- 有损格式可能存在编码延迟及播放器定位误差；严格无缝需求建议 WAV 并在目标引擎实测。
  Lossy formats can have codec delay and player seeking differences. Use WAV and test in your engine for strict timing.
- `python -m unittest tests.test_audio -v` 使用真实 FFmpeg 验证混合采样率、裁剪淡化、拼接、图集时间、静音间隔、导出格式、取消与坏文件。
  Integration tests exercise actual FFmpeg processing. Engine-specific playback still requires testing in a target game.
