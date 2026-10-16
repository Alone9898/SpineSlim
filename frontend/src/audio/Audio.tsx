import { useEffect, useRef, useState } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { open } from '@tauri-apps/plugin-dialog';
import { ArrowDown, ArrowUp, FolderOpen, Music2, Plus, X } from 'lucide-react';
import type { Language, WorkerEvent } from '../types';
import { eventText } from '../i18n';
import './audio.css';

type Clip = { path: string; name: string; duration: number; bytes: number; codec: string; rate: number; channels: string; start: number; end: number; fade_in: number; fade_out: number };
type Props = { language: Language; active: boolean; tools: Record<string, string>; blocked: boolean; onBusy: (busy: boolean) => void };
const words: Record<string, [string, string]> = {
  add: ['添加音频', 'Add audio'], folder: ['导入目录', 'Import folder'], clear: ['清空', 'Clear'],
  empty: ['添加或拖入音频文件、目录', 'Add or drop audio files or folders'],
  formats: ['MP3 / OGG / WAV / FLAC / M4A / AAC / OPUS / AIFF / WMA', 'MP3 / OGG / WAV / FLAC / M4A / AAC / OPUS / AIFF / WMA'],
  batch: ['批量转换 / 压缩', 'Batch conversion / compression'], merge: ['按顺序拼接', 'Merge in order'], sprite: ['音频图集', 'Audio sprite'],
  select: ['选择音频，调整裁剪与淡入淡出', 'Select a clip to trim and fade'], preview: ['加载试听', 'Load preview'],
  previewHint: ['试听原音频，可限制在裁剪范围内；最多加载前 10 分钟。淡入淡出效果以导出文件为准。', 'Preview the source within the trim range; loads up to the first 10 minutes. Fades apply on export.'],
  trim: ['裁剪范围试听', 'Preview trim range'], start: ['开始（秒）', 'Start (seconds)'], end: ['结束（秒）', 'End (seconds)'],
  fade_in: ['淡入（秒）', 'Fade in (seconds)'], fade_out: ['淡出（秒）', 'Fade out (seconds)'],
  name: ['资源名称 / 相对路径', 'Resource name / relative path'], output: ['输出目录', 'Output folder'],
  choose: ['选择目录', 'Choose folder'], format: ['输出格式', 'Output format'], encoding: ['编码模式', 'Encoding mode'],
  vbr: ['VBR 质量模式', 'VBR quality'], cbr: ['固定目标码率', 'Target bitrate'], quality: ['质量等级', 'Quality level'],
  qualityHint: ['MP3：0 最好，9 最小；OGG：9 最好，0 最小。', 'MP3: 0 best, 9 smallest; OGG: 9 best, 0 smallest.'],
  bitrate: ['码率（kbps）', 'Bitrate (kbps)'], rate: ['采样率', 'Sample rate'], channels: ['声道', 'Channels'],
  mono: ['单声道', 'Mono'], stereo: ['立体声', 'Stereo'], gap: ['音效间隔（秒）', 'Gap between sprites (seconds)'],
  spriteHint: ['导出音频及 Howler.js / Phaser JSON；资源名称作为播放标识。', 'Exports audio with Howler.js / Phaser JSON; resource names become playback keys.'],
  safe: ['输出到独立结果目录，保留源文件。批量模式保留目录结构；有损重编码可能降低音质，输出也可能变大。', 'Exports to a new result folder, preserving sources and batch directory structure. Lossy re-encoding can reduce quality and increase size.'],
  run: ['开始导出', 'Export'], cancel: ['取消任务', 'Cancel'], cancelling: ['正在取消…', 'Cancelling…'],
  loading: ['正在加载…', 'Loading…'], working: ['处理中', 'Processing'], success: ['导出完成', 'Export complete'],
  cancelled: ['已取消', 'Cancelled'], failed: ['处理失败', 'Failed'], ready: ['准备就绪', 'Ready'],
  result: ['打开结果目录', 'Open output folder'], skipped: ['无法读取以下音频：', 'Could not read these files:'],
  desktop: ['请在桌面应用中使用音频处理。', 'Use audio processing in the desktop app.'],
  limit: ['最多导入 500 个音频。', 'Import up to 500 clips.'], remove: ['移除', 'Remove'], up: ['上移', 'Move up'], down: ['下移', 'Move down'],
  'audio.ffmpeg': ['未找到 FFmpeg，请安装或在开发设置中指定路径。', 'FFmpeg was not found. Install it or set its path in development settings.'],
  'audio.file': ['音频无法读取或不含有效音轨。', 'The audio file could not be read or has no valid track.'],
  'audio.duration': ['单个音频与总处理时长不能超过 2 小时。', 'Each source and the total output must be within two hours.'],
  'audio.options': ['请检查裁剪范围、淡入淡出时长和输出参数。', 'Check trim ranges, fade durations and output options.'],
  'audio.names': ['资源名称不能重复，不能包含上级目录或绝对路径。', 'Resource names must be unique relative paths without parent traversal.'],
  'audio.limit': ['最多导入 500 个音频。', 'Import up to 500 clips.'],
};

