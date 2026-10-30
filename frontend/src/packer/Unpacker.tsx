import { useEffect, useRef, useState } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { open, save } from '@tauri-apps/plugin-dialog';
import { Download, FileImage, LoaderCircle, X } from 'lucide-react';
import { diagnostic, label } from './i18n';
import { parseAtlas, unpackAtlas, type Restored } from './unpack';

type Props = { language: 'zh' | 'en' };
type Picked = { name: string; read: () => Promise<Blob> };
type Result = Restored & { name: string };
const baseName = (path: string) => path.replace(/\\/g, '/').split('/').pop() ?? path;

export default function Unpacker({ language }: Props) {
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const working = useRef(false);
  const t = (key: string) => label(language, key);
  const pickedFrom = (paths: string[]): Picked[] => paths.map(path => ({ name: path, read: async () => {
    const bytes = await invoke<ArrayBuffer | number[]>('packer_read_file', { path });
    return new Blob([new Uint8Array(bytes)]);
  } }));

  const restore = async (items: Picked[]) => {
    if (working.current) return;
    working.current = true;
    setBusy('unpacking'); setError(''); setSaved(''); setResult(null);
    try {
      const json = items.find(item => /\.json$/i.test(item.name));
      if (!json) throw new Error('atlasJson');
      const text = await (await json.read()).text();
      const image = items.find(item => baseName(item.name) === parseAtlas(text).meta.image);
      if (!image) throw new Error('atlasMissing');
      const restored = await unpackAtlas(text, await image.read());
      setResult({ ...restored, name: baseName(json.name).replace(/\.json$/i, '') });
    } catch (reason) { setError(String(reason)); }
    finally { working.current = false; setBusy(''); }
  };
  const choose = async () => {
    if (!isTauri()) { fileInput.current?.click(); return; }
    try {
      const paths = await open({ multiple: true, filters: [{ name: 'Atlas', extensions: ['json', 'png'] }] });
      if (paths) await restore(pickedFrom(Array.isArray(paths) ? paths : [paths]));
    } catch (reason) { setError(String(reason)); }
  };
  useEffect(() => {
    if (!isTauri()) return;
    const subscription = getCurrentWindow().onDragDropEvent(event => {
      if (event.payload.type !== 'drop') return;
      const paths = event.payload.paths.filter(path => /\.(json|png)$/i.test(path));
      if (paths.length) void restore(pickedFrom(paths));
    });
    return () => { subscription.then(stop => stop()); };
  }, []);
  const exportZip = async () => {
    if (!result || busy) return;
    setBusy('exporting'); setError(''); setSaved('');
    try {
      const path = isTauri() ? await save({ defaultPath: `${result.name}-sprites.zip`, filters: [{ name: 'ZIP', extensions: ['zip'] }] }) : null;
      if (isTauri() && !path) return;
      if (path) { await invoke('packer_save', { target: path, bytes: Array.from(result.bytes) }); setSaved(path); }
      else {
        const url = URL.createObjectURL(new Blob([result.bytes as BlobPart], { type: 'application/zip' }));
        const link = document.createElement('a'); link.href = url; link.download = `${result.name}-sprites.zip`; link.click();
        setTimeout(() => URL.revokeObjectURL(url), 10000); setSaved('download');
      }
    } catch (reason) { setError(String(reason)); }
    finally { setBusy(''); }
  };

  return <>
    {error && <div className="notice" role="alert"><span>{diagnostic(language, error)}</span><button onClick={() => setError('')} aria-label={t('remove')}><X size={15} /></button></div>}
    {saved && <div className="packer-saved" role="status">{saved === 'download' ? t('download') : `${t('saved')}：${saved}`}</div>}
    <section className="packer-empty" onDragOver={event => event.preventDefault()} onDrop={event => {
      event.preventDefault();
      if (!isTauri()) void restore(Array.from(event.dataTransfer.files).filter(file => /\.(json|png)$/i.test(file.name)).map(file => ({ name: file.name, read: async () => file })));
    }}>
      <div className="packer-empty-icon"><FileImage size={38} /></div>
      <h2>{t('unpackTitle')}</h2>
      <p>{t('unpackHint')}</p>
      <div className="packer-import-actions"><button className="button primary" disabled={!!busy} onClick={() => void choose()}><FileImage size={15} />{t('chooseAtlas')}</button></div>
      {busy && <span role="status"><LoaderCircle className="spin" size={16} /> {t(busy)}</span>}
      {result && <div className="packer-unpack-result" role="status"><span>{result.count} {t('image')} · {t('unpacked')}</span><button className="button primary" disabled={!!busy} onClick={() => void exportZip()}><Download size={16} />{t('exportSprites')}</button></div>}
      <input hidden ref={fileInput} type="file" accept=".json,image/png" multiple onChange={event => { void restore(Array.from(event.target.files ?? []).map(file => ({ name: file.name, read: async () => file }))); event.target.value = ''; }} />
    </section>
  </>;
}
