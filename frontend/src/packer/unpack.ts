import { zipSync } from 'fflate';

export type AtlasEntry = {
  frame: { x: number; y: number; w: number; h: number };
  rotated: boolean;
  trimmed?: boolean;
  spriteSourceSize: { x: number; y: number; w: number; h: number };
  sourceSize: { w: number; h: number };
};
export type AtlasJson = { frames: Record<string, AtlasEntry>; meta: { image: string } };
export type Restored = { count: number; bytes: Uint8Array };

const surface = (width: number, height: number) => {
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  return canvas;
};
const validEntry = (entry: AtlasEntry) => {
  if (!entry?.frame || !entry.spriteSourceSize || !entry.sourceSize) return false;
  const { frame, spriteSourceSize: trim, sourceSize } = entry;
  const values = [frame.x, frame.y, frame.w, frame.h, trim.x, trim.y, trim.w, trim.h, sourceSize.w, sourceSize.h];
  return values.every(value => Number.isSafeInteger(value) && value >= 0) && frame.w > 0 && frame.h > 0 && trim.w > 0 && trim.h > 0 && sourceSize.w > 0 && sourceSize.h > 0;
};

export function parseAtlas(json: string): AtlasJson {
  let data: AtlasJson;
  try { data = JSON.parse(json); } catch { throw new Error('atlasJson'); }
  if (!data?.frames || typeof data.frames !== 'object' || typeof data.meta?.image !== 'string') throw new Error('atlasJson');
  return data;
}

export async function unpackAtlas(json: string, image: Blob): Promise<Restored> {
  const entries = Object.entries(parseAtlas(json).frames);
  if (!entries.length) throw new Error('atlasJson');
  if (entries.length > 500) throw new Error('limit');
  const atlas = await createImageBitmap(image);
  const sprites: Record<string, Uint8Array> = Object.create(null);
  try {
    if (atlas.width > 8192 || atlas.height > 8192 || atlas.width * atlas.height > 32 * 1024 * 1024) throw new Error('limit');
    for (const [key, entry] of entries) {
      const name = key.replace(/\\/g, '/');
      if (/[\r\n:]/.test(name) || name.split('/').includes('..') || name.startsWith('/')) throw new Error('invalidName');
      if (!validEntry(entry)) throw new Error('atlasJson');
      const { frame, rotated, spriteSourceSize: trim, sourceSize } = entry;
      if (sourceSize.w > 8192 || sourceSize.h > 8192) throw new Error('limit');
      // Rotated frames are stored with width and height swapped, turned 90 degrees clockwise.
      const width = rotated ? frame.h : frame.w;
      const height = rotated ? frame.w : frame.h;
      const sprite = surface(trim.w, trim.h);
      const spriteContext = sprite.getContext('2d')!;
      if (rotated) { spriteContext.translate(0, width); spriteContext.rotate(-Math.PI / 2); }
      spriteContext.drawImage(atlas, frame.x, frame.y, width, height, 0, 0, width, height);
      const full = surface(sourceSize.w, sourceSize.h);
      full.getContext('2d')!.drawImage(sprite, trim.x, trim.y);
      const blob = await new Promise<Blob>((resolve, reject) => full.toBlob(result => result ? resolve(result) : reject(new Error('write')), 'image/png'));
      sprites[name] = new Uint8Array(await blob.arrayBuffer());
      sprite.width = 0; sprite.height = 0; full.width = 0; full.height = 0;
    }
  } finally { atlas.close(); }
  return { count: entries.length, bytes: zipSync(sprites, { level: 0 }) };
}
