import { invoke } from '@tauri-apps/api/core';
import { loadRenderer, type Asset, type Catalog, type Renderer, type View } from './model';

export type ExportOptions = {
  catalog: Catalog; asset: Asset; atlas: Asset; animation: string; skin: string; duration: number; speed: number;
  view: View; background: string; transparent: boolean; format: 'gif' | 'mp4'; fps: number; size: number; target: string;
};
export async function exportAnimation(options: ExportOptions, signal: AbortSignal, progress: (phase: string, done: number, total: number) => void) {
  const seconds = options.duration > 0 ? options.duration / options.speed : 1;
  if (!Number.isFinite(seconds) || seconds > 30 || seconds <= 0 || ![512, 720, 1080].includes(options.size) || ![15, 24, 30, 60].includes(options.fps)) throw new Error('export.limit');
  const frames = Math.max(1, Math.ceil(seconds * options.fps));
  const aspect = options.view.width / options.view.height;
  const width = Math.max(2, Math.round((aspect >= 1 ? options.size : options.size * aspect) / 2) * 2);
  const height = Math.max(2, Math.round((aspect >= 1 ? options.size / aspect : options.size) / 2) * 2);
  const source = document.createElement('canvas');
  const composite = document.createElement('canvas'); composite.width = width; composite.height = height;
  const context = composite.getContext('2d');
  if (!context) throw new Error('export.failed');
  let id: number | undefined; let renderer: Renderer | undefined;
  const cancel = () => { if (id !== undefined) void invoke('viewer_export_cancel', { id }).catch(() => {}); };
  signal.addEventListener('abort', cancel);
  try {
    signal.throwIfAborted();
    progress('export.loading', 0, frames);
    id = (await invoke<{ id: number }>('viewer_export_begin', { target: options.target, format: options.format, fps: options.fps, frames })).id;
    signal.throwIfAborted();
    renderer = (await loadRenderer(source, options.catalog, options.asset, options.atlas, signal)).renderer;
    renderer.reset(options.animation, options.skin, false);
    const view = { ...options.view, width, height, scale: options.view.scale * width / options.view.width, bones: false };
    const bounds = renderer.bounds();
    if ([bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite) && bounds.width > 0 && bounds.height > 0) {
      view.x = bounds.x + bounds.width / 2;
      view.y = bounds.y + bounds.height / 2;
      view.scale = Math.max(.001, Math.min(100, Math.min(width / bounds.width, height / bounds.height) * .8));
    }
    for (let index = 0; index < frames; index++) {
      signal.throwIfAborted();
      if (index > 0 && options.duration > 0) {
        let remaining = options.speed / options.fps;
        while (remaining > 1e-8) { const delta = Math.min(1 / 60, remaining); renderer.step(delta); remaining -= delta; }
      }
      renderer.draw(view);
      context.clearRect(0, 0, width, height);
      if (options.format === 'mp4' || !options.transparent) { context.fillStyle = options.background; context.fillRect(0, 0, width, height); }
      context.drawImage(source, 0, 0, width, height);
      const blob = await new Promise<Blob>((resolve, reject) => composite.toBlob(value => value ? resolve(value) : reject(new Error('export.failed')), 'image/png'));
      signal.throwIfAborted();
      await invoke('viewer_export_frame', { id, index, bytes: Array.from(new Uint8Array(await blob.arrayBuffer())) });
      progress('export.rendering', index + 1, frames);
    }
    signal.throwIfAborted(); progress('export.encoding', frames, frames);
    return await invoke<string>('viewer_export_finish', { id });
  } finally {
    signal.removeEventListener('abort', cancel);
    if (id !== undefined) await invoke('viewer_export_cancel', { id }).catch(() => {});
    renderer?.dispose(); source.remove(); composite.remove();
  }
}