export default function Audio({ language, active, tools, blocked, onBusy }: Props) {
  const t = (key: string) => words[key]?.[language === 'en' ? 1 : 0] ?? key;
  const [clips, setClips] = useState<Clip[]>([]);
  const [selected, setSelected] = useState('');
  const [operation, setOperation] = useState('batch');
  const [format, setFormat] = useState('ogg');
  const [encoding, setEncoding] = useState('vbr');
  const [quality, setQuality] = useState(4);
  const [bitrate, setBitrate] = useState(128);
  const [rate, setRate] = useState(44100);
  const [channels, setChannels] = useState(2);
  const [gap, setGap] = useState(.1);
  const [target, setTarget] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('ready');
  const [progress, setProgress] = useState(0);
  const [currentFile, setCurrentFile] = useState('');
  const [error, setError] = useState('');
  const [output, setOutput] = useState('');
  const [report, setReport] = useState('');
  const [preview, setPreview] = useState('');
  const [trimPreview, setTrimPreview] = useState(true);
  const audio = useRef<HTMLAudioElement>(null);
  const previewUrl = useRef('');
  const task = useRef('');
  const locked = useRef(false);
  const committing = useRef(false);
  const current = useRef({ active, tools, blocked, language }); current.current = { active, tools, blocked, language };
  const clip = clips.find(item => item.path === selected);
  const disabled = busy || loading || blocked;
  const size = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  const resetPreview = () => { audio.current?.pause(); if (previewUrl.current) URL.revokeObjectURL(previewUrl.current); previewUrl.current = ''; setPreview(''); };
  const options = async () => ({ application_dir: await invoke<string>('app_directory'), tools: current.current.tools, mode: 'audio' });
  useEffect(() => { resetPreview(); }, [selected]);
  useEffect(() => { if (!active) audio.current?.pause(); }, [active]);
  useEffect(() => () => { if (previewUrl.current) URL.revokeObjectURL(previewUrl.current); }, []);
  useEffect(() => {
    if (!isTauri()) return;
    const subscription = listen<WorkerEvent>('worker-event', ({ payload }) => {
      if (payload.task_id !== task.current) return;
      if (payload.message_key === 'committing') committing.current = true;
      if (['stage', 'progress'].includes(payload.type)) {
        if (payload.params.total) setProgress(Number(payload.params.completed) / Number(payload.params.total) * 100);
        if (payload.params.file) setCurrentFile(String(payload.params.file));
      }
      if (payload.type === 'error') setError(words[payload.message_key]?.[current.current.language === 'en' ? 1 : 0] ?? eventText(current.current.language, payload));
      if (payload.message_key === 'audio.report') setReport(`${size(Number(payload.params.input_bytes))} → ${size(Number(payload.params.output_bytes))}`);
      if (payload.type === 'finished') {
        setStatus(String(payload.params.status)); setBusy(false); onBusy(false); locked.current = false; committing.current = false;
        if (payload.params.output) { setOutput(String(payload.params.output)); setProgress(100); }
      }
    });
    return () => { void subscription.then(unlisten => unlisten()); };
  }, [onBusy]);
  const importPaths = async (paths: string[]) => {
    if (locked.current || current.current.blocked) return;
    locked.current = true; setLoading(true); setError('');
    try {
      const result = await invoke<{ files: Clip[]; errors: string[] }>('audio_query', { action: 'scan', options: { ...await options(), paths } });
      if (clips.length + result.files.filter(item => !clips.some(existing => existing.path === item.path)).length > 500) throw new Error(t('limit'));
      setClips(previous => {
        const added = result.files.filter(item => !previous.some(existing => existing.path === item.path)).map(item => ({ ...item, start: 0, end: item.duration, fade_in: 0, fade_out: 0 }));
        return [...previous, ...added].slice(0, 500);
      });
      if (result.files[0]) setSelected(result.files[0].path);
      if (result.errors.length) setError(`${t('skipped')}\n${result.errors.join('\n')}`);
    } catch (reason) { setError(t(String(reason))); }
    finally { locked.current = false; setLoading(false); }
  };
  const importRef = useRef(importPaths); importRef.current = importPaths;
  useEffect(() => {
    if (!isTauri()) return;
    const subscription = getCurrentWindow().onDragDropEvent(event => {
      if (current.current.active && event.payload.type === 'drop') void importRef.current(event.payload.paths);
    });
    return () => { void subscription.then(unlisten => unlisten()); };
  }, []);
  const choose = async (directory: boolean) => {
    try {
      const paths = await open({ directory, multiple: true, filters: directory ? undefined : [{ name: 'Audio', extensions: ['mp3', 'ogg', 'wav', 'flac', 'm4a', 'aac', 'opus', 'aiff', 'aif', 'wma'] }] });
      if (paths) await importPaths(Array.isArray(paths) ? paths : [paths]);
    } catch (reason) { setError(String(reason)); }
  };
  const loadPreview = async () => {
    if (!clip || locked.current) return;
    locked.current = true; setLoading(true); setError(''); resetPreview();
    try {
      const result = await invoke<{ data: string }>('audio_query', { action: 'preview', options: { ...await options(), path: clip.path } });
      const bytes = Uint8Array.from(atob(result.data), character => character.charCodeAt(0));
      previewUrl.current = URL.createObjectURL(new Blob([bytes], { type: 'audio/mpeg' })); setPreview(previewUrl.current);
    } catch (reason) { setError(t(String(reason))); }
    finally { locked.current = false; setLoading(false); }
  };
  const edit = (value: Partial<Clip>) => setClips(previous => previous.map(item => item.path === selected ? { ...item, ...value } : item));
  const move = (index: number, offset: number) => setClips(previous => { const next = [...previous]; [next[index], next[index + offset]] = [next[index + offset], next[index]]; return next; });
  const run = async () => {
    if (locked.current || blocked) return;
    locked.current = true; setBusy(true); onBusy(true); setStatus('working'); setProgress(0); setCurrentFile(''); setError(''); setOutput(''); setReport(''); committing.current = false;
    task.current = crypto.randomUUID();
    try {
      await invoke('start_task', { taskId: task.current, options: { ...await options(), clips, operation, audio_format: format, encoding, quality, bitrate, rate, channels, gap, target } });
    } catch (reason) { locked.current = false; setBusy(false); onBusy(false); setStatus('failed'); setError(t(String(reason))); }
  };
  if (!isTauri()) return <section className="card">{t('desktop')}</section>;
  return <div className="audio-workspace">
    <section className="card audio-library">
      <div className="audio-actions"><button className="button secondary" disabled={disabled} onClick={() => void choose(false)}><Plus size={16} />{t('add')}</button><button className="button secondary" disabled={disabled} onClick={() => void choose(true)}><FolderOpen size={16} />{t('folder')}</button><button className="text-button" disabled={disabled || !clips.length} onClick={() => { setClips([]); setSelected(''); }}>{t('clear')}</button></div>
      <p className="hint">{clips.length} / 500 · {size(clips.reduce((total, item) => total + item.bytes, 0))}</p>
      {!clips.length && <div className="audio-empty"><Music2 size={42} /><h3>{t('empty')}</h3><p>{t('formats')}</p></div>}
      <div className="audio-list">{clips.map((item, index) => <div key={item.path} className={`audio-row${item.path === selected ? ' selected' : ''}`} draggable={!disabled} onDragStart={event => event.dataTransfer.setData('text/plain', String(index))} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); const from = Number(event.dataTransfer.getData('text/plain')); if (!disabled && Number.isInteger(from) && from >= 0 && from < clips.length) setClips(previous => { const next = [...previous]; next.splice(index, 0, next.splice(from, 1)[0]); return next; }); }}>
        <button className="audio-row-name" disabled={disabled} onClick={() => setSelected(item.path)} title={item.path}><strong>{item.name}</strong><small>{item.duration.toFixed(2)} s · {size(item.bytes)} · {item.codec}</small></button>
        <button title={t('up')} aria-label={t('up')} disabled={disabled || index === 0} onClick={() => move(index, -1)}><ArrowUp size={14} /></button><button title={t('down')} aria-label={t('down')} disabled={disabled || index === clips.length - 1} onClick={() => move(index, 1)}><ArrowDown size={14} /></button><button title={t('remove')} aria-label={t('remove')} disabled={disabled} onClick={() => { setClips(previous => previous.filter(entry => entry.path !== item.path)); if (selected === item.path) setSelected(''); }}><X size={14} /></button>
      </div>)}</div>
    </section>
    <div className="audio-editor">
      <section className="card"><h2>{t('select')}</h2>{clip && <><p className="hint">{clip.codec} · {clip.rate} Hz · {clip.channels} · {clip.duration.toFixed(2)} s</p><fieldset disabled={disabled}><label className="field"><span>{t('name')}</span><input type="text" value={clip.name} onChange={event => edit({ name: event.target.value })} /></label><div className="audio-fields">{(['start', 'end', 'fade_in', 'fade_out'] as const).map(key => <label className="field" key={key}><span>{t(key)}</span><input type="number" min={0} max={clip.duration} step={.01} value={clip[key]} onChange={event => edit({ [key]: Number(event.target.value) })} /></label>)}</div></fieldset><button className="button secondary" disabled={disabled} onClick={() => void loadPreview()}>{t('preview')}</button><label className="audio-check"><input type="checkbox" checked={trimPreview} onChange={event => setTrimPreview(event.target.checked)} />{t('trim')}</label>{preview && <audio ref={audio} controls src={preview} onPlay={() => { if (trimPreview && audio.current && (audio.current.currentTime < clip.start || audio.current.currentTime >= clip.end)) audio.current.currentTime = Math.min(clip.start, audio.current.duration); }} onTimeUpdate={() => { if (trimPreview && audio.current && audio.current.currentTime >= clip.end) audio.current.pause(); }} onError={() => setError(t('audio.file'))} />}<p className="hint">{t('previewHint')}</p></>}</section>
      <section className="card"><fieldset disabled={disabled}><label className="field"><span>{t('run')}</span><select value={operation} onChange={event => setOperation(event.target.value)}>{['batch', 'merge', 'sprite'].map(value => <option key={value} value={value}>{t(value)}</option>)}</select></label><div className="audio-fields"><label className="field"><span>{t('format')}</span><select value={format} onChange={event => setFormat(event.target.value)}>{['ogg', 'mp3', 'wav'].map(value => <option key={value}>{value}</option>)}</select></label><label className="field"><span>{t('rate')}</span><select value={rate} onChange={event => setRate(Number(event.target.value))}>{[22050, 44100, 48000].map(value => <option key={value}>{value}</option>)}</select></label><label className="field"><span>{t('channels')}</span><select value={channels} onChange={event => setChannels(Number(event.target.value))}><option value={1}>{t('mono')}</option><option value={2}>{t('stereo')}</option></select></label>{format !== 'wav' && <><label className="field"><span>{t('encoding')}</span><select value={encoding} onChange={event => setEncoding(event.target.value)}><option value="vbr">{t('vbr')}</option><option value="cbr">{t('cbr')}</option></select></label>{encoding === 'vbr' ? <label className="field"><span>{t('quality')}</span><input type="number" min={0} max={9} value={quality} onChange={event => setQuality(Number(event.target.value))} /></label> : <label className="field"><span>{t('bitrate')}</span><select value={bitrate} onChange={event => setBitrate(Number(event.target.value))}>{[64, 96, 128, 160, 192, 256, 320].map(value => <option key={value}>{value}</option>)}</select></label>}</>}{operation === 'sprite' && <label className="field"><span>{t('gap')}</span><input type="number" min={0} max={10} step={.01} value={gap} onChange={event => setGap(Number(event.target.value))} /></label>}</div>{format !== 'wav' && encoding === 'vbr' && <p className="hint">{t('qualityHint')}</p>}{operation === 'sprite' && <p className="hint">{t('spriteHint')}</p>}<label className="field"><span>{t('output')}</span><div className="path-input"><input value={target} onChange={event => setTarget(event.target.value)} /><button onClick={async () => { try { const path = await open({ directory: true }); if (typeof path === 'string') setTarget(path); } catch (reason) { setError(String(reason)); } }}>{t('choose')}</button></div></label></fieldset>
        <p className="hint">{t('safe')}</p><div className="audio-status"><strong>{t(loading ? 'loading' : status)}</strong><span>{progress.toFixed(0)}%</span></div><progress max={100} value={progress} /><p className="hint audio-current">{currentFile}</p><div className="audio-actions">{busy ? <button className="button secondary" disabled={status === 'cancelling' || committing.current} onClick={async () => { try { await invoke('cancel_task'); setStatus('cancelling'); } catch (reason) { setError(String(reason)); } }}>{t(status === 'cancelling' ? 'cancelling' : 'cancel')}</button> : <button className="button primary" disabled={disabled || !clips.length || !target} onClick={() => void run()}>{t('run')}</button>}{output && <button className="button secondary" onClick={() => void invoke('open_output', { path: output }).catch(reason => setError(String(reason)))}>{t('result')}</button>}<span>{report}</span></div>
      </section>
      {error && <div className="notice audio-error" role="alert">{error}</div>}
    </div>
  </div>;
}
