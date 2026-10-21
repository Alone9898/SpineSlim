import { useEffect, useRef, useState } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { open, save } from '@tauri-apps/plugin-dialog';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Alignment, EventType, Fit, Layout, Rive, RuntimeLoader, StateMachineInputType, type StateMachineInput } from '@rive-app/canvas';
import riveWasmUrl from '@rive-app/canvas/rive.wasm?url';
import { FolderOpen, File, Search, Play, Pause, RotateCcw, Maximize2, Copy, Trash2, ChevronRight, Download, PanelRightClose, PanelRightOpen } from 'lucide-react';
import { label } from './i18n';
import './rive.css';
import { TelemetryAction, TelemetryErrorCode, TelemetryModule, trackAppError, trackFeature } from '../telemetry';

RuntimeLoader.setWasmUrl(riveWasmUrl);
RuntimeLoader.setWasmFallbackUrl(null);

type Asset = { id: number; path: string; bytes: number };
type Board = { name: string; animations: string[]; stateMachines: { name: string; inputs: { name: string; type: StateMachineInputType }[] }[] };
type Entry = { time: string; elapsed: number; type: string; detail: string };
type PlaybackClock = { _boundDraw: (time: number, onSecond?: () => void) => void };
type PlaybackAnimation = { animator?: { animations: { name: string; time: number; animation: { duration: number; fps: number } }[] } };

function bindPlaybackSpeed(rive: Rive, speed: { current: number }) {
  const clock = rive as unknown as PlaybackClock;
  const draw = clock._boundDraw;
  if (typeof draw !== 'function') return;
  let lastTime = 0;
  let scaledTime = 0;
  clock._boundDraw = (time, onSecond) => {
    if (!lastTime) scaledTime = time;
    else scaledTime += Math.max(0, time - lastTime) * speed.current;
    lastTime = time;
    draw(scaledTime, onSecond);
  };
}

