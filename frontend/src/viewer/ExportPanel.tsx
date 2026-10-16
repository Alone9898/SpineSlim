import { useEffect, useRef, useState } from 'react';
import { save, confirm } from '@tauri-apps/plugin-dialog';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Download, LoaderCircle, X } from 'lucide-react';
import { exportAnimation, type ExportOptions } from './export';
import { diagnostic, label } from './i18n';

type Props = { language: 'zh' | 'en'; enabled: boolean; options: () => Omit<ExportOptions, 'format' | 'fps' | 'size' | 'target' | 'transparent'>; assetKey: string };
export default function ExportPanel({ language, enabled, options, assetKey }: Props) {
  const [fps, setFps] = useState(30);
  const [size, setSize] = useState(720);
  const [transparent, setTransparent] = useState(true);
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState('');
  const [output, setOutput] = useState('');
  const [count, setCount] = useState({ done: 0, total: 0 });
  const control = useRef<AbortController | null>(null);
  const operation = useRef(0);
  const pending = useRef<Promise<string> | null>(null);
  const t = (key: string) => label(language, key);
  useEffect(() => {
    setRunning(false); setStatus(''); setOutput('');
    return () => { operation.current++; control.current?.abort(); };
  }, [assetKey]);
  useEffect(() => {
    if (!isTauri()) return;
    const subscription = getCurrentWindow().onCloseRequested(async event => {
      if (!control.current) return;
      event.preventDefault();
      if (await confirm(label(language, 'export.close'), { title: label(language, 'export.title'), kind: 'warning' })) {
        control.current.abort();
        await pending.current?.catch(() => {});
        control.current = null;
        await getCurrentWindow().close();
      }
    });
    return () => { subscription.then(stop => stop()); };
  }, [language]);
  const start = async (format: 'gif' | 'mp4') => {
    if (control.current && !control.current.signal.aborted) return;
    const token = ++operation.current;
    const snapshot = options();
    const controller = new AbortController(); control.current = controller;
    setRunning(true); setStatus('export.choose'); setOutput(''); setCount({ done: 0, total: 0 });
    try {
      const name = (snapshot.asset.path.split('/').pop()!.replace(/\.[^.]+$/, '') + '-' + (snapshot.animation || 'pose')).replace(/[<>:"/\\|?*\x00-\x1f]/g, '_');
      const path = await save({ defaultPath: `${name}.${format}`, filters: [{ name: format.toUpperCase(), extensions: [format] }] });
      if (!path || controller.signal.aborted) { if (token === operation.current) setStatus(''); return; }
      if (!path.toLowerCase().endsWith('.' + format)) throw new Error('export.extension');
      pending.current = exportAnimation({ ...snapshot, format, fps, size, target: path, transparent }, controller.signal, (phase, done, total) => {
        if (token === operation.current) { setStatus(phase); setCount({ done, total }); }
      });
      const result = await pending.current;
      if (token === operation.current) { setStatus('export.success'); setOutput(result); }
    } catch (reason) {
      if (token === operation.current) setStatus(controller.signal.aborted ? 'export.cancelled' : String(reason).replace(/^Error: /, ''));
    } finally { if (token === operation.current) { setRunning(false); control.current = null; pending.current = null; } }
  };
  return <section className="viewer-export"><div className="divider" /><strong>{t('export.title')}</strong><p className="hint">{t('export.hint')}</p><fieldset disabled={!enabled || running}>
    <div className="viewer-export-options"><label className="field"><span>{t('export.size')}</span><select value={size} onChange={event => setSize(Number(event.target.value))}>{[512, 720, 1080].map(value => <option key={value} value={value}>{value}px</option>)}</select></label><label className="field"><span>{t('export.fps')}</span><select value={fps} onChange={event => setFps(Number(event.target.value))}>{[15, 24, 30, 60].map(value => <option key={value} value={value}>{value}</option>)}</select></label></div>
    <label className="viewer-check"><input type="checkbox" checked={transparent} onChange={event => setTransparent(event.target.checked)} />{t('export.transparent')}</label>
    <div className="viewer-export-buttons"><button className="button secondary" onClick={() => void start('gif')}><Download size={13} />GIF</button><button className="button secondary" onClick={() => void start('mp4')}><Download size={13} />MP4</button></div>
  </fieldset>{status && <div className="viewer-export-status" role="status">{running && <LoaderCircle className="spin" size={13} />}<span>{diagnostic(language, status)}{running && count.total > 0 ? ` · ${count.done}/${count.total}` : ''}</span></div>}
    {running && <button className="button secondary full" onClick={() => control.current?.abort()}><X size={13} />{t('export.cancel')}</button>}
    {output && <><p className="viewer-export-path" title={output}>{output}</p><button className="button secondary full" onClick={() => void invoke('open_output', { path: output.replace(/[\\/][^\\/]+$/, '') }).catch(reason => setStatus(String(reason)))}>{t('export.open')}</button></>}
  </section>;
}
