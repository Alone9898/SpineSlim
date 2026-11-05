import { useEffect, useMemo, useRef, useState } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { open, save } from '@tauri-apps/plugin-dialog';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Application, Container, Graphics, Texture } from 'pixi.js';
import '@pixi/unsafe-eval';
import { Emitter } from '@pixi/particle-emitter';
import { FolderOpen, File, Search, Play, Pause, RotateCcw, Maximize2, Repeat, Crosshair, Save, Undo2 } from 'lucide-react';
import { label } from './i18n';
import '../rive/rive.css';
import './particle.css';

type Asset = { id: number; path: string; bytes: number; kind: 'config' | 'image' };
type Json = unknown;
type Path = (string | number)[];
type Config = Record<string, Json>;

const imagePattern = /\.(png|webp|jpe?g|gif)$/i;
const normalize = (value: string) => value.replace(/\\/g, '/').toLowerCase();
const baseName = (value: string) => normalize(value).split('/').pop() ?? '';

function setIn(target: Json, path: Path, value: Json): Json {
  if (!path.length) return value;
  const [head, ...rest] = path;
  if (Array.isArray(target)) return target.map((item, index) => index === head ? setIn(item, rest, value) : item);
  return { ...(target as Record<string, Json>), [head]: setIn((target as Record<string, Json>)[head as string], rest, value) };
}

function collectTextures(value: Json, found = new Set<string>()): Set<string> {
  if (typeof value === 'string') { if (imagePattern.test(value)) found.add(value); }
  else if (Array.isArray(value)) value.forEach(item => collectTextures(item, found));
  else if (value && typeof value === 'object') Object.values(value).forEach(item => collectTextures(item, found));
  return found;
}

function matchImage(reference: string, images: Asset[]) {
  const wanted = normalize(reference);
  return images.find(asset => { const path = normalize(asset.path); return path === wanted || wanted.endsWith('/' + path) || path.endsWith('/' + wanted); })
    ?? images.find(asset => baseName(asset.path) === baseName(reference));
}

function fallbackTexture() {
  const size = 32;
  const surface = document.createElement('canvas'); surface.width = size; surface.height = size;
  const context = surface.getContext('2d')!;
  const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, '#ffffff'); gradient.addColorStop(1, '#ffffff00');
  context.fillStyle = gradient; context.fillRect(0, 0, size, size);
  return Texture.from(surface);
}

function NumberField({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return <input type="number" step="any" value={Number.isFinite(value) ? value : 0} onChange={event => { const next = event.target.valueAsNumber; if (Number.isFinite(next)) onChange(next); }} />;
}

function Editor({ value, path, onChange, missing, language }: { value: Json; path: Path; onChange: (path: Path, value: Json) => void; missing: Set<string>; language: 'zh' | 'en' }) {
  if (typeof value === 'number') return <NumberField value={value} onChange={next => onChange(path, next)} />;
  if (typeof value === 'boolean') return <input type="checkbox" checked={value} onChange={event => onChange(path, event.target.checked)} />;
  if (typeof value === 'string') {
    return imagePattern.test(value)
      ? <span className={missing.has(value) ? 'particle-missing' : 'particle-muted'} title={value}>{baseName(value)}</span>
      : <input type="text" value={value} onChange={event => onChange(path, event.target.value)} />;
  }
  if (Array.isArray(value)) {
    if (value.length && value.every(item => typeof item === 'string')) {
      const bad = value.filter(item => missing.has(item as string)).length;
      return <span className="particle-muted">{value.length} {label(language, 'textures')}{bad > 0 && <em className="particle-missing"> · {label(language, 'missingTextures')} {bad}</em>}</span>;
    }
    return <div className="particle-nested">{value.map((item, index) => <div key={index}>{renderChild(item, [...path, index], String(index + 1), onChange, missing, language)}</div>)}</div>;
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, Json>);
    if (entries.length && entries.length <= 4 && entries.every(([, item]) => typeof item === 'number')) {
      return <div className="particle-inline">{entries.map(([key, item]) => <label key={key}>{key}<NumberField value={item as number} onChange={next => onChange([...path, key], next)} /></label>)}</div>;
    }
    return <div className="particle-nested">{entries.map(([key, item]) => <div key={key}>{renderChild(item, [...path, key], key, onChange, missing, language)}</div>)}</div>;
  }
  return <span className="particle-muted">{String(value)}</span>;
}

