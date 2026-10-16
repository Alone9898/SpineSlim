import { invoke } from '@tauri-apps/api/core';

export type Asset = { id: number; path: string; kind: string; version: string; issue: string; bytes: number };
export type Catalog = { session: number; root: string; assets: Asset[]; skipped: number };
export const supported = ['3.8', '4.0', '4.1', '4.2'];
export const family = (version: string) => version.split('.').slice(0, 2).join('.');
export const directory = (path: string) => path.slice(0, path.lastIndexOf('/') + 1);
export const stem = (path: string) => path.replace(/\.[^.]+$/, '');
export function candidates(catalog: Catalog, asset: Asset) {
  const atlases = catalog.assets.filter(item => item.kind === 'atlas');
  const exact = atlases.filter(item => stem(item.path) === stem(asset.path));
  return exact.length ? exact : atlases.filter(item => directory(item.path) === directory(asset.path));
}
export function resolvePage(atlas: string, page: string) {
  if (/^(?:[/\\]|[a-z]+:)/i.test(page)) throw new Error('viewer.link');
  const parts = directory(atlas).split('/').filter(Boolean);
  for (const part of page.replace(/\\/g, '/').split('/')) {
    if (part === '..') { if (!parts.length) throw new Error('viewer.link'); parts.pop(); }
    else if (part && part !== '.') parts.push(part);
  }
  return parts.join('/');
}
export async function read(catalog: Catalog, asset: Asset): Promise<Uint8Array> {
  const result = await invoke<ArrayBuffer | number[]>('viewer_read', { session: catalog.session, id: asset.id });
  return new Uint8Array(result);
}
export type Bounds = { x: number; y: number; width: number; height: number };
export type View = { width: number; height: number; scale: number; x: number; y: number; bones: boolean; pma: boolean | null };
export type Renderer = {
  animations: { name: string; duration: number }[]; skins: string[]; runtime: string;
  reset(animation: string, skin: string, loop: boolean): void;
  step(delta: number): void; bounds(): Bounds; draw(view: View): void; dispose(): void;
};
export type Loaded = { renderer: Renderer; pages: { name: string; width: number; height: number; pma: boolean }[] };

export async function loadRenderer(canvas: HTMLCanvasElement, catalog: Catalog, asset: Asset, atlasAsset: Asset, signal: AbortSignal): Promise<Loaded> {
  const runtime = family(asset.version);
  if (!supported.includes(runtime)) throw new Error('viewer.unsupported');
  const { TextureAtlas } = await import('@esotericsoftware/spine-webgl');
  const atlasText = new TextDecoder().decode(await read(catalog, atlasAsset));
  const atlas = new TextureAtlas(atlasText);
  if (!atlas.pages.length) throw new Error('viewer.atlas');
  const images = new Map<string, ImageBitmap>();
  let renderer: Renderer | undefined;
  try {
    let pixels = 0;
    for (const page of atlas.pages) {
      signal.throwIfAborted();
      const path = resolvePage(atlasAsset.path, page.name);
      const texture = catalog.assets.find(item => item.path === path && item.kind === 'texture');
      if (!texture) throw new Error(`viewer.missing|${path}`);
      if (!/\.(png|jpe?g|webp)$/i.test(path)) throw new Error(`viewer.texture|${path}`);
      const bytes = await read(catalog, texture);
      const bitmap = await createImageBitmap(new Blob([bytes as BlobPart]), { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
      images.set(page.name, bitmap);
      pixels += bitmap.width * bitmap.height;
      if (bitmap.width > 8192 || bitmap.height > 8192 || pixels > 64 * 1024 * 1024) throw new Error('viewer.large');
    }
    const data = await read(catalog, asset);
    signal.throwIfAborted();
    const binary = /\.skel$/i.test(asset.path);
    const adapter = runtime === '4.2' ? await import('./modern') : await import('./legacy');
    signal.throwIfAborted();
    renderer = await adapter.create(canvas, atlasText, images, data, binary, runtime);
    signal.throwIfAborted();
    const originalDispose = renderer.dispose;
    renderer.dispose = () => { originalDispose(); images.forEach(image => image.close()); };
    return { renderer, pages: atlas.pages.map(page => ({ name: page.name, width: images.get(page.name)!.width, height: images.get(page.name)!.height, pma: page.pma })) };
  } catch (error) {
    renderer?.dispose(); images.forEach(image => image.close()); throw error;
  }
}
