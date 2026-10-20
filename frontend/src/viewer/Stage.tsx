import { useEffect, useRef, useState } from 'react';
import { Play, Pause, RotateCcw, Maximize, Settings2, LoaderCircle, X, Expand, Shrink, Copy } from 'lucide-react';
import ExportPanel from './ExportPanel';
import { loadRenderer, type Asset, type Catalog, type Renderer, type View, type Loaded, type Bounds } from './model';
import { diagnostic, label } from './i18n';

type Props = { catalog: Catalog; asset: Asset; atlas: Asset; language: 'zh' | 'en'; active: boolean };
export default function Stage({ catalog, asset, atlas, language, active }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const workspace = useRef<HTMLDivElement>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [fullscreenError, setFullscreenError] = useState('');
  const [viewport, setViewport] = useState({ width: 1, height: 1 });
  const renderer = useRef<Renderer | null>(null);
  const view = useRef<View>({ width: 1, height: 1, scale: 1, x: 0, y: 0, bones: false, pma: null });
  const clock = useRef({ time: 0, animation: '', skin: '', playing: true, loop: true, speed: 1, duration: 0 });
  const seekToken = useRef(0);
  const animationCopyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sampledBounds = useRef<Bounds | null>(null);
  const resumeAfterDrag = useRef(false);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [animation, setAnimation] = useState('');
  const [animationCopied, setAnimationCopied] = useState(false);
  const [animationCopyError, setAnimationCopyError] = useState(false);
  const [skin, setSkin] = useState('');
  const [playing, setPlaying] = useState(true);
  const [loop, setLoop] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [time, setTime] = useState(0);
  const [seeking, setSeeking] = useState(false);
  const [scale, setScale] = useState(1);
  const [grid, setGrid] = useState(true);
  const [origin, setOrigin] = useState(false);
  const [checker, setChecker] = useState(false);
  const [background, setBackground] = useState('#30343b');
  const [bones, setBones] = useState(false);
  const [pma, setPma] = useState('auto');
  const [panel, setPanel] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const t = (key: string) => label(language, key);
  clock.current.playing = playing; clock.current.loop = loop; clock.current.speed = speed;
  view.current.bones = bones; view.current.pma = pma === 'auto' ? null : pma === 'pma';

  const fit = () => {
    const engine = renderer.current;
    if (!engine) return;
    const bounds = sampledBounds.current ?? engine.bounds();
    const valid = [bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite) && bounds.width > 0 && bounds.height > 0;
    view.current.x = valid ? bounds.x + bounds.width / 2 : 0;
    view.current.y = valid ? bounds.y + bounds.height / 2 : 0;
    view.current.scale = valid ? Math.max(.001, Math.min(100, Math.min(view.current.width / bounds.width, view.current.height / bounds.height) * .8)) : 1;
    setScale(view.current.scale); setPan({ x: view.current.x, y: view.current.y });
  };
  const seek = async (target: number, nextAnimation = clock.current.animation, nextSkin = clock.current.skin) => {
    const engine = renderer.current;
    if (!engine) return;
    const token = ++seekToken.current;
    setSeeking(true);
    try {
      if (nextAnimation !== clock.current.animation || nextSkin !== clock.current.skin) sampledBounds.current = null;
      engine.reset(nextAnimation, nextSkin, clock.current.loop);
      clock.current.animation = nextAnimation; clock.current.skin = nextSkin;
      clock.current.duration = engine.animations.find(item => item.name === nextAnimation)?.duration ?? 0;
      const end = Math.max(0, Math.min(target, clock.current.duration));
      let position = 0;
      while (position < end) {
        for (let frame = 0; frame < 120 && position < end; frame++) {
          const delta = Math.min(1 / 60, end - position); engine.step(delta); position += delta;
        }
        if (position < end) await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
        if (token !== seekToken.current) return;
      }
      clock.current.time = end; setTime(end);
    } catch (reason) { setError(String(reason)); }
    finally { if (token === seekToken.current) setSeeking(false); }
  };
  useEffect(() => {
    const controller = new AbortController();
    const canvas = document.createElement('canvas');
    const element = host.current!;
    element.append(canvas);
    setLoaded(null); setError(''); setTime(0); setSeeking(false); setAnimation(''); setAnimationCopied(false); setAnimationCopyError(false); setSkin('');
    const lost = (event: Event) => { event.preventDefault(); if (!controller.signal.aborted) setError('viewer.context'); };
    canvas.addEventListener('webglcontextlost', lost);
    let instance: Renderer | null = null;
    loadRenderer(canvas, catalog, asset, atlas, controller.signal).then(result => {
      if (controller.signal.aborted) { result.renderer.dispose(); return; }
      instance = result.renderer; renderer.current = instance;
      const initial = instance.animations.find(item => item.name === 'idle') ?? instance.animations.find(item => item.duration > 0) ?? instance.animations[0];
      const first = initial?.name ?? '';
      const firstSkin = instance.skins.includes('default') ? 'default' : instance.skins[0] ?? '';
      clock.current = { ...clock.current, time: 0, animation: first, skin: firstSkin, duration: initial?.duration ?? 0 };
      instance.reset(first, firstSkin, clock.current.loop);
      let left = Infinity; let top = Infinity; let right = -Infinity; let bottom = -Infinity;
      const deadline = performance.now() + 100;
      for (let frame = 0; frame <= Math.min(300, Math.ceil(clock.current.duration * 60)); frame++) {
        const bounds = instance.bounds();
        if ([bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite) && bounds.width > 0 && bounds.height > 0) {
          left = Math.min(left, bounds.x); top = Math.min(top, bounds.y); right = Math.max(right, bounds.x + bounds.width); bottom = Math.max(bottom, bounds.y + bounds.height);
        }
        if (performance.now() > deadline) break;
        instance.step(1 / 60);
      }
      sampledBounds.current = Number.isFinite(left) ? { x: left, y: top, width: right - left, height: bottom - top } : null;
      instance.reset(first, firstSkin, clock.current.loop);
      setAnimation(first); setSkin(firstSkin); setLoaded(result); fit();
    }).catch(reason => { if (!controller.signal.aborted) setError(String(reason).replace(/^Error: /, '')); });
    return () => {
      controller.abort(); seekToken.current++; renderer.current = null;
      canvas.removeEventListener('webglcontextlost', lost); instance?.dispose(); canvas.remove();
    };
  }, [catalog, asset, atlas, revision]);

  useEffect(() => {
    const element = host.current!;
    const observer = new ResizeObserver(() => { view.current.width = Math.max(1, element.clientWidth); view.current.height = Math.max(1, element.clientHeight); setViewport({ width: view.current.width, height: view.current.height }); });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const change = () => setFullscreen(document.fullscreenElement === workspace.current);
    document.addEventListener('fullscreenchange', change);
    return () => document.removeEventListener('fullscreenchange', change);
  }, []);
  useEffect(() => () => { if (animationCopyTimer.current) clearTimeout(animationCopyTimer.current); }, []);
  useEffect(() => { if (!active && document.fullscreenElement === workspace.current) void document.exitFullscreen(); }, [active]);
  const toggleFullscreen = async () => {
    try { setFullscreenError(''); if (document.fullscreenElement) await document.exitFullscreen(); else await workspace.current?.requestFullscreen(); }
    catch { setFullscreenError('viewer.fullscreenFailed'); }
  };

  useEffect(() => {
    if (!active || error) return;
    let frame = 0; let previous = 0; let lastDisplay = 0; let accumulator = 0;
    const draw = (now: number) => {
      const delta = previous ? Math.min((now - previous) / 1000, .1) : 0; previous = now;
      const engine = renderer.current;
      if (engine) {
        try {
          const state = clock.current;
          if (state.playing && !seeking && state.duration > 0) {
            accumulator += delta * state.speed;
            while (accumulator >= 1 / 60) {
              const step = state.loop ? 1 / 60 : Math.min(1 / 60, Math.max(0, state.duration - state.time));
              engine.step(step); state.time += step; accumulator -= 1 / 60;
              if (state.loop) state.time %= state.duration;
              else if (state.time >= state.duration) { setPlaying(false); accumulator = 0; break; }
            }
          } else accumulator = 0;
          engine.draw(view.current);
          if (now - lastDisplay > 80) { setTime(clock.current.time); lastDisplay = now; }
        } catch (reason) { setError(String(reason)); return; }
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [active, seeking, error]);

  useEffect(() => {
    const element = host.current!;
    let dragging = false; let space = false; let lastX = 0; let lastY = 0;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      const bounds = element.getBoundingClientRect(); const current = view.current;
      const next = Math.max(.001, Math.min(100, current.scale * Math.exp(-event.deltaY * .001)));
      current.x += (event.clientX - bounds.left - current.width / 2) * (1 / current.scale - 1 / next);
      current.y += (event.clientY - bounds.top - current.height / 2) * (1 / current.scale - 1 / next);
      current.scale = next; setScale(next); setPan({ x: current.x, y: current.y });
    };
    const down = (event: PointerEvent) => { if ((event.target as HTMLElement).closest('button,input,select')) return; if (event.button === 1 || event.button === 0 || space) { event.preventDefault(); element.focus(); dragging = true; element.classList.add('is-panning'); lastX = event.clientX; lastY = event.clientY; element.setPointerCapture(event.pointerId); } };
    const move = (event: PointerEvent) => {
      if (!dragging) return;
      view.current.x -= (event.clientX - lastX) / view.current.scale; view.current.y -= (event.clientY - lastY) / view.current.scale;
      lastX = event.clientX; lastY = event.clientY; setPan({ x: view.current.x, y: view.current.y });
    };
    const up = () => { dragging = false; element.classList.remove('is-panning'); };
    const keydown = (event: KeyboardEvent) => { if (active && event.code === 'Space' && event.target === element) { event.preventDefault(); space = true; } };
    const keyup = () => { space = false; };
    element.addEventListener('wheel', wheel, { passive: false }); element.addEventListener('pointerdown', down); element.addEventListener('pointermove', move); element.addEventListener('pointerup', up); element.addEventListener('pointercancel', up);
    window.addEventListener('keydown', keydown); window.addEventListener('keyup', keyup); window.addEventListener('blur', keyup);
    return () => { element.removeEventListener('wheel', wheel); element.removeEventListener('pointerdown', down); element.removeEventListener('pointermove', move); element.removeEventListener('pointerup', up); element.removeEventListener('pointercancel', up); window.removeEventListener('keydown', keydown); window.removeEventListener('keyup', keyup); window.removeEventListener('blur', keyup); };
  }, [active]);

  const copy = async () => { try { await navigator.clipboard.writeText(JSON.stringify({ path: asset.path, version: asset.version, runtime: loaded?.renderer.runtime, atlas: atlas.path, pages: loaded?.pages, error }, null, 2)); setCopied(true); } catch (reason) { setError(String(reason)); } };
  const copyAnimation = async () => {
    if (!animation) return;
    try {
      await navigator.clipboard.writeText(animation);
      if (animationCopyTimer.current) clearTimeout(animationCopyTimer.current);
      setAnimationCopied(true); setAnimationCopyError(false);
      animationCopyTimer.current = setTimeout(() => setAnimationCopied(false), 2000);
    }
    catch { setAnimationCopyError(true); }
  };
  const gridStep = 40 * scale * Math.pow(10, Math.floor(Math.log10(1 / scale)));
  const gridStyle = grid && !checker ? { backgroundSize: `${gridStep}px ${gridStep}px`, backgroundPosition: `${viewport.width / 2 - pan.x * scale}px ${viewport.height / 2 - pan.y * scale}px` } : {};
  return <div className="viewer-stage-layout" ref={workspace}>
    <div className="viewer-stage-main">
      <div className={'viewer-canvas ' + (grid ? 'has-grid ' : '') + (checker ? 'has-checker' : '')} style={{ backgroundColor: background, ...gridStyle }} ref={host} tabIndex={0} aria-label={t('title')}>
        <div className="viewer-canvas-caption"><span>{asset.path.split('/').pop()}</span><span>{asset.version}</span></div>
        {origin && <div className="viewer-origin" style={{ left: `calc(50% - ${pan.x * scale}px)`, top: `calc(50% - ${pan.y * scale}px)` }} />}
        {!loaded && !error && <div className="viewer-overlay"><LoaderCircle className="spin" /><span>{t('loading')}</span></div>}
        {error && <div className="viewer-overlay viewer-error"><strong>{t('failed')}</strong><span>{diagnostic(language, error)}</span><div><button className="button secondary" onClick={() => setRevision(value => value + 1)}>{t('retry')}</button><button className="button secondary" onClick={() => void copy()}>{t(copied ? 'copied' : 'copy')}</button></div></div>}
        <div className="viewer-canvas-help">{t('instructions')}</div>
      </div>
      <div className="viewer-transport">
        <button title={t(playing ? 'pause' : 'play')} aria-label={t(playing ? 'pause' : 'play')} disabled={!loaded || !!error} onClick={() => { if (!playing && time >= clock.current.duration) void seek(0); setPlaying(value => !value); }}>{playing ? <Pause size={17} /> : <Play size={17} />}</button>
        <button title={t('start')} aria-label={t('start')} disabled={!loaded} onClick={() => void seek(0)}><RotateCcw size={16} /></button>
        <input aria-label={t('timeline')} type="range" min={0} max={clock.current.duration || 1} step={.001} value={time} disabled={!loaded || !clock.current.duration} onPointerDown={event => { resumeAfterDrag.current = playing; setPlaying(false); event.currentTarget.setPointerCapture(event.pointerId); }} onPointerUp={() => setPlaying(resumeAfterDrag.current)} onPointerCancel={() => setPlaying(resumeAfterDrag.current)} onChange={event => void seek(Number(event.target.value))} />
        <span>{time.toFixed(2)} / {clock.current.duration.toFixed(2)}s</span>
        <button title={t('fit')} aria-label={t('fit')} disabled={!loaded} onClick={fit}><Maximize size={17} /></button>
        <button title={t(fullscreen ? 'viewer.exitFullscreen' : 'viewer.fullscreen')} aria-label={t(fullscreen ? 'viewer.exitFullscreen' : 'viewer.fullscreen')} onClick={() => void toggleFullscreen()}>{fullscreen ? <Shrink size={17} /> : <Expand size={17} />}</button>
        <button className="viewer-properties-button" aria-label={t('properties')} onClick={() => setPanel(value => !value)}><Settings2 size={17} /></button>
      </div>
      <div className="viewer-bottom"><span>{seeking ? t('seeking') : loaded?.renderer.runtime ?? '—'}</span><span>{Math.round(scale * 100)}%</span></div>
      {fullscreenError && <p role="alert">{t(fullscreenError)}</p>}
    </div>
    <aside className={'viewer-properties ' + (panel ? 'is-open' : '')}>
      <div className="viewer-panel-title"><strong>{t('properties')}</strong><button className="viewer-properties-button" aria-label="Close" onClick={() => setPanel(false)}><X size={16} /></button></div>
      <fieldset disabled={!loaded || !!error}>
        <div className="field viewer-animation-field"><div className="viewer-animation-heading"><span>{t('animation')}</span><button type="button" disabled={!animation} title={t('copyAnimation')} aria-label={t('copyAnimation')} onClick={() => void copyAnimation()}><Copy size={13} />{t('copyAnimation')}</button></div><select aria-label={t('animation')} value={animation} onChange={event => { setAnimation(event.target.value); setAnimationCopied(false); setAnimationCopyError(false); void seek(0, event.target.value); }}><option value="">{t('setup')}</option>{loaded?.renderer.animations.map(item => <option key={item.name} value={item.name}>{item.name} · {item.duration.toFixed(2)}s</option>)}</select>{animationCopied && <small className="viewer-animation-copied" role="status">{t('copied')}</small>}{animationCopyError && <small role="alert">{t('copyAnimationFailed')}</small>}</div>
        <label className="field"><span>{t('skin')}</span><select value={skin} onChange={event => { setSkin(event.target.value); void seek(clock.current.time, clock.current.animation, event.target.value); }}>{loaded?.renderer.skins.map(item => <option key={item}>{item}</option>)}</select></label>
        <label className="field"><span>{t('speed')} <b>{speed.toFixed(1)}×</b></span><input type="range" min={.1} max={3} step={.1} value={speed} onChange={event => setSpeed(Number(event.target.value))} /></label>
        <label className="viewer-check"><input type="checkbox" checked={loop} onChange={event => { clock.current.loop = event.target.checked; setLoop(event.target.checked); void seek(clock.current.time); }} />{t('loop')}</label>
      </fieldset>
      <div className="divider" />
      <label className="viewer-color"><span>{t('background')}</span><input aria-label={t('background')} type="color" value={background} onChange={event => setBackground(event.target.value)} /></label>
      <div className="viewer-checks">{([{ key: 'grid', value: grid, setter: setGrid }, { key: 'checker', value: checker, setter: setChecker }, { key: 'origin', value: origin, setter: setOrigin }, { key: 'bones', value: bones, setter: setBones }]).map(item => <label className="viewer-check" key={item.key}><input type="checkbox" checked={item.value} onChange={event => item.setter(event.target.checked)} />{t(item.key)}</label>)}</div>
      <label className="field"><span>Alpha</span><select value={pma} onChange={event => setPma(event.target.value)}><option value="auto">{t('auto')}</option><option value="straight">{t('straight')}</option><option value="pma">{t('premultiplied')}</option></select></label>
      <div className="divider" /><strong>{t('info')}</strong><dl><dt>{t('exportVersion')}</dt><dd>{asset.version || t('unknown')}</dd><dt>{t('runtime')}</dt><dd>{loaded?.renderer.runtime ?? '—'}</dd><dt>Atlas</dt><dd>{atlas.path}</dd>{loaded?.pages.map(page => <div key={page.name}><dt>{page.name}</dt><dd>{page.width} × {page.height} · {page.pma ? 'PMA' : 'Straight'}</dd></div>)}</dl>
      <button className="button secondary full" onClick={() => void copy()}>{t(copied ? 'copied' : 'copy')}</button>
      <ExportPanel language={language} enabled={!!loaded && !error} assetKey={`${catalog.session}/${asset.id}/${atlas.id}`} options={() => ({ catalog, asset, atlas, animation: clock.current.animation, skin: clock.current.skin, duration: clock.current.duration, speed: clock.current.speed, view: { ...view.current }, background, })} />
    </aside>
  </div>;
}
