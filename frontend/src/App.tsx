import { useEffect, useRef, useState } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { open, confirm } from '@tauri-apps/plugin-dialog';
import { openUrl } from '@tauri-apps/plugin-opener';
import { installCloseHandler, registerCloseGuard } from './close';
import { ArrowUpRight, Boxes, Check, ChevronRight, CircleCheck, Clock3, Copy, FileImage, Film, FolderOpen, Github, Languages, LoaderCircle, MessageCircle, Music2, Play, Settings2, ShieldCheck, Sparkles, Square, TriangleAlert, X } from 'lucide-react';
import logo from '../../assets/app-icon.png';
import { defaults, hydrate, type Settings, type Tool, type WorkerEvent, type Mode, type Format } from './types';
import { eventText, translate } from './i18n';
import Viewer from './viewer/Viewer';
import Packer from './packer/Packer';
import Audio from './audio/Audio';
import { label as packerLabel } from './packer/i18n';
import { label as viewerLabel } from './viewer/i18n';

const desktop = isTauri();
const modes: Mode[] = ['spine', 'ui', 'video'];
const icons = { spine: Sparkles, ui: FileImage, video: Film };
const toolNames = ['ImageMagick', 'Basis Universal', 'TexturePacker', 'Spine converter', 'FFmpeg'];
const toolKeys = ['imagemagick', 'basis', 'texturepacker', 'spine_converter', 'ffmpeg'];
const urls = ['https://imagemagick.org/script/download.php', 'https://github.com/BinomialLLC/basis_universal/releases', 'https://www.codeandweb.com/texturepacker/download', 'https://github.com/wang606/SpineSkeletonDataConverter/releases', 'https://ffmpeg.org/download.html'];