export default function RiveViewer({ language, active }: { language: 'zh' | 'en'; active: boolean }) {
  const t = (key: string) => label(language, key);
  const [root, setRoot] = useState('');
  const [assets, setAssets] = useState<Asset[]>([]);
  const [selected, setSelected] = useState<Asset | null>(null);
  const [bytes, setBytes] = useState<ArrayBuffer | null>(null);
  const [boards, setBoards] = useState<Board[]>([]);
  const [board, setBoard] = useState('');
  const [mode, setMode] = useState<'machine' | 'animation'>('machine');
  const [machine, setMachine] = useState('');
  const [animation, setAnimation] = useState('');
  const [fit, setFit] = useState(Fit.Contain);
  const [alignment, setAlignment] = useState(Alignment.Center);
  const [scale, setScale] = useState(100);
  const [speed, setSpeed] = useState(1);
  const [background, setBackground] = useState('#111827');
  const [checker, setChecker] = useState(false);
  const [inspector, setInspector] = useState(false);
  const [review, setReview] = useState(false);
  const [openPanels, setOpenPanels] = useState({ layout: true, inputs: false, timeline: false, events: false });
  const [playhead, setPlayhead] = useState(0);
  const [duration, setDuration] = useState(0);
  const [fps, setFps] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [inputs, setInputs] = useState<StateMachineInput[]>([]);
  const [inputValues, setInputValues] = useState<Record<string, boolean | number>>({});
  const [events, setEvents] = useState<Entry[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [collapsed, setCollapsed] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const instance = useRef<Rive | null>(null);
  const sequence = useRef(0);
  const startedAt = useRef(performance.now());
  const playbackTime = useRef(0);
  const lastTick = useRef(performance.now());
  const speedRef = useRef(speed); speedRef.current = speed;
  const activeRef = useRef(active); activeRef.current = active;

  const log = (type: string, detail: string) => setEvents(current => [...current.slice(-499), { time: new Date().toLocaleTimeString(), elapsed: (performance.now() - startedAt.current) / 1000, type, detail }]);
  const togglePanel = (panel: keyof typeof openPanels) => setOpenPanels(current => ({ ...current, [panel]: !current[panel] }));
  const scan = async (path: string) => {
    const token = ++sequence.current;
    setLoading(true); setError(''); setRoot(path); setSelected(null); setBytes(null); setBoards([]); setAssets([]);
    try {
      const result = await invoke<Asset[]>('rive_scan', { path });
      if (token !== sequence.current) return;
      setAssets(result);
      trackFeature(TelemetryModule.RiveViewer, TelemetryAction.ScanAssets, result.length);
      if (result.length) await select(result[0], token);
    } catch (reason) { if (token === sequence.current) { setError(t(String(reason))); trackAppError(TelemetryModule.RiveViewer, TelemetryAction.ScanAssets, TelemetryErrorCode.ScanFailed); } }
    finally { if (token === sequence.current) setLoading(false); }
  };
  const select = async (asset: Asset, scanToken?: number) => {
    const token = scanToken ?? ++sequence.current;
    startedAt.current = performance.now();
    playbackTime.current = 0;
    lastTick.current = performance.now();
    setSelected(asset); setBytes(null); setBoards([]); setBoard(''); setMachine(''); setAnimation(''); setInputs([]); setInputValues({}); setEvents([]); setPlayhead(0); setDuration(0); setFps(0); setError(''); setLoading(true);
    try {
      const result = await invoke<ArrayBuffer | number[]>('rive_read', { id: asset.id });
      if (token === sequence.current) setBytes(new Uint8Array(result).buffer);
    } catch (reason) { if (token === sequence.current) setError(t(String(reason))); }
    finally { if (token === sequence.current) setLoading(false); }
  };
  const choose = async (directory: boolean) => {
    if (!isTauri()) { setError(t('noDesktop')); return; }
    try {
      const selectedPath = await open({ directory, multiple: false, ...(directory ? {} : { filters: [{ name: 'Rive', extensions: ['riv'] }] }) });
      if (typeof selectedPath === 'string') void scan(selectedPath);
    } catch (reason) { setError(String(reason)); }
  };

  useEffect(() => {
    if (!isTauri()) return;
    const listener = getCurrentWindow().onDragDropEvent(event => {
      if (activeRef.current && event.payload.type === 'drop' && event.payload.paths[0]) void scan(event.payload.paths[0]);
    });
    return () => { sequence.current++; listener.then(unlisten => unlisten()); };
  }, []);

  useEffect(() => {
    const target = canvas.current;
    if (!target || !bytes || !active) { instance.current?.cleanup(); instance.current = null; return; }
    let disposed = false;
    const current = new Rive({
      canvas: target, buffer: bytes.slice(0), artboard: board || undefined,
      ...(mode === 'machine' && machine ? { stateMachine: machine } : mode === 'animation' && animation ? { animations: animation } : {}),
      autoplay: true, autoBind: true, layout: new Layout({ fit, alignment, layoutScaleFactor: scale / 100 }), enableRiveAssetCDN: false,
      onLoad: () => {
        if (disposed) return;
        const available = (current.contents.artboards ?? []) as Board[];
        setBoards(available);
        const currentBoard = available.find(item => item.name === current.activeArtboard) ?? available[0];
        if (currentBoard && !board) { setBoard(currentBoard.name); return; }
        if (currentBoard && mode === 'machine' && !machine && currentBoard.stateMachines.length) { setMachine(currentBoard.stateMachines[0].name); return; }
        if (currentBoard && mode === 'animation' && !animation && currentBoard.animations.length) { setAnimation(currentBoard.animations[0]); return; }
        setInputs(mode === 'machine' && machine ? current.stateMachineInputs(machine) ?? [] : []);
        current.resizeDrawingSurfaceToCanvas(); setPlaying(current.isPlaying); setLoading(false);
      },
      onLoadError: event => { if (!disposed) { setError(String(event?.data ?? 'Rive load failed')); setLoading(false); } },
    });
    bindPlaybackSpeed(current, speedRef);
    instance.current = current;
    const record = (type: string) => (event: { data?: unknown }) => {
      if (!disposed) log(type, typeof event.data === 'string' ? event.data : String((event.data as { name?: string })?.name ?? event.data ?? ''));
    };
    current.on(EventType.StateChange, record('state'));
    current.on(EventType.RiveEvent, record('event'));
    const observer = new ResizeObserver(() => current.resizeDrawingSurfaceToCanvas());
    if (stage.current) observer.observe(stage.current);
    return () => { disposed = true; observer.disconnect(); current.cleanup(); if (instance.current === current) instance.current = null; };
  }, [bytes, board, machine, animation, mode, active]);

  useEffect(() => { if (instance.current) instance.current.layout = new Layout({ fit, alignment, layoutScaleFactor: scale / 100 }); }, [fit, alignment, scale]);
  useEffect(() => {
    if (!active || !bytes) return;
    const timer = window.setInterval(() => {
      const current = instance.current;
      if (!current) return;
      const now = performance.now();
      if (current.isPlaying) playbackTime.current += Math.min((now - lastTick.current) / 1000, 0.25) * speedRef.current;
      lastTick.current = now;
      setFps(Number.isFinite(current.fps) ? Math.round(current.fps) : 0);
      const currentAnimation = (current as unknown as PlaybackAnimation).animator?.animations.find(item => item.name === animation);
      if (mode === 'animation' && currentAnimation) {
        setPlayhead(currentAnimation.time);
        setDuration(currentAnimation.animation.fps ? currentAnimation.animation.duration / currentAnimation.animation.fps : 0);
      } else {
        setPlayhead(playbackTime.current);
        setDuration(0);
      }
    }, 120);
    return () => window.clearInterval(timer);
  }, [active, bytes, animation, mode]);
  const boardInfo = boards.find(item => item.name === board);
  const changeBoard = (name: string) => { playbackTime.current = 0; setBoard(name); setMachine(''); setAnimation(''); setInputs([]); setInputValues({}); };
  const changeMode = (next: 'machine' | 'animation') => { playbackTime.current = 0; setMode(next); setMachine(''); setAnimation(''); setInputs([]); setInputValues({}); };
  const changePlayback = (name: string) => {
    playbackTime.current = 0;
    if (mode === 'machine') setMachine(name); else setAnimation(name);
    setInputs([]);
    setInputValues({});
  };
  const updateInput = (input: StateMachineInput, value: boolean | number) => {
    input.value = value;
    setInputValues(previous => ({ ...previous, [input.name]: value }));
    log('input', `${input.name}: ${value}`);
  };
  const seek = (time: number) => {
    if (!animation || !duration || mode !== 'animation') return;
    instance.current?.scrub(animation, time);
    setPlayhead(time);
  };
  const exportSession = async () => {
    try {
      const path = await save({ defaultPath: 'rive-session.json', filters: [{ name: 'JSON', extensions: ['json'] }] });
      if (!path) return;
      await invoke('rive_export_session', {
        path,
        content: JSON.stringify({ file: selected?.path, artboard: board, mode, animation, stateMachine: machine, layout: { fit, alignment, scale, background }, speed, events }, null, 2),
      });
      trackFeature(TelemetryModule.RiveViewer, TelemetryAction.ExportSession);
    } catch (reason) { setError(t(String(reason))); trackAppError(TelemetryModule.RiveViewer, TelemetryAction.ExportSession, TelemetryErrorCode.ExportFailed); }
  };
  const visible = assets.filter(asset => asset.path.toLowerCase().includes(search.toLowerCase()));
  const stateEvents = events.filter(entry => entry.type === 'state');

  return <section className="rive-root">
    <div className="rive-toolbar">
      <div className="rive-path" title={root}><FolderOpen size={17} /><span>{root || t('title')}</span></div>
      <div className="rive-actions">
        {assets.length > 0 && <button className="button secondary" onClick={() => setReview(value => !value)}>{review ? <PanelRightOpen size={15} /> : <PanelRightClose size={15} />}{t(review ? 'editMode' : 'reviewMode')}</button>}
        <button className="button secondary" onClick={() => void choose(true)}><FolderOpen size={15} />{t('folder')}</button>
        <button className="button secondary" onClick={() => void choose(false)}><File size={15} />{t('file')}</button>
      </div>
    </div>
    {error && <div className="notice" role="alert">{error}</div>}
    {!assets.length ? <div className="viewer-empty rive-import-empty">{loading ? <><FolderOpen size={34} /><h2>{t('loading')}</h2></> : <><div className="viewer-empty-icon"><FolderOpen size={36} /></div><span className="eyebrow">RIVE LIBRARY</span><h2>{root ? t('noFiles') : t('empty')}</h2><p>{t('hint')}</p><div className="rive-import-actions"><button className="button primary" onClick={() => void choose(true)}><FolderOpen size={17} />{t('folder')}</button><button className="button secondary" onClick={() => void choose(false)}><File size={17} />{t('file')}</button></div><small>{t('support')}</small></>}</div> :
      <div className={'rive-workbench' + (collapsed ? ' collapsed' : '') + (review ? ' review' : '')}>
        <aside className="rive-library">
          <button className="rive-collapse" onClick={() => setCollapsed(value => !value)} aria-label={t(collapsed ? 'expandFiles' : 'collapseFiles')}>{collapsed ? '›' : '‹'}</button>
          {!collapsed && <><label className="rive-search"><Search size={15} /><input aria-label={t('search')} placeholder={t('search')} value={search} onChange={event => setSearch(event.target.value)} /></label><div className="rive-files">{visible.map(asset => <button key={asset.id} className={selected?.id === asset.id ? 'selected' : ''} title={asset.path} onClick={() => void select(asset)}><File size={15} /><span>{asset.path}</span></button>)}</div><small>{assets.length} .riv</small></>}
        </aside>
        <div className="rive-main">
          <div className="rive-stage" ref={stage} style={{ backgroundColor: background, backgroundImage: checker ? 'conic-gradient(#ffffff1b 25%, transparent 0 50%, #ffffff1b 0 75%, transparent 0)' : undefined }}>
            <canvas ref={canvas} />
            <div className="rive-stage-badges"><span>Rive Runtime 2.45.0</span><span>{fps} FPS</span></div>
            {inspector && <div className="rive-inspector"><div><span>{t('artboard')}</span><strong>{board || '—'}</strong></div><div><span>{t('animation')}</span><strong>{mode === 'animation' ? animation || '—' : '—'}</strong></div><div><span>{t('machine')}</span><strong>{mode === 'machine' ? machine || '—' : '—'}</strong></div></div>}
            {loading && <div className="rive-stage-overlay">{t('loading')}</div>}
          </div>
          <div className="rive-controls">
            <div className="rive-playback">
              <button className="rive-play-button" onClick={() => { if (instance.current?.isPlaying) { instance.current.pause(); setPlaying(false); } else { instance.current?.play(); setPlaying(true); } }} aria-label={t(playing ? 'pause' : 'play')}>{playing ? <Pause size={17} /> : <Play size={17} />}</button>
              <span>{playhead.toFixed(1)}s</span>
              <input aria-label={t('timelineSeek')} type="range" min={0} max={duration || 1} step={0.01} value={duration ? Math.min(playhead, duration) : 0} disabled={!duration || mode !== 'animation'} onChange={event => seek(Number(event.target.value))} />
              <span>{duration ? `${duration.toFixed(1)}s` : '—'}</span>
            </div>
            <div className="rive-playback-selects">
              <select aria-label={t('artboard')} value={board} onChange={event => changeBoard(event.target.value)}>{boards.map(item => <option key={item.name}>{item.name}</option>)}</select>
              <select aria-label={t('mode')} value={mode} onChange={event => changeMode(event.target.value as 'machine' | 'animation')}><option value="machine">{t('machine')}</option><option value="animation">{t('animation')}</option></select>
              <select aria-label={t(mode)} value={mode === 'machine' ? machine : animation} onChange={event => changePlayback(event.target.value)}><option value="">{t(mode === 'machine' ? 'noMachine' : 'noAnimation')}</option>{(mode === 'machine' ? boardInfo?.stateMachines.map(item => item.name) : boardInfo?.animations)?.map(name => <option key={name}>{name}</option>)}</select>
              <button onClick={() => { instance.current?.reset({ artboard: board || undefined, stateMachine: mode === 'machine' ? machine || undefined : undefined, animations: mode === 'animation' ? animation || undefined : undefined, autoplay: true }); startedAt.current = performance.now(); playbackTime.current = 0; lastTick.current = performance.now(); setInputValues({}); setPlaying(true); log('control', t('reset')); }} aria-label={t('reset')}><RotateCcw size={16} /></button>
              <button onClick={() => void stage.current?.requestFullscreen()} aria-label={t('fullscreen')}><Maximize2 size={16} /></button>
            </div>
          </div>
        </div>
        <aside className="rive-properties">
          <div className="rive-panel-top"><strong>{t('controls')}</strong><div><button onClick={() => setReview(true)}>{t('reviewMode')}</button><button onClick={() => void choose(false)}>{t('newRive')}</button></div></div>
          <div className="rive-panel-scroll">
            <section className="rive-panel">
              <button className="rive-panel-heading" aria-label={t('layoutHeading')} aria-expanded={openPanels.layout} onClick={() => togglePanel('layout')}><span>{t('layoutHeading')}</span><ChevronRight size={17} /></button>
              {openPanels.layout && <div className="rive-panel-body">
                <label className="rive-row"><span>{t('fit')}</span><select value={fit} onChange={event => setFit(event.target.value as Fit)}>{[Fit.Contain, Fit.Cover, Fit.Fill, Fit.FitWidth, Fit.FitHeight, Fit.ScaleDown, Fit.Layout, Fit.None].map(value => <option key={value} value={value}>{t(value)}</option>)}</select></label>
                <label className="rive-row"><span>{t('align')}</span><select value={alignment} onChange={event => setAlignment(event.target.value as Alignment)}>{[Alignment.Center, Alignment.TopLeft, Alignment.TopCenter, Alignment.TopRight, Alignment.CenterLeft, Alignment.CenterRight, Alignment.BottomLeft, Alignment.BottomCenter, Alignment.BottomRight].map(value => <option key={value} value={value}>{t(value)}</option>)}</select></label>
                <label className="rive-row"><span>{t('scale')}</span><div className="rive-range"><input type="range" min={50} max={150} step={5} value={scale} onChange={event => setScale(Number(event.target.value))} /><output>{scale}%</output></div></label>
                <label className="rive-row"><span>{t('speed')}</span><select value={speed} onChange={event => setSpeed(Number(event.target.value))}>{[0.25, 0.5, 0.75, 1, 1.25, 1.5, 2].map(value => <option key={value} value={value}>{value.toFixed(2)}×</option>)}</select></label>
                <label className="rive-background-label">{t('background')}<span className="rive-background-input"><span>{background.toUpperCase()}</span><input type="color" value={background} onChange={event => setBackground(event.target.value)} /></span></label>
                <label className="rive-toggle">{t('checker')}<input type="checkbox" checked={checker} onChange={event => setChecker(event.target.checked)} /></label>
                <label className="rive-toggle">{t('inspector')}<input type="checkbox" checked={inspector} onChange={event => setInspector(event.target.checked)} /></label>
              </div>}
            </section>
            <section className="rive-panel">
              <button className="rive-panel-heading" aria-label={t('inputs')} aria-expanded={openPanels.inputs} onClick={() => togglePanel('inputs')}><span>{t('inputs')} <em>{inputs.length} {t('inputCount')}</em></span><ChevronRight size={17} /></button>
              {openPanels.inputs && <div className="rive-panel-body">{!inputs.length && <p className="rive-muted">{t('noInputs')}</p>}{inputs.map(input => <label className="rive-input-row" key={input.name}><span>{input.name}</span>{input.type === StateMachineInputType.Trigger ? <button onClick={() => { input.fire(); log('trigger', input.name); }}>{t('fire')}</button> : input.type === StateMachineInputType.Boolean ? <input type="checkbox" checked={Boolean(inputValues[input.name] ?? input.value)} onChange={event => updateInput(input, event.target.checked)} /> : <input type="number" value={Number(inputValues[input.name] ?? input.value)} onChange={event => updateInput(input, Number(event.target.value))} />}</label>)}</div>}
            </section>
            <section className="rive-panel">
              <button className="rive-panel-heading" aria-label={t('stateTimeline')} aria-expanded={openPanels.timeline} onClick={() => togglePanel('timeline')}><span>{t('stateTimeline')} <em>{stateEvents.length}</em></span><ChevronRight size={17} /></button>
              {openPanels.timeline && <div className="rive-panel-body rive-log">{stateEvents.length ? stateEvents.map((entry, index) => <p key={index}><time>{entry.elapsed.toFixed(2)}s</time><span>{entry.detail || '—'}</span></p>) : <p className="rive-muted">{t('noStates')}</p>}</div>}
            </section>
            <section className="rive-panel">
              <button className="rive-panel-heading" aria-label={t('events')} aria-expanded={openPanels.events} onClick={() => togglePanel('events')}><span>{t('events')} <em>{events.length}</em></span><ChevronRight size={17} /></button>
              {openPanels.events && <div className="rive-panel-body"><div className="rive-log-actions"><button onClick={() => void exportSession()}><Download size={14} />{t('export')}</button><button onClick={() => void navigator.clipboard.writeText(events.map(item => `${item.time} ${item.type} ${item.detail}`).join('\n'))}><Copy size={14} />{t('copy')}</button><button onClick={() => setEvents([])}><Trash2 size={14} />{t('clear')}</button></div><div className="rive-log">{events.length ? events.map((entry, index) => <p key={index}><time>{entry.time}</time><strong>{entry.type}</strong><span>{entry.detail || '—'}</span></p>) : <p className="rive-muted">{t('noEvents')}</p>}</div></div>}
            </section>
          </div>
        </aside>
      </div>}
  </section>;
}