function renderChild(value: Json, path: Path, name: string, onChange: (path: Path, value: Json) => void, missing: Set<string>, language: 'zh' | 'en') {
  const compound = value && typeof value === 'object' && !(Array.isArray(value) && value.every(item => typeof item === 'string')) && !(!Array.isArray(value) && Object.values(value as object).length <= 4 && Object.values(value as object).every(item => typeof item === 'number'));
  if (compound) {
    const title = value && !Array.isArray(value) && typeof (value as Record<string, Json>).type === 'string' ? `${name} · ${(value as Record<string, Json>).type}` : name;
    return <><p className="particle-sub">{title}</p><Editor value={value} path={path} onChange={onChange} missing={missing} language={language} /></>;
  }
  return <label className="particle-field"><span title={name}>{name}</span><Editor value={value} path={path} onChange={onChange} missing={missing} language={language} /></label>;
}

export default function ParticleViewer({ language, active }: { language: 'zh' | 'en'; active: boolean }) {
  const t = (key: string) => label(language, key);
  const [root, setRoot] = useState('');
  const [rootDir, setRootDir] = useState('');
  const [assets, setAssets] = useState<Asset[]>([]);
  const [selected, setSelected] = useState<Asset | null>(null);
  const [config, setConfig] = useState<Config | null>(null);
  const [original, setOriginal] = useState('');
  const [missing, setMissing] = useState<Set<string>>(new Set());
  const [textureVersion, setTextureVersion] = useState(0);
  const [appReady, setAppReady] = useState(false);
  const [playing, setPlaying] = useState(true);
  const [loop, setLoop] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [zoom, setZoom] = useState(0.5);
  const [background, setBackground] = useState('#111827');
  const [count, setCount] = useState(0);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [collapsed, setCollapsed] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const app = useRef<Application | null>(null);
  const world = useRef<Container | null>(null);
  const marker = useRef<Graphics | null>(null);
  const emitter = useRef<Emitter | null>(null);
  const sequence = useRef(0);
  const fallback = useRef<Texture | null>(null);
  const loaded = useRef(new Map<number, Texture>());
  const registered = useRef(new Set<string>());
  const configRef = useRef(config); configRef.current = config;
  const playingRef = useRef(playing); playingRef.current = playing;
  const loopRef = useRef(loop); loopRef.current = loop;
  const speedRef = useRef(speed); speedRef.current = speed;
  const zoomRef = useRef(zoom); zoomRef.current = zoom;
  const activeRef = useRef(active); activeRef.current = active;
  const assetsRef = useRef(assets); assetsRef.current = assets;

  const images = useMemo(() => assets.filter(asset => asset.kind === 'image'), [assets]);
  const configs = useMemo(() => assets.filter(asset => asset.kind === 'config' && asset.path.toLowerCase().includes(search.toLowerCase())), [assets, search]);
  const text = useMemo(() => config === null ? '' : JSON.stringify(config, null, 4), [config]);
  const dirty = config !== null && text !== original;
  const references = useMemo(() => [...collectTextures(config)], [config]);
  const referenceKey = references.join('\n');

  const scan = async (path: string) => {
    const token = ++sequence.current;
    setLoading(true); setError(''); setStatus(''); setRoot(path); setSelected(null); setConfig(null); setOriginal(''); setAssets([]);
    loaded.current.clear();
    try {
      const result = await invoke<Asset[]>('particle_scan', { path });
      if (token !== sequence.current) return;
      const directory = /\.json$/i.test(path) ? path.replace(/[\\/][^\\/]*$/, '') : path;
      setRootDir(directory); setAssets(result); assetsRef.current = result;
      const first = result.find(asset => asset.kind === 'config' && (!/\.json$/i.test(path) || path.replace(/\\/g, '/').endsWith('/' + asset.path)));
      if (first) await select(first, token);
    } catch (reason) { if (token === sequence.current) setError(t(String(reason))); }
    finally { if (token === sequence.current) setLoading(false); }
  };
  const select = async (asset: Asset, scanToken?: number) => {
    const token = scanToken ?? ++sequence.current;
    setSelected(asset); setError(''); setStatus('');
    try {
      const bytes = await invoke<ArrayBuffer | number[]>('particle_read', { id: asset.id });
      if (token !== sequence.current) return;
      const parsed = JSON.parse(new TextDecoder().decode(new Uint8Array(bytes))) as Config;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('invalid');
      setConfig(parsed); setOriginal(JSON.stringify(parsed, null, 4));
    } catch (reason) { if (token === sequence.current) { setConfig(null); setError(reason instanceof SyntaxError || (reason as Error)?.message === 'invalid' ? t('invalid') : t(String(reason))); } }
  };
  const choose = async (directory: boolean) => {
    if (!isTauri()) { setError(t('noDesktop')); return; }
    try {
      const picked = await open({ directory, multiple: false, ...(directory ? {} : { filters: [{ name: 'JSON', extensions: ['json'] }] }) });
      if (typeof picked === 'string') void scan(picked);
    } catch (reason) { setError(String(reason)); }
  };
  const saveAs = async () => {
    if (!selected || config === null) return;
    try {
      const name = selected.path.split('/').pop() ?? 'particle.json';
      const target = await save({ defaultPath: rootDir ? `${rootDir}/${selected.path}` : name, filters: [{ name: 'JSON', extensions: ['json'] }] });
      if (!target) return;
      await invoke('particle_save', { path: target, content: text });
      setOriginal(text); setStatus(t('saved'));
    } catch (reason) { setError(t(String(reason))); }
  };
  const edit = (path: Path, value: Json) => { setStatus(''); setConfig(current => setIn(current, path, value) as Config); };

  const build = () => {
    emitter.current?.destroy(); emitter.current = null;
    const container = world.current;
    const current = configRef.current;
    if (!container || !current) return;
    try {
      const instance = new Emitter(container, structuredClone(current) as never);
      instance.autoUpdate = false; instance.emit = true;
      emitter.current = instance;
      const position = (current as { pos?: { x?: number; y?: number } }).pos;
      marker.current?.position.set(position?.x ?? 0, position?.y ?? 0);
      setError(current_ => current_ === t('emitterError') ? '' : current_);
    } catch { setError(t('emitterError')); }
  };
  const resetView = () => {
    const container = world.current; const view = app.current?.screen;
    if (!container || !view) return;
    const position = (configRef.current as { pos?: { x?: number; y?: number } } | null)?.pos;
    container.scale.set(zoomRef.current);
    container.position.set(view.width / 2 - (position?.x ?? 0) * zoomRef.current, view.height / 2 - (position?.y ?? 0) * zoomRef.current);
  };

  useEffect(() => {
    if (!isTauri()) return;
    const listener = getCurrentWindow().onDragDropEvent(event => {
      if (activeRef.current && event.payload.type === 'drop' && event.payload.paths[0]) void scan(event.payload.paths[0]);
    });
    return () => { sequence.current++; listener.then(unlisten => unlisten()); };
  }, []);

  useEffect(() => {
    const view = canvas.current; const host = stage.current;
    if (!view || !host || !active || !assets.length) return;
    const pixi = new Application({ view, backgroundAlpha: 0, antialias: true, resizeTo: host, autoStart: true, resolution: Math.min(devicePixelRatio, 2), autoDensity: true });
    const container = new Container();
    const cross = new Graphics();
    cross.lineStyle(2, 0xffffff, 0.55).moveTo(-12, 0).lineTo(12, 0).moveTo(0, -12).lineTo(0, 12);
    pixi.stage.addChild(container); container.addChild(cross);
    app.current = pixi; world.current = container; marker.current = cross;
    fallback.current ??= fallbackTexture();
    let dragging = false;
    const down = (event: PointerEvent) => { dragging = true; view.setPointerCapture(event.pointerId); };
    const move = (event: PointerEvent) => { if (dragging) container.position.set(container.x + event.movementX, container.y + event.movementY); };
    const up = () => { dragging = false; };
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      const next = Math.min(4, Math.max(0.05, zoomRef.current * (event.deltaY < 0 ? 1.1 : 1 / 1.1)));
      const rect = view.getBoundingClientRect();
      const px = event.clientX - rect.left; const py = event.clientY - rect.top;
      const ratio = next / zoomRef.current;
      container.position.set(px - (px - container.x) * ratio, py - (py - container.y) * ratio);
      container.scale.set(next); setZoom(next);
    };
    view.addEventListener('pointerdown', down); view.addEventListener('pointermove', move); view.addEventListener('pointerup', up); view.addEventListener('wheel', wheel, { passive: false });
    let elapsed = 0;
    pixi.ticker.add(() => {
      const running = emitter.current;
      if (running && playingRef.current) {
        running.update(pixi.ticker.deltaMS / 1000 * speedRef.current);
        if (loopRef.current && !running.emit && running.particleCount === 0) build();
      }
      elapsed += pixi.ticker.deltaMS;
      if (elapsed > 250) { elapsed = 0; setCount(emitter.current?.particleCount ?? 0); }
    });
    resetView(); setAppReady(true);
    return () => {
      view.removeEventListener('pointerdown', down); view.removeEventListener('pointermove', move); view.removeEventListener('pointerup', up); view.removeEventListener('wheel', wheel);
      emitter.current?.destroy(); emitter.current = null;
      pixi.destroy(false, { children: true }); app.current = null; world.current = null; marker.current = null; setAppReady(false);
    };
  }, [active, assets.length > 0]);

  useEffect(() => {
    let cancelled = false;
    const refs = referenceKey ? referenceKey.split('\n') : [];
    const run = async () => {
      for (const id of registered.current) Texture.removeFromCache(id);
      registered.current.clear();
      const unresolved = new Set<string>();
      for (const reference of refs) {
        const asset = matchImage(reference, assetsRef.current.filter(item => item.kind === 'image'));
        let texture = asset ? loaded.current.get(asset.id) : undefined;
        if (asset && !texture) {
          try {
            const bytes = await invoke<ArrayBuffer | number[]>('particle_read', { id: asset.id });
            texture = Texture.from(await createImageBitmap(new Blob([new Uint8Array(bytes)])));
            loaded.current.set(asset.id, texture);
          } catch { texture = undefined; }
        }
        if (cancelled) return;
        if (!texture) { unresolved.add(reference); texture = fallback.current ?? (fallback.current = fallbackTexture()); }
        Texture.addToCache(texture, reference); registered.current.add(reference);
      }
      if (!cancelled) { setMissing(unresolved); setTextureVersion(version => version + 1); }
    };
    void run();
    return () => { cancelled = true; };
  }, [referenceKey, assets]);

  useEffect(() => {
    if (!appReady || config === null) return;
    const timer = window.setTimeout(build, 120);
    return () => window.clearTimeout(timer);
  }, [appReady, config, textureVersion]);

  useEffect(() => { if (world.current) { const container = world.current; const view = app.current?.screen; if (view) { const cx = view.width / 2; const cy = view.height / 2; const ratio = zoom / container.scale.x; container.position.set(cx - (cx - container.x) * ratio, cy - (cy - container.y) * ratio); container.scale.set(zoom); } } }, [zoom]);
  useEffect(() => { if (selected) resetView(); }, [selected?.id]);

  return <section className="rive-root">
    <div className="rive-toolbar">
      <div className="rive-path" title={root}><FolderOpen size={17} /><span>{root || t('title')}</span></div>
      <div className="rive-actions">
        <button className="button secondary" onClick={() => void choose(true)}><FolderOpen size={15} />{t('folder')}</button>
        <button className="button secondary" onClick={() => void choose(false)}><File size={15} />{t('file')}</button>
      </div>
    </div>
    {error && <div className="notice" role="alert">{error}</div>}
    {!assets.length ? <div className="viewer-empty rive-import-empty">{loading ? <><FolderOpen size={34} /><h2>{t('loading')}</h2></> : <><div className="viewer-empty-icon"><FolderOpen size={36} /></div><span className="eyebrow">PARTICLES</span><h2>{root ? t('noFiles') : t('empty')}</h2><p>{t('hint')}</p><div className="rive-import-actions"><button className="button secondary" onClick={() => void choose(true)}><FolderOpen size={15} />{t('folder')}</button><button className="button secondary" onClick={() => void choose(false)}><File size={15} />{t('file')}</button></div></>}</div>
      : <div className={'rive-workbench particle-workbench' + (collapsed ? ' collapsed' : '')}>
        <aside className="rive-library">
          <button className="rive-collapse" onClick={() => setCollapsed(value => !value)} aria-label={t(collapsed ? 'expandFiles' : 'collapseFiles')}>{collapsed ? '›' : '‹'}</button>
          {!collapsed && <>
            <label className="rive-search"><Search size={15} /><input aria-label={t('search')} placeholder={t('search')} value={search} onChange={event => setSearch(event.target.value)} /></label>
            <div className="particle-group">{t('configs')} · {configs.length}</div>
            <div className="particle-files">{configs.map(asset => <button key={asset.id} className={selected?.id === asset.id ? 'selected' : ''} onClick={() => void select(asset)} title={asset.path}><File size={14} /><span>{asset.path}</span></button>)}</div>
            <small>{t('images')} · {images.length}</small>
          </>}
        </aside>
        <div className="rive-main">
          <div className="rive-stage" ref={stage} style={{ backgroundColor: background }}>
            <canvas ref={canvas} />
            <div className="rive-stage-badges"><span>@pixi/particle-emitter 5.0.8</span><span>{count} {t('particles')}</span></div>
            {loading && <div className="rive-stage-overlay">{t('loading')}</div>}
          </div>
          <div className="rive-controls">
            <div className="particle-controls-row">
              <button className="active" onClick={() => setPlaying(value => !value)} aria-label={t(playing ? 'pause' : 'play')}>{playing ? <Pause size={16} /> : <Play size={16} />}</button>
              <button onClick={() => { build(); setPlaying(true); }} aria-label={t('restart')} title={t('restart')}><RotateCcw size={16} /></button>
              <button className={loop ? 'active' : ''} onClick={() => setLoop(value => !value)} aria-label={t('loop')} title={t('loop')}><Repeat size={16} /></button>
              <select aria-label={t('speed')} value={speed} onChange={event => setSpeed(Number(event.target.value))}>{[0.1, 0.25, 0.5, 1, 1.5, 2].map(value => <option key={value} value={value}>{value}×</option>)}</select>
              <label>{t('zoom')}<input type="range" min={0.05} max={4} step={0.05} value={zoom} onChange={event => setZoom(Number(event.target.value))} /><span>{Math.round(zoom * 100)}%</span></label>
              <button onClick={() => { resetView(); }} aria-label={t('resetView')} title={t('resetView')}><Crosshair size={16} /></button>
              <input type="color" aria-label={t('background')} value={background} onChange={event => setBackground(event.target.value)} />
              <button onClick={() => void stage.current?.requestFullscreen()} aria-label={t('fullscreen')}><Maximize2 size={16} /></button>
            </div>
          </div>
        </div>
        <aside className="rive-properties">
          <div className="rive-panel-top"><strong>{t('params')}</strong><span className="particle-muted">{selected?.path}</span></div>
          <div className="rive-panel-scroll"><div className="rive-panel-body particle-form">
            {config !== null && Object.entries(config).map(([key, value]) => <div key={key}>{renderChild(value, [key], key, edit, missing, language)}</div>)}
          </div></div>
          <div className="particle-save-bar">
            <span className={'badge' + (dirty ? ' dirty' : '')}>{dirty ? t('modified') : status}</span>
            <button className="button secondary" disabled={!dirty} onClick={() => { setConfig(JSON.parse(original)); setStatus(''); }}><Undo2 size={14} />{t('reset')}</button>
            <button className="button" disabled={config === null} onClick={() => void saveAs()}><Save size={14} />{t('saveAs')}</button>
          </div>
        </aside>
      </div>}
  </section>;
}
