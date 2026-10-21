import { useEffect, useRef, useState } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { open, save } from '@tauri-apps/plugin-dialog';
import { FileImage, FolderOpen, Grid2X2, Download, LoaderCircle, X, Maximize, Plus, Minus } from 'lucide-react';
import { archive, decode, defaults, pack, release, type Options, type Sheet, type Source } from './engine';
import { diagnostic, label } from './i18n';
import { exportFormats, packingOptions, type ExportFormat } from './exporters';
import './packer.css';
import { TelemetryAction, TelemetryErrorCode, TelemetryModule, trackAppError, trackFeature } from '../telemetry';

type Props = { language: 'zh' | 'en'; active: boolean };
type NativeCatalog = { session: number; files: { id: number; name: string; bytes: number }[] };
export default function Packer({ language, active }: Props) {
  const [sources, setSources] = useState<Source[]>([]);
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [options, setOptions] = useState<Options>({ ...defaults });
  const [busy, setBusy] = useState('');
  const [packing, setPacking] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState('');
  const [pageIndex, setPageIndex] = useState(0);
  const [zoom, setZoom] = useState(.5);
  const [borders, setBorders] = useState(true);
  const [name, setName] = useState('atlas');
  const [format, setFormat] = useState<ExportFormat>('both');
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const preview = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const sourcesRef = useRef(sources); sourcesRef.current = sources;
  const sheetsRef = useRef(sheets); sheetsRef.current = sheets;
  const activeRef = useRef(active); activeRef.current = active;
  const lock = useRef(false);
  const mounted = useRef(true);
  const t = (key: string) => label(language, key);
  const sheet = sheets[pageIndex];
  const fit = () => {
    if (sheet && preview.current) setZoom(Math.max(.02, Math.min(1, Math.min((preview.current.clientWidth - 48) / sheet.canvas.width, (preview.current.clientHeight - 48) / sheet.canvas.height))));
  };
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; sourcesRef.current.forEach(source => source.image.close()); release(sheetsRef.current); };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setSaved(''); setError(''); setPacking(sources.length > 0); setProgress(0);
    const timer = setTimeout(async () => {
      try {
        const result = sources.length ? await pack(sources, packingOptions(options, format), controller.signal, setProgress) : [];
        if (controller.signal.aborted) { release(result); return; }
        release(sheetsRef.current); sheetsRef.current = result; setSheets(result); setPageIndex(0);
      } catch (reason) {
        if (!controller.signal.aborted) { release(sheetsRef.current); sheetsRef.current = []; setSheets([]); setError(String(reason)); }
      } finally { if (!controller.signal.aborted) setPacking(false); }
    }, 180);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [sources, options, format === 'unity']);
  useEffect(() => {
    if (sheet && canvas.current) {
      canvas.current.width = sheet.canvas.width; canvas.current.height = sheet.canvas.height;
      canvas.current.getContext('2d')!.drawImage(sheet.canvas, 0, 0);
      fit();
    }
  }, [sheet, active]);
  useEffect(() => {
    if (!preview.current) return;
    const observer = new ResizeObserver(fit);
    observer.observe(preview.current);
    return () => observer.disconnect();
  }, [sheet]);
  const importImages = async (items: { name: string; read: () => Promise<Blob> }[]) => {
    if (lock.current) return;
    lock.current = true; setBusy('importing'); setError(''); setSaved('');
    const added: Source[] = [];
    try {
      const images = items.filter(item => /\.(png|jpe?g|webp)$/i.test(item.name));
      if (!images.length) throw new Error('empty');
      if (sourcesRef.current.length + images.length > 500) throw new Error('limit');
      const names = new Set(sourcesRef.current.map(source => source.name.replace(/\.[^/.]+$/, '')));
      let pixels = sourcesRef.current.reduce((sum, source) => sum + source.image.width * source.image.height, 0);
      for (const item of images) {
        if (!mounted.current) return;
        const normalized = item.name.replace(/\\/g, '/');
        if (/[\r\n:]/.test(normalized) || normalized.split('/').includes('..') || normalized.startsWith('/')) throw new Error('invalidName');
        const key = normalized.replace(/\.[^/.]+$/, '');
        if (names.has(key)) throw new Error(`duplicate|${normalized}`);
        names.add(key);
        const blob = await item.read();
        if (blob.size > 32 * 1024 * 1024) throw new Error('limit');
        const source = await decode(blob, normalized); added.push(source);
        pixels += source.image.width * source.image.height;
        if (pixels > 32 * 1024 * 1024) throw new Error('limit');
      }
      if (mounted.current) { const imported = [...added]; setSources(previous => [...previous, ...imported]); added.length = 0; }
    } catch (reason) { if (mounted.current) setError(String(reason)); }
    finally { added.forEach(source => source.image.close()); lock.current = false; if (mounted.current) setBusy(''); }
  };
  const importPaths = async (paths: string[]) => {
    if (lock.current) return;
    lock.current = true; setBusy('importing'); setError('');
    try {
      const result = await invoke<NativeCatalog>('packer_list', { paths });
      lock.current = false;
      await importImages(result.files.map(file => ({ name: file.name, read: async () => {
        const bytes = await invoke<ArrayBuffer | number[]>('packer_read', { session: result.session, id: file.id });
        return new Blob([new Uint8Array(bytes)]);
      } })));
    } catch (reason) { setError(String(reason)); }
    finally { lock.current = false; setBusy(''); }
  };
  const choose = async (directory: boolean) => {
    if (!isTauri()) { (directory ? folderInput : fileInput).current?.click(); return; }
    try {
      const paths = await open({ directory, multiple: !directory, ...(!directory ? { filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }] } : {}) });
      if (paths) await importPaths(Array.isArray(paths) ? paths : [paths]);
    } catch (reason) { setError(String(reason)); }
  };
  useEffect(() => {
    if (!isTauri()) return;
    const subscription = getCurrentWindow().onDragDropEvent(event => {
      if (activeRef.current && event.payload.type === 'drop' && !lock.current) void importPaths(event.payload.paths);
    });
    return () => { subscription.then(stop => stop()); };
  }, []);
  const exportZip = async () => {
    if (lock.current || packing || !sheets.length) return;
    if (!name.trim() || /[<>:"/\\|?*\r\n]/.test(name) || name === '.' || name === '..') { setError('invalidName'); return; }
    lock.current = true; setBusy('exporting'); setError(''); setSaved('');
    try {
      const path = isTauri() ? await save({ defaultPath: `${name}.zip`, filters: [{ name: 'ZIP', extensions: ['zip'] }] }) : null;
      if (isTauri() && !path) return;
      const bytes = await archive(sheets, name, options.scale, format);
      if (path) { await invoke('packer_save', { target: path, bytes: Array.from(bytes) }); setSaved(path); }
      else {
        const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/zip' }));
        const link = document.createElement('a'); link.href = url; link.download = `${name}.zip`; link.click();
        setTimeout(() => URL.revokeObjectURL(url), 10000); setSaved('download');
      }
      trackFeature(TelemetryModule.AtlasPacker, TelemetryAction.ExportAtlas, sources.length);
    } catch (reason) { setError(String(reason)); trackAppError(TelemetryModule.AtlasPacker, TelemetryAction.ExportAtlas, TelemetryErrorCode.ExportFailed); }
    finally { lock.current = false; setBusy(''); }
  };
  const update = (values: Partial<Options>) => { setOptions(previous => ({ ...previous, ...values })); };
  const remove = (source: Source) => { source.image.close(); setSources(previous => previous.filter(item => item.id !== source.id)); setSelected(''); };
  const clear = () => { sources.forEach(source => source.image.close()); setSources([]); setSelected(''); setError(''); };
  const select = (id: string) => { setSelected(id); const index = sheets.findIndex(item => item.frames.some(frame => frame.id === id)); if (index >= 0) setPageIndex(index); };
  const inputs = <><input hidden ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={event => { void importImages(Array.from(event.target.files ?? []).map(file => ({ name: file.name, read: async () => file }))); event.target.value = ''; }} /><input hidden ref={folderInput} type="file" multiple {...{ webkitdirectory: '' }} onChange={event => { void importImages(Array.from(event.target.files ?? []).map(file => ({ name: file.webkitRelativePath || file.name, read: async () => file }))); event.target.value = ''; }} /></>;
  const actions = <div className="packer-import-actions"><button className="button primary" disabled={!!busy} onClick={() => void choose(false)}><FileImage size={15} />{t('files')}</button><button className="button secondary" disabled={!!busy} onClick={() => void choose(true)}><FolderOpen size={15} />{t('folder')}</button></div>;
  return <div className="packer-root" onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); if (!isTauri()) void importImages(Array.from(event.dataTransfer.files).map(file => ({ name: file.name, read: async () => file }))); }}>
    {inputs}
    {error && <div className="notice" role="alert"><span>{diagnostic(language, error)}</span><button onClick={() => setError('')} aria-label={t('remove')}><X size={15} /></button></div>}
    {saved && <div className="packer-saved" role="status">{saved === 'download' ? t('download') : `${t('saved')}：${saved}`}</div>}
    {!sources.length ? <section className="packer-empty"><div className="packer-empty-icon"><Grid2X2 size={38} /></div><h2>{t('emptyTitle')}</h2><p>{t('emptyHint')}</p>{actions}<div className="packer-empty-notes"><span>✓ {t('local')}</span><span>✓ {t('formats')}</span></div>{busy && <span role="status"><LoaderCircle className="spin" size={16} /> {t(busy)}</span>}</section> : <div className="packer-workbench">
      <aside className="packer-sources"><div className="packer-panel-heading"><strong>{t('sprites')}</strong><span>{sources.length} {t('image')}</span></div>{actions}<input className="packer-search" aria-label={t('search')} placeholder={t('search')} value={search} onChange={event => setSearch(event.target.value)} /><div className="packer-source-list">{sources.filter(source => source.name.toLowerCase().includes(search.toLowerCase())).map(source => <div key={source.id} className={selected === source.id ? 'packer-source selected' : 'packer-source'}><button className="packer-source-select" title={source.name} onClick={() => select(source.id)}><img src={source.thumbnail} alt="" /><span>{source.name}<small>{source.image.width} × {source.image.height}</small></span></button><button className="packer-remove" disabled={!!busy} aria-label={`${t('remove')} ${source.name}`} onClick={() => remove(source)}><X size={13} /></button></div>)}</div><small className="packer-list-hint">{t('select')}</small></aside>
      <section className="packer-preview"><div className="packer-preview-toolbar"><strong>{t('preview')}</strong>{sheet && <span className="packer-badge">{sheet.canvas.width} × {sheet.canvas.height}</span>}{sheet && <span className="packer-occupancy">{Math.round(sheet.occupancy * 100)}%</span>}<button title={t('fit')} aria-label={t('fit')} onClick={fit}><Maximize size={15} /></button><div className="packer-zoom"><button aria-label="−" onClick={() => setZoom(value => Math.max(.02, value / 1.25))}><Minus size={13} /></button><span>{Math.round(zoom * 100)}%</span><button aria-label="+" onClick={() => setZoom(value => Math.min(4, value * 1.25))}><Plus size={13} /></button></div><label><input type="checkbox" checked={borders} onChange={event => setBorders(event.target.checked)} />{t('borders')}</label></div>
        <div className="packer-sheet-tabs">{sheets.map((_, index) => <button key={index} className={index === pageIndex ? 'active' : ''} onClick={() => setPageIndex(index)}>A{index + 1}</button>)}<span role="status">{busy ? t(busy) : packing ? `${t('packing')} ${progress}/${sources.length}` : `${sheets.length} ${t('pages')}`}</span></div>
        <div className="packer-preview-scroll" ref={preview} onWheel={event => { if (event.ctrlKey) setZoom(value => Math.min(4, Math.max(.02, value * (event.deltaY < 0 ? 1.1 : .9)))); }}><div className="packer-preview-center">{sheet && <div className={`packer-sheet${packing ? ' stale' : ''}`} style={{ width: sheet.canvas.width * zoom, height: sheet.canvas.height * zoom }}><canvas ref={canvas} />{sheet.frames.map(frame => <button key={frame.id} title={frame.name} aria-label={frame.name} onClick={() => select(frame.id)} className={`packer-frame${borders ? ' outlined' : ''}${selected === frame.id ? ' selected' : ''}`} style={{ left: frame.x * zoom, top: frame.y * zoom, width: frame.width * zoom, height: frame.height * zoom }} />)}</div>}</div>{packing && <div className="packer-busy"><LoaderCircle className="spin" size={20} />{t('packing')}</div>}</div>
      </section>
      <aside className="packer-settings"><div className="packer-panel-heading"><strong>{t('settings')}</strong></div><fieldset disabled={!!busy} className="packer-settings-scroll"><section><h3>{t('layout')}</h3><div className="packer-fields">{(['width', 'height'] as const).map(key => <label key={key}>{t(key)}<select value={options[key]} onChange={event => update({ [key]: Number(event.target.value) })}>{[256, 512, 1024, 2048, 4096, 8192].map(value => <option key={value}>{value}</option>)}</select></label>)}</div>{(['pot', 'fixed', 'multipage'] as const).map(key => <label className="packer-check" key={key}><span>{t(key)}</span><input type="checkbox" checked={options[key]} onChange={event => update({ [key]: event.target.checked })} /></label>)}<label className="packer-field">{t('scale')}<select value={options.scale} onChange={event => update({ scale: Number(event.target.value) })}>{[.25, .5, .75, 1, 1.5, 2].map(value => <option key={value} value={value}>{value * 100}%</option>)}</select></label></section>
        <section><h3>{t('sprites')}</h3><label className="packer-check"><span>{t('trim')}</span><input type="checkbox" disabled={format === 'unity'} checked={format !== 'unity' && options.trim} onChange={event => update({ trim: event.target.checked })} /></label><div className="packer-fields">{(['threshold', 'padding', 'extrude'] as const).map(key => <label key={key}>{t(key)}<input type="number" min={0} max={key === 'threshold' ? 255 : 32} disabled={key === 'threshold' && (!options.trim || format === 'unity')} value={options[key]} onChange={event => update({ [key]: Number(event.target.value) })} /></label>)}</div><p>{t(format === 'unity' ? 'unityTrim' : 'trimHint')}</p></section>
        <section><h3>{t('exporter')}</h3><label className="packer-field">{t('name')}<input value={name} onChange={event => setName(event.target.value)} /></label><label className="packer-field">{t('format')}<select value={format} onChange={event => setFormat(event.target.value as ExportFormat)}>{exportFormats.map(value => <option key={value} value={value}>{t(value)}</option>)}</select></label><p>{t(`format.${format}`)}</p></section></fieldset>
        <div className="packer-export-actions"><button className="button primary full" disabled={!!busy || packing || !sheets.length} onClick={() => void exportZip()}>{busy === 'exporting' ? <LoaderCircle className="spin" size={16} /> : <Download size={16} />}{t(busy === 'exporting' ? 'exporting' : 'export')}</button><div><button className="button secondary" disabled={!!busy} onClick={() => setOptions({ ...defaults })}>{t('reset')}</button><button className="button secondary" disabled={!!busy} onClick={clear}>{t('clear')}</button></div></div>
      </aside>
    </div>}
  </div>;
}
