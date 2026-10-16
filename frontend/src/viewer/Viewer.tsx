import { useEffect, useRef, useState } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { open } from '@tauri-apps/plugin-dialog';
import { FolderOpen, Files, RefreshCw, Search, Sparkles, PanelLeftClose, LoaderCircle } from 'lucide-react';
import { candidates, family, supported, type Asset, type Catalog } from './model';
import { diagnostic, label } from './i18n';
import Stage from './Stage';
import ResourceTree from './ResourceTree';
import './viewer.css';

export default function Viewer({ language, active }: { language: 'zh' | 'en'; active: boolean }) {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [selected, setSelected] = useState<Asset | null>(null);
  const [atlasId, setAtlasId] = useState('');
  const [paths, setPaths] = useState<string[]>([]);
  const [scanning, setScanning] = useState(false);
  const [scanned, setScanned] = useState(0);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [collapsed, setCollapsed] = useState(false);
  const request = useRef(0);
  const activeRef = useRef(active); activeRef.current = active;
  const t = (key: string) => label(language, key);
  const scan = async (next: string[]) => {
    if (!isTauri()) { setError('previewOnly'); return; }
    const token = ++request.current;
    setScanning(true); setScanned(0); setError(''); setPaths(next); setSelected(null); setCatalog(null); setAtlasId('');
    try {
      const result = await invoke<Catalog>('viewer_scan', { paths: next });
      if (token !== request.current) return;
      setCatalog(result);
      const first = result.assets.find(asset => asset.kind === 'skeleton');
      if (first) select(first, result);
    } catch (reason) { if (token === request.current) setError(String(reason)); }
    finally { if (token === request.current) setScanning(false); }
  };
  const choose = async (directory: boolean) => {
    if (!isTauri()) { setError('previewOnly'); return; }
    try {
      const result = await open({ directory, multiple: !directory, ...(directory ? {} : { filters: [{ name: 'Spine', extensions: ['json', 'skel', 'atlas', 'png', 'jpg', 'jpeg', 'webp', 'basis', 'ktx', 'ktx2'] }] }) });
      if (result) void scan(Array.isArray(result) ? result : [result]);
    } catch (reason) { setError(String(reason)); }
  };
  const select = (asset: Asset, source = catalog) => {
    setSelected(asset); setError('');
    const matches = source ? candidates(source, asset) : [];
    setAtlasId(matches.length === 1 ? String(matches[0].id) : '');
  };
  const cancel = async () => { request.current++; setScanning(false); await invoke('viewer_release'); };
  useEffect(() => {
    if (!isTauri()) return;
    const progress = listen<{ scanned: number }>('viewer-scan', event => setScanned(event.payload.scanned));
    const drop = getCurrentWindow().onDragDropEvent(event => { if (activeRef.current && event.payload.type === 'drop') void scan(event.payload.paths); });
    return () => { request.current++; progress.then(stop => stop()); drop.then(stop => stop()); void invoke('viewer_release'); };
  }, []);
  const skeletons = catalog?.assets.filter(item => item.kind === 'skeleton') ?? [];
  const problem = (asset: Asset) => asset.issue || (!supported.includes(family(asset.version)) ? 'viewer.unsupported' : candidates(catalog!, asset).length !== 1 ? 'match' : '');
  const visible = skeletons.filter(asset => asset.path.toLowerCase().includes(search.toLowerCase()) && (filter === 'all' || (filter === 'problems' ? !!problem(asset) : !problem(asset))));
  const atlas = catalog?.assets.find(asset => asset.kind === 'atlas' && String(asset.id) === atlasId);
  const issue = selected ? selected.issue || (!supported.includes(family(selected.version)) ? 'viewer.unsupported' : '') : '';
  return <section className="viewer-root">
    <div className="viewer-toolbar"><div className="viewer-root-path" title={catalog?.root}><FolderOpen size={17} /><span>{catalog?.root || t('title')}</span></div><div className="viewer-toolbar-actions"><button className="button secondary" onClick={() => void choose(true)}><FolderOpen size={15} />{t('folder')}</button><button className="button secondary" onClick={() => void choose(false)}><Files size={15} />{t('files')}</button>{paths.length > 0 && <button className="button secondary" disabled={scanning} onClick={() => void scan(paths)} aria-label={t('refresh')}><RefreshCw size={15} /></button>}</div></div>
    {error && <div className="notice" role="alert">{diagnostic(language, error)}</div>}
    {scanning ? <div className="viewer-empty"><LoaderCircle size={32} className="spin" /><h2>{t('scanning')} · {scanned}</h2><button className="button secondary" onClick={() => void cancel()}>{t('cancel')}</button></div> : !catalog ? <div className="viewer-empty"><div className="viewer-empty-icon"><Sparkles size={36} /></div><span className="eyebrow">SPINE LIBRARY</span><h2>{t('empty')}</h2><p>{t('hint')}</p><button className="button primary" onClick={() => void choose(true)}><FolderOpen size={17} />{t('folder')}</button><small>{t('support')}</small></div> : <div className={'viewer-workbench ' + (collapsed ? 'directory-collapsed' : '')}>
      <aside className="viewer-directory"><div className="viewer-panel-title"><strong>{t('collapse')}</strong><button aria-label={t('collapse')} onClick={() => setCollapsed(value => !value)}><PanelLeftClose size={16} /></button></div>{!collapsed && <><label className="viewer-search"><Search size={15} /><input aria-label={t('search')} value={search} onChange={event => setSearch(event.target.value)} placeholder={t('search')} /></label><select aria-label={t('all')} value={filter} onChange={event => setFilter(event.target.value)}>{['all', 'available', 'problems'].map(value => <option key={value} value={value}>{t(value)}</option>)}</select><ResourceTree assets={visible} selected={selected} onSelect={select} problem={problem} searching={!!search} /><div className="viewer-directory-footer">{skeletons.length} {t('count')} · {catalog.skipped} {t('skipped')}</div></>}</aside>
      <div className="viewer-content">{!selected ? <div className="viewer-empty"><Sparkles size={32} /><p>{t(skeletons.length ? 'select' : 'none')}</p></div> : <><div className="viewer-atlas-row"><label>{t('atlas')}<select value={atlasId} onChange={event => setAtlasId(event.target.value)}><option value="">{t('match')}</option>{catalog.assets.filter(asset => asset.kind === 'atlas').map(asset => <option key={asset.id} value={asset.id}>{asset.path}</option>)}</select></label></div>{issue ? <div className="viewer-empty"><p>{diagnostic(language, issue)}</p><code>{selected.path} · {selected.version}</code></div> : atlas ? <Stage catalog={catalog} asset={selected} atlas={atlas} language={language} active={active} /> : <div className="viewer-empty"><p>{t(catalog.assets.some(asset => asset.kind === 'atlas') ? 'match' : 'missingAtlas')}</p></div>}</>}</div>
    </div>}
  </section>;
}