export default function App() {
  const [settings, setSettings] = useState<Settings>(defaults);
  const [loaded, setLoaded] = useState(false);
  const [page, setPage] = useState<'processing' | 'settings' | 'viewer' | 'packer' | 'audio'>('viewer');
  const [tools, setTools] = useState<Tool[]>(toolKeys.map((key, index) => ({ key, name: toolNames[index], path: '', available: false, detail: '', url: urls[index] })));
  const [audioBusy, setAudioBusy] = useState(false);
  const audioBusyRef = useRef(false); audioBusyRef.current = audioBusy;
  const [scanning, setScanning] = useState(false);
  const [status, setStatus] = useState('idle');
  const [stage, setStage] = useState<WorkerEvent | null>(null);
  const [logs, setLogs] = useState<WorkerEvent[]>([]);
  const [notice, setNotice] = useState('');
  const [output, setOutput] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const [copied, setCopied] = useState(false);
  const [stats, setStats] = useState<{ sizes: Record<string, number>; total: number } | null>(null);
  const [dropTarget, setDropTarget] = useState<'source' | 'target'>('source');
  const task = useRef('');
  const current = useRef(settings);
  const statusRef = useRef(status);
  const appDirectory = useRef('');
  const busy = ['checking', 'running', 'cancelling'].includes(status);
  const t = (key: string) => translate(settings.language, key);
  current.current = settings;
  statusRef.current = status;
  const patch = (value: Partial<Settings>) => setSettings(previous => ({ ...previous, ...value }));
  const error = (reason: unknown) => setNotice(`${translate(current.current.language, 'error')}: ${translate(current.current.language, String(reason))}`);

  useEffect(() => {
    let disposed = false;
    (async () => {
      if (desktop) {
        try {
          const saved = await invoke('load_settings');
          appDirectory.current = await invoke('app_directory');
          if (!disposed) setSettings(hydrate(saved));
        } catch (reason) { if (!disposed) error(reason); }
      }
      if (!disposed) setLoaded(true);
    })();
    return () => { disposed = true; };
  }, []);

  useEffect(() => {
    if (!desktop || !loaded) return;
    const timer = setTimeout(() => { invoke('save_settings', { settings }).catch(error); }, 400);
    return () => clearTimeout(timer);
  }, [settings, loaded]);

  useEffect(() => {
    document.documentElement.lang = settings.language === 'zh' ? 'zh-CN' : 'en';
  }, [settings.language]);

  useEffect(() => {
    if (!desktop) return;
    const subscription = listen<WorkerEvent>('worker-event', ({ payload }) => {
      if (payload.task_id !== task.current) return;
      if (['stage', 'progress'].includes(payload.type)) {
        setStage(payload);
        if (statusRef.current !== 'cancelling') setStatus('running');
      }
      if (payload.type !== 'progress') setLogs(previous => [...previous.slice(-299), payload]);
      if (payload.type === 'finished') {
        setStatus(String(payload.params.status));
        if (payload.params.output) setOutput(String(payload.params.output));
      }
    });
    const removeCloseGuard = registerCloseGuard(async () => {
      if (!audioBusyRef.current && !['checking', 'running', 'cancelling'].includes(statusRef.current)) return true;
      const language = current.current.language;
      if (!await confirm(translate(language, 'closeBody'), { title: translate(language, 'closeTitle'), kind: 'warning' })) return false;
      await invoke('cancel_task');
      return true;
    });
    const closeSubscription = installCloseHandler(error);
    return () => { removeCloseGuard(); subscription.then(unlisten => unlisten()); closeSubscription.then(unlisten => unlisten()); };
  }, []);

  useEffect(() => {
    if (!desktop) return;
    const subscription = getCurrentWindow().onDragDropEvent(event => {
      if (page === 'processing' && event.payload.type === 'drop' && !['checking', 'running', 'cancelling'].includes(statusRef.current)) {
        patch({ [dropTarget]: event.payload.paths[0] });
      }
    });
    return () => { subscription.then(unlisten => unlisten()); };
  }, [dropTarget, page]);

  useEffect(() => {
    if (!busy) return;
    const timer = setInterval(() => setElapsed(value => value + 1), 1000);
    return () => clearInterval(timer);
  }, [busy]);

  const scan = async () => {
    if (!desktop) { setNotice(t('preview')); return; }
    setScanning(true);
    try { setTools(await invoke<Tool[]>('inspect_tools', { options: { tools: settings.tools, application_dir: appDirectory.current } })); }
    catch (reason) { error(reason); }
    finally { setScanning(false); }
  };
  const browse = async (key: 'source' | 'target') => {
    if (!desktop) { setNotice(t('preview')); return; }
    try {
      const selection = await open({ directory: true, multiple: false, title: t(key) });
      if (typeof selection === 'string') patch({ [key]: selection });
    } catch (reason) { error(reason); }
  };
  const chooseTool = async (key: string) => {
    if (!desktop) { setNotice(t('preview')); return; }
    try {
      const path = await open({ multiple: false, filters: [{ name: 'Executable', extensions: ['exe'] }] });
      if (typeof path === 'string') {
        patch({ tools: { ...settings.tools, [key]: path } });
        setTools(previous => previous.map(tool => tool.key === key ? { ...tool, path, available: false } : tool));
      }
    } catch (reason) { error(reason); }
  };
  const format = settings.mode === 'ui' ? settings.ui_format : settings.spine_format;
  const destination = settings.target ? `${settings.target.replace(/[\\/]$/, '')}/program${settings.mode === 'ui' ? '' : '/' + settings.mode}` : '—';
  const start = async () => {
    if (audioBusy) return;
    if (!desktop) { setNotice(t('preview')); return; }
    if (busy || !settings.source || !settings.target) return;
    try {
      const scope = settings.mode === 'ui' ? `${destination}\n${t('uiScope')}` : destination;
      if (!await confirm(`${t('confirmBody')}\n${scope}`, { title: t('confirm'), kind: 'warning' })) return;
      task.current = crypto.randomUUID();
      setLogs([]); setStage(null); setOutput(''); setElapsed(0); setNotice(''); setStatus('checking');
      await invoke('start_task', { taskId: task.current, options: { ...settings, format, application_dir: appDirectory.current } });
    } catch (reason) { setStatus('failed'); error(reason); }
  };
  const cancel = async () => {
    setStatus('cancelling');
    try { await invoke('cancel_task'); } catch (reason) { setStatus('running'); error(reason); }
  };
  const measure = async () => {
    if (stats) { setStats(null); return; }
    if (!desktop) { setNotice(t('preview')); return; }
    try { setStats(await invoke('package_stats', { options: { target: settings.target } })); } catch (reason) { error(reason); }
  };
  const visit = async (url: string) => {
    try { if (desktop) await openUrl(url); else window.open(url, '_blank', 'noopener,noreferrer'); } catch (reason) { error(reason); }
  };
  const importLegacy = async () => {
    if (!desktop) { setNotice(t('preview')); return; }
    try {
      const path = await open({ filters: [{ name: 'JSON', extensions: ['json'] }], multiple: false });
      if (typeof path === 'string') {
        const imported = await invoke('import_settings', { path });
        setSettings(hydrate(imported)); setNotice(t('imported'));
      }
    } catch (reason) { error(reason); }
  };
  const count = Number(stage?.params.completed ?? 0);
  const total = Number(stage?.params.total ?? 0);
  const percentage = total ? Math.min(100, count / total * 100) : 0;
  const modeIcon = icons[settings.mode];

  return <div className="app-shell">
    <aside className="sidebar">
      <a className="brand" href="https://github.com/Alone9898/SpineSlim" onClick={event => { event.preventDefault(); void visit(event.currentTarget.href); }}><img src={logo} alt="" /><span>SpineSlim<small>ASSET TOOLKIT</small></span></a>
      <div className="nav-caption">{t('workspace')}</div>
      <nav><button className={page === 'viewer' ? 'nav-item active' : 'nav-item'} onClick={() => setPage('viewer')}><Sparkles size={19} />{viewerLabel(settings.language, 'title')}</button><button className={page === 'packer' ? 'nav-item active' : 'nav-item'} onClick={() => setPage('packer')}><FileImage size={19} />{packerLabel(settings.language, 'title')}</button><button className={page === 'processing' ? 'nav-item active' : 'nav-item'} onClick={() => setPage('processing')}><Boxes size={19} />{t('processing')}<ChevronRight size={15} /></button><button className={page === 'audio' ? 'nav-item active' : 'nav-item'} onClick={() => setPage('audio')}><Music2 size={19} />{t('audioTitle')}</button></nav>
      <div className="sidebar-bottom"><div className="language"><Languages size={17} /><select aria-label={t('language')} value={settings.language} onChange={event => patch({ language: event.target.value as 'zh' | 'en' })}><option value="zh">中文 / Chinese</option><option value="en">English</option></select></div><button className="github" title={t('githubStarHint')} onClick={() => void visit('https://github.com/Alone9898/SpineSlim')}><Github size={17} /><span className="github-label">{t('githubStar')}</span><ArrowUpRight size={15} /></button><button className="github" title={t('telegramHint')} onClick={() => void visit('https://t.me/+XlcsJcxyKZtlNGYy')}><MessageCircle size={17} /><span className="github-label">{t('telegram')}</span><ArrowUpRight size={15} /></button><button className={page === 'settings' ? 'nav-item active' : 'nav-item'} onClick={() => setPage('settings')}><Settings2 size={19} />{t('settings')}</button><div className="version">v2.0.0-alpha.1 <span>{t('version')}</span></div></div>
    </aside>
    <main className={page === 'packer' ? 'packer-main' : page === 'viewer' ? 'viewer-main' : page === 'processing' ? 'processing-main' : ''}>
      <header><div><div className="eyebrow">SPINESLIM / {page === 'audio' ? 'AUDIO' : page === 'packer' ? 'ATLAS' : page === 'viewer' ? 'LIBRARY' : page === 'processing' ? 'WORKSPACE' : 'PREFERENCES'}</div><h1>{page === 'audio' ? t('audioTitle') : page === 'packer' ? packerLabel(settings.language, 'title') : page === 'viewer' ? viewerLabel(settings.language, 'title') : t(page === 'processing' ? 'processingTitle' : 'settings')}</h1><p>{page === 'audio' ? t('audioDescription') : page === 'packer' ? packerLabel(settings.language, 'description') : page === 'viewer' ? viewerLabel(settings.language, 'description') : t(page === 'processing' ? 'processingDescription' : 'settingsDescription')}</p></div><div className="platform"><span /> WINDOWS DESKTOP</div></header>
      {!desktop && page !== 'packer' && <div className="notice"><TriangleAlert size={17} />{t('preview')}</div>}
      {notice && <div className="notice" role="alert"><TriangleAlert size={17} /><span>{notice}</span><button aria-label="Close" onClick={() => setNotice('')}><X size={16} /></button></div>}
      <div hidden={page !== 'viewer'}><Viewer language={settings.language} active={page === 'viewer'} /></div>
      <div hidden={page !== 'packer'}><Packer language={settings.language} active={page === 'packer'} /></div>
      <div hidden={page !== 'audio'}><Audio language={settings.language} active={page === 'audio'} tools={settings.tools} blocked={busy} onBusy={setAudioBusy} /></div>
      {page === 'viewer' || page === 'packer' || page === 'audio' ? null : page === 'processing' ? <>
        <div className="mode-tabs" role="tablist">{modes.map(mode => { const Icon = icons[mode]; return <button role="tab" aria-selected={settings.mode === mode} key={mode} disabled={busy} className={settings.mode === mode ? 'selected' : ''} onClick={() => patch({ mode })}><Icon size={18} />{t(mode)}</button>; })}</div>
        <div className="workspace-grid"><div className="form-column">
          <section className="card"><div className="section-heading"><span className="step">01</span><h2>{t('paths')}</h2><FolderOpen size={18} /></div><fieldset disabled={busy}>{(['source', 'target'] as const).map(key => <label className="field" key={key} onMouseEnter={() => setDropTarget(key)}><span>{t(key)}</span><div className="path-input"><FolderOpen size={17} /><input value={settings[key]} placeholder={t(key + 'Placeholder')} onFocus={() => setDropTarget(key)} onChange={event => patch({ [key]: event.target.value })} /><button onClick={() => void browse(key)}>{t('browse')}</button></div></label>)}</fieldset></section>
          <section className="card"><div className="section-heading"><span className="step">02</span><h2>{t('options')}</h2><Settings2 size={18} /></div><fieldset disabled={busy}>
            {settings.mode !== 'video' && <><div className="option-row"><label className="field"><span>{t('format')}</span><select value={format} onChange={event => patch({ [settings.mode === 'ui' ? 'ui_format' : 'spine_format']: event.target.value as Format })}>{(['original', 'webp', 'png', 'jpg', 'basis'] as Format[]).map(value => <option key={value} value={value}>{t(value)}</option>)}</select></label>{['webp', 'jpg'].includes(format) && <label className="field quality"><span>{t('quality')}</span><input type="number" min={0} max={100} value={settings.quality} onChange={event => patch({ quality: Number(event.target.value) })} /></label>}</div><p className="hint">{t(format === 'jpg' ? 'jpgHint' : format === 'original' ? 'formatHint' : 'qualityHint')}</p><div className="divider" /></>}
            {settings.mode === 'spine' && <><label className="toggle-row"><input type="checkbox" checked={settings.upgrade} onChange={event => patch({ upgrade: event.target.checked })} /><span><strong>{t('upgrade')}</strong><small>{t('upgradeHint')}</small></span></label><div className="info-row"><ShieldCheck size={19} /><span><strong>{t('structure')}</strong></span></div></>}
            {settings.mode === 'ui' && <label className="toggle-row"><input type="checkbox" checked={settings.force_bg} onChange={event => patch({ force_bg: event.target.checked })} /><span><strong>{t('force')}</strong><small>{t('forceHint')}</small></span></label>}
            {settings.mode === 'video' && <><label className="toggle-row"><input type="checkbox" checked={settings.alpha} onChange={event => patch({ alpha: event.target.checked })} /><span><strong>{t('alpha')}</strong><small>{t('alphaHint')}</small></span></label><div className="divider" /><label className="field"><span>{t('crf')}<b className="value-badge">{settings.crf}</b></span><input type="range" min={0} max={63} value={settings.crf} onChange={event => patch({ crf: Number(event.target.value) })} /></label><p className="hint">{t('crfHint')}</p></>}
          </fieldset></section>
          <section className="card tool-summary"><div><ShieldCheck size={20} /><span><strong>{t('tools')}</strong><small>{t('toolsHint')}</small></span></div><button className="text-button" onClick={() => setPage('settings')}>{t('configure')}<ArrowUpRight size={15} /></button></section>
        </div><aside className="task-column"><section className="card task-card"><div className="section-heading"><h2>{t('task')}</h2><span className={'status-dot ' + status} /></div><div className={'task-illustration ' + (busy ? 'busy' : '')}>{busy ? <LoaderCircle className="spin" size={30} /> : status === 'success' ? <CircleCheck size={30} /> : status === 'failed' ? <TriangleAlert size={30} /> : (() => { const Icon = modeIcon; return <Icon size={30} />; })()}</div><h3>{t(busy && stage ? stage.message_key : status)}</h3><p className="task-caption">{status === 'idle' ? t('idleHint') : stage?.params.file || t(settings.mode)}</p>
          <div className={`progress-track${busy ? ' progress-active' : ''}`} role="progressbar" aria-label={t('stageProgress')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={status === 'success' ? 100 : total > 0 ? percentage : undefined}><div style={{ width: status === 'success' ? '100%' : `${percentage}%` }} /></div><div className="progress-meta"><span>{total > 0 ? `${t('stageProgress')} ${count} / ${total} · ${Math.floor(percentage)}%` : busy ? t('working') : '—'}</span><span><Clock3 size={13} />{String(Math.floor(elapsed / 60)).padStart(2, '0')}:{String(elapsed % 60).padStart(2, '0')}</span></div><div className="output-path"><small>{t('destination')}</small><span>{destination}</span></div>
          {busy ? <button className="button secondary full" disabled={status === 'cancelling' || stage?.message_key === 'committing'} onClick={() => void cancel()}><Square size={15} />{t(status === 'cancelling' ? 'cancelling' : 'cancel')}</button> : <button className="button primary full" disabled={audioBusy || !loaded || !settings.source || !settings.target} onClick={() => void start()}><Play size={16} fill="currentColor" />{t('start')}</button>}
          <button className="text-button full package-stats-toggle" aria-expanded={Boolean(stats)} aria-controls="package-stats" disabled={busy || !settings.target} onClick={() => void measure()}>{t('stats')}</button>
          {stats && <div id="package-stats" className="output-path">{Object.entries({ ...stats.sizes, [t('total')]: stats.total }).map(([name, size]) => <div key={name} className="progress-meta"><span>{name}</span><span>{(size / 1024 / 1024).toFixed(2)} MB</span></div>)}</div>}
          {output && <button className="button secondary full output-button" onClick={() => invoke('open_output', { path: output }).catch(error)}><FolderOpen size={16} />{t('output')}</button>}<p className="footnote"><ShieldCheck size={13} />{t('commitHint')}</p></section><div className="workspace-note"><span>LOCAL FIRST</span><p>{t('tagline')}</p></div></aside></div>
        <details className="card activity" open={status === 'failed'}><summary><span><span className="activity-dot" />{t('log')}<b>{logs.length}</b></span><ChevronRight size={16} /></summary><div className="log-toolbar"><button onClick={async () => { try { await navigator.clipboard.writeText(logs.map(event => eventText(settings.language, event)).join('\n')); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch (reason) { error(reason); } }}>{copied ? <Check size={14} /> : <Copy size={14} />}{t(copied ? 'copied' : 'copyLog')}</button><button disabled={busy} onClick={() => setLogs([])}>{t('clear')}</button></div><div className="log-lines" role="log">{logs.length ? logs.map((event, index) => <div key={`${event.sequence}-${index}`} className={event.type === 'error' ? 'log-error' : ''}><span>{String(index + 1).padStart(2, '0')}</span><pre>{eventText(settings.language, event)}</pre></div>) : <p>{t('emptyLog')}</p>}</div></details>
      </> : page === 'settings' ? <div className="settings-grid"><section className="card"><div className="section-heading"><h2>{t('tools')}</h2><button className="button secondary" disabled={scanning || busy} onClick={() => void scan()}>{scanning ? <LoaderCircle className="spin" size={16} /> : <ShieldCheck size={16} />}{t(scanning ? 'checkingTools' : 'check')}</button></div><p className="hint">{t('toolsHint')}</p><div className="tools-list">{tools.map(tool => <div className="tool-item" key={tool.key}><div className="tool-title"><strong>{tool.name}</strong><span className={'tool-badge ' + (tool.available ? 'available' : '')}>{tool.available ? <Check size={12} /> : <span className="small-dot" />}{t(tool.available ? 'ready' : 'missing')}</span></div><p title={tool.path}>{settings.tools[tool.key] || tool.path || '—'}</p><div className="tool-actions"><button disabled={busy || scanning} className="button secondary" onClick={() => void chooseTool(tool.key)}><FolderOpen size={14} />{t('chooseTool')}</button><button className="text-button" onClick={() => void visit(tool.url)}>{t('download')}<ArrowUpRight size={14} /></button></div></div>)}</div></section><section className="card preferences"><h2>{t('preferences')}</h2><label className="field"><span>{t('language')}</span><select value={settings.language} onChange={event => patch({ language: event.target.value as 'zh' | 'en' })}><option value="zh">中文 / Chinese</option><option value="en">English</option></select></label><button disabled={busy} className="button secondary full" onClick={() => void importLegacy()}>{t('import')}</button><div className="divider" /><span className="eyebrow">SPINESLIM 2.0</span><p className="hint">Tauri 2 · React · Python</p><p className="hint">{t('version')}</p></section></div> : null}
      <footer>SpineSlim <span>© {new Date().getFullYear()} · MIT License</span></footer>
    </main>
  </div>;
}
