import { useEffect, useRef, useState } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { open, save } from '@tauri-apps/plugin-dialog';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Box, File, FolderOpen, LoaderCircle, Pause, Play, Video, X } from 'lucide-react';
import { loadModel, type ModelFile } from './load';
import { ModelStage, type Lighting, type ModelInfo, type RenderMode } from './stage';
import { label } from './i18n';
import './model.css';

export default function ModelViewer({ language, active }: { language: 'zh' | 'en'; active: boolean }) {
  const t = (key: string) => label(language, key);
  const [root, setRoot] = useState('');
  const [files, setFiles] = useState<ModelFile[]>([]);
  const [selected, setSelected] = useState<ModelFile | null>(null);
  const [info, setInfo] = useState<ModelInfo | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<RenderMode>('shaded');
  const [lighting, setLighting] = useState<Lighting>('studio');
  const [background, setBackground] = useState('#111827');
  const [grid, setGrid] = useState(false);
  const [measure, setMeasure] = useState(false);
  const [distance, setDistance] = useState<number | null>(null);
  const [clipIndex, setClipIndex] = useState(-1);
  const [playing, setPlaying] = useState(true);
  const [seconds, setSeconds] = useState(5);
  const [fps, setFps] = useState(24);
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [saved, setSaved] = useState('');
  const canvas = useRef<HTMLCanvasElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const stage = useRef<ModelStage | null>(null);
  const exportController = useRef<AbortController | null>(null);
  const exportingRef = useRef(false);
  const scanSequence = useRef(0);
  const activeRef = useRef(active); activeRef.current = active;

  const scan = async (path: string) => {
    const token = ++scanSequence.current;
    setRoot(path); setFiles([]); setSelected(null); setInfo(null); setError(''); setSaved(''); setLoading(true);
    try {
      const catalog = await invoke<ModelFile[]>('model_scan', { path });
      if (token !== scanSequence.current) return;
      const models = catalog.filter(file => file.model);
      setFiles(catalog);
      const name = path.replaceAll('\\', '/').split('/').pop()?.toLowerCase();
      setSelected(models.find(file => file.path.toLowerCase() === name) ?? models[0] ?? null);
    } catch (reason) { if (token === scanSequence.current) setError(t(String(reason))); }
    finally { if (token === scanSequence.current) setLoading(false); }
  };

  const choose = async (directory: boolean) => {
    if (!isTauri()) { setError(t('desktop')); return; }
    if (exportingRef.current) return;
    try {
      const path = await open({ directory, multiple: false, ...(directory ? {} : { filters: [{ name: '3D model', extensions: ['glb', 'gltf', 'fbx', 'obj', 'stl'] }] }) });
      if (typeof path === 'string') void scan(path);
    } catch (reason) { setError(String(reason)); }
  };

  useEffect(() => {
    if (!isTauri()) return;
    const listener = getCurrentWindow().onDragDropEvent(event => {
      if (activeRef.current && !exportingRef.current && event.payload.type === 'drop' && event.payload.paths[0]) void scan(event.payload.paths[0]);
    });
    return () => { scanSequence.current++; listener.then(unlisten => unlisten()); };
  }, []);

  useEffect(() => {
    if (!active || !canvas.current || !host.current) return;
    let current: ModelStage;
    try { current = new ModelStage(canvas.current, setDistance); }
    catch (reason) { setError(String(reason)); return; }
    stage.current = current;
    const observer = new ResizeObserver(() => {
      if (host.current) current.resize(host.current.clientWidth, host.current.clientHeight);
    });
    observer.observe(host.current);
    current.resize(host.current.clientWidth, host.current.clientHeight);
    return () => { exportController.current?.abort(); observer.disconnect(); current.dispose(); if (stage.current === current) stage.current = null; };
  }, [active, !!selected]);

  useEffect(() => {
    const current = stage.current;
    if (!active || !selected || !current) return;
    const controller = new AbortController();
    setError(''); setLoading(true); setInfo(null); setDistance(null); setClipIndex(-1);
    loadModel(selected, files, controller.signal).then(loaded => {
      if (controller.signal.aborted) { loaded.release(); return; }
      const details = current.setModel(loaded);
      setInfo(details); setClipIndex(details.clips.length ? 0 : -1); setPlaying(true);
      if (loaded.missing.length) setError(`${t('model.read')} ${loaded.missing.slice(0, 3).join(', ')}`);
    }).catch(reason => { if (!controller.signal.aborted) setError(t(String(reason?.message ?? reason))); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [active, selected, files]);

  useEffect(() => { stage.current?.setRenderMode(mode); }, [mode, info]);
  useEffect(() => { stage.current?.setLighting(lighting); }, [lighting, info]);
  useEffect(() => { stage.current?.setBackground(background); }, [background, info]);
  useEffect(() => { stage.current?.setGrid(grid); }, [grid, info]);
  useEffect(() => { stage.current?.setMeasurement(measure); }, [measure, info]);
  useEffect(() => { stage.current?.setPlaying(playing); }, [playing, info]);
  useEffect(() => { if (info) stage.current?.selectClip(clipIndex); }, [clipIndex]);

  const exportVideo = async () => {
    if (!stage.current || !info || !selected || exporting) return;
    if (!isTauri()) { setError(t('desktop')); return; }
    try {
      const target = await save({ defaultPath: `${selected.path.split('/').pop()?.replace(/\.[^.]+$/, '') ?? 'model'}-preview.mp4`, filters: [{ name: 'MP4', extensions: ['mp4'] }] });
      if (!target) return;
      const controller = new AbortController();
      exportController.current = controller;
      exportingRef.current = true; setExporting(true); setProgress(0); setError(''); setSaved('');
      const result = await stage.current.exportMp4(target, seconds, fps, controller.signal, (done, total) => setProgress(Math.round(done / total * 100)));
      setSaved(result);
    } catch (reason) {
      if ((reason as Error)?.name !== 'AbortError') setError(t(String((reason as Error)?.message ?? reason).split('|')[0]));
    } finally { exportController.current = null; exportingRef.current = false; setExporting(false); }
  };

  const models = files.filter(file => file.model);
  return <section className="model-root">
    <div className="model-toolbar"><div className="model-path" title={root}><Box size={17} /><span>{root || t('title')}</span></div><div className="model-toolbar-actions"><button className="button secondary" disabled={exporting} onClick={() => void choose(true)}><FolderOpen size={15} />{t('folder')}</button><button className="button secondary" disabled={exporting} onClick={() => void choose(false)}><File size={15} />{t('file')}</button></div></div>
    {error && <div className="notice" role="alert">{error}<button aria-label="Close" onClick={() => setError('')}><X size={14} /></button></div>}
    {!selected ? <div className="viewer-empty model-import-empty">{loading ? <><LoaderCircle size={32} className="spin" /><h2>{t('loading')}</h2></> : <><div className="viewer-empty-icon"><Box size={36} /></div><span className="eyebrow">3D MODEL LIBRARY</span><h2>{root ? t('noModels') : t('empty')}</h2><p>{t('hint')}</p><div className="model-import-actions"><button className="button primary" onClick={() => void choose(true)}><FolderOpen size={17} />{t('folder')}</button><button className="button secondary" onClick={() => void choose(false)}><File size={17} />{t('file')}</button></div><small>{t('support')}</small></>}</div> : <div className="model-workbench">
      <aside className="model-library"><strong>{t('files')} <span>{models.length}</span></strong><div className="model-file-list">{models.map(file => <button key={file.id} disabled={exporting} className={selected?.id === file.id ? 'selected' : ''} title={file.path} onClick={() => setSelected(file)}><Box size={15} /><span>{file.path}</span></button>)}</div>{!models.length && <p>{root ? t('noModels') : t('unsupported')}</p>}</aside>
      <div className="model-center"><div className={'model-stage' + (measure ? ' measuring' : '')} ref={host}><canvas ref={canvas} />{loading && <div className="model-loading">{t('loading')}</div>}<div className="model-stage-hint">{measure ? t('measureHint') : t('controls')}</div></div><div className="model-playback"><label>{t('animation')}<select value={clipIndex} onChange={event => { const index = Number(event.target.value); setClipIndex(index); stage.current?.selectClip(index); }}><option value={-1}>{t('noAnimation')}</option>{info?.clips.map((clip, index) => <option key={`${clip}-${index}`} value={index}>{clip}</option>)}</select></label><button onClick={() => setPlaying(value => !value)} disabled={clipIndex < 0} aria-label={t(playing ? 'pause' : 'play')}>{playing ? <Pause size={16} /> : <Play size={16} />}</button></div></div>
      <aside className="model-inspector"><h2>{t('model')}</h2><div className="model-inspector-scroll"><section><label>{t('render')}<select value={mode} onChange={event => setMode(event.target.value as RenderMode)}>{(['shaded', 'wireframe', 'normals'] as const).map(value => <option key={value} value={value}>{t(value)}</option>)}</select></label><label>{t('lighting')}<select value={lighting} onChange={event => setLighting(event.target.value as Lighting)}>{(['studio', 'warm', 'flat'] as const).map(value => <option key={value} value={value}>{t(value)}</option>)}</select></label><label className="model-color">{t('background')}<input type="color" value={background} onChange={event => setBackground(event.target.value)} /></label><label className="model-check">{t('grid')}<input type="checkbox" checked={grid} onChange={event => setGrid(event.target.checked)} /></label><label className="model-check">{t('measure')}<input type="checkbox" checked={measure} onChange={event => setMeasure(event.target.checked)} /></label>{measure && <p className="model-hint">{distance === null ? t('measureHint') : `${t('distance')}: ${distance.toFixed(3)}`}</p>}</section><section><h3>{t('dimensions')}</h3><div className="model-stats"><span>X</span><strong>{info?.dimensions[0].toFixed(3) ?? '—'}</strong><span>Y</span><strong>{info?.dimensions[1].toFixed(3) ?? '—'}</strong><span>Z</span><strong>{info?.dimensions[2].toFixed(3) ?? '—'}</strong><span>{t('vertices')}</span><strong>{info?.vertices.toLocaleString() ?? '—'}</strong><span>{t('triangles')}</span><strong>{info?.triangles.toLocaleString() ?? '—'}</strong><span>{t('meshes')}</span><strong>{info?.meshes ?? '—'}</strong><span>{t('bones')}</span><strong>{info?.bones ?? '—'}</strong></div></section><section><h3>{t('record')}</h3><div className="model-export-row"><label>{t('duration')}<select value={seconds} onChange={event => setSeconds(Number(event.target.value))}>{[3, 5, 10].map(value => <option key={value} value={value}>{value}s</option>)}</select></label><label>{t('fps')}<select value={fps} onChange={event => setFps(Number(event.target.value))}>{[24, 30].map(value => <option key={value} value={value}>{value}</option>)}</select></label></div><p className="model-hint">{t('turntable')}</p><button className="button primary full" disabled={!info || exporting} onClick={() => void exportVideo()}><Video size={15} />{exporting ? `${t('exporting')} ${progress}%` : t('record')}</button>{exporting && <button className="button secondary full" onClick={() => exportController.current?.abort()}>{t('cancel')}</button>}{saved && <p className="model-saved" title={saved}>{t('saved')}: {saved}</p>}</section></div></aside>
    </div>}
  </section>;
}
