import { MaxRectsPacker } from 'maxrects-packer';
import { strToU8, zipSync } from 'fflate';
import { engineMetadata, exportFormats, type ExportFormat } from './exporters';

export type Source = { id: string; name: string; bytes: number; image: ImageBitmap; thumbnail: string };
export type Options = { width: number; height: number; pot: boolean; fixed: boolean; trim: boolean; threshold: number; padding: number; extrude: number; scale: number; multipage: boolean };
export const defaults: Options = { width: 2048, height: 2048, pot: true, fixed: false, trim: true, threshold: 1, padding: 2, extrude: 1, scale: 1, multipage: true };
export type Frame = { id: string; name: string; x: number; y: number; width: number; height: number; left: number; top: number; sourceWidth: number; sourceHeight: number };
export type Sheet = { canvas: HTMLCanvasElement; frames: Frame[]; occupancy: number };
const nextFrame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
const surface = (width: number, height: number) => {
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  return canvas;
};
export function release(sheets: Sheet[]) { sheets.forEach(sheet => { sheet.canvas.width = 0; sheet.canvas.height = 0; }); }
export async function decode(blob: Blob, name: string): Promise<Source> {
  const image = await createImageBitmap(blob);
  if (image.width > 8192 || image.height > 8192 || image.width * image.height > 32 * 1024 * 1024) { image.close(); throw new Error('limit'); }
  const thumbnail = surface(48, 48);
  const scale = Math.min(48 / image.width, 48 / image.height);
  thumbnail.getContext('2d')!.drawImage(image, (48 - image.width * scale) / 2, (48 - image.height * scale) / 2, image.width * scale, image.height * scale);
  const url = thumbnail.toDataURL(); thumbnail.width = 0;
  return { id: crypto.randomUUID(), name: name.replace(/\\/g, '/'), bytes: blob.size, image, thumbnail: url };
}
export async function pack(sources: Source[], options: Options, signal: AbortSignal, progress: (count: number) => void): Promise<Sheet[]> {
  const { width, height, padding, extrude, scale, threshold } = options;
  if (![width, height].every(value => Number.isInteger(value) && value >= 64 && value <= 8192) ||
      ![padding, extrude].every(value => Number.isInteger(value) && value >= 0 && value <= 32) ||
      !Number.isInteger(threshold) || threshold < 0 || threshold > 255 || !Number.isFinite(scale) || scale < .1 || scale > 2) throw new Error('invalidOptions');
  const maxWidth = options.pot ? 2 ** Math.floor(Math.log2(width)) : width;
  const maxHeight = options.pot ? 2 ** Math.floor(Math.log2(height)) : height;
  const packer = new MaxRectsPacker(maxWidth, maxHeight, padding, { smart: !options.fixed, pot: options.pot, square: false, allowRotation: false, border: padding });
  const prepared: { canvas: HTMLCanvasElement; frame: Frame }[] = [];
  const sheets: Sheet[] = [];
  try {
    let pixels = 0;
    for (const source of sources) {
      signal.throwIfAborted();
      const sourceWidth = Math.max(1, Math.round(source.image.width * scale));
      const sourceHeight = Math.max(1, Math.round(source.image.height * scale));
      pixels += sourceWidth * sourceHeight;
      if (pixels > 32 * 1024 * 1024) throw new Error('limit');
      const canvas = surface(sourceWidth, sourceHeight);
      const frame: Frame = { id: source.id, name: source.name, x: 0, y: 0, width: sourceWidth, height: sourceHeight, left: 0, top: 0, sourceWidth, sourceHeight };
      prepared.push({ canvas, frame });
      const context = canvas.getContext('2d', { willReadFrequently: options.trim })!;
      context.drawImage(source.image, 0, 0, sourceWidth, sourceHeight);
      if (options.trim) {
        const data = context.getImageData(0, 0, sourceWidth, sourceHeight).data;
        let left = sourceWidth, top = sourceHeight, right = -1, bottom = -1;
        for (let row = 0; row < sourceHeight; row++) for (let column = 0; column < sourceWidth; column++) {
          if (data[(row * sourceWidth + column) * 4 + 3] > 0 && data[(row * sourceWidth + column) * 4 + 3] >= threshold) {
            left = Math.min(left, column); right = Math.max(right, column); top = Math.min(top, row); bottom = Math.max(bottom, row);
          }
        }
        Object.assign(frame, right < 0 ? { left: 0, top: 0, width: 1, height: 1 } : { left, top, width: right - left + 1, height: bottom - top + 1 });
        if (right < 0) context.clearRect(0, 0, sourceWidth, sourceHeight);
      }
      if (frame.width + extrude * 2 + padding * 2 > maxWidth || frame.height + extrude * 2 + padding * 2 > maxHeight) throw new Error(`oversize|${source.name}`);
      progress(prepared.length); await nextFrame();
    }
    packer.addArray(prepared.map(item => ({ width: item.frame.width + extrude * 2, height: item.frame.height + extrude * 2, x: 0, y: 0, data: item })));
    if (!options.multipage && packer.bins.length > 1) throw new Error('multiple');
    if (packer.bins.length > 16 || packer.bins.reduce((sum, bin) => sum + bin.width * bin.height, 0) > 64 * 1024 * 1024) throw new Error('limit');
    for (const bin of packer.bins) {
      signal.throwIfAborted();
      const canvas = surface(bin.width, bin.height);
      const context = canvas.getContext('2d')!;
      const frames: Frame[] = [];
      sheets.push({ canvas, frames, occupancy: 0 });
      for (const rect of bin.rects) {
        const { canvas: original, frame } = rect.data as typeof prepared[number];
        frame.x = rect.x + extrude; frame.y = rect.y + extrude;
        context.drawImage(original, frame.left, frame.top, frame.width, frame.height, frame.x, frame.y, frame.width, frame.height);
        if (extrude) {
          for (const horizontal of [-1, 0, 1]) for (const vertical of [-1, 0, 1]) {
            if (!horizontal && !vertical) continue;
            const cropWidth = horizontal ? 1 : frame.width, cropHeight = vertical ? 1 : frame.height;
            context.drawImage(original, frame.left + (horizontal > 0 ? frame.width - 1 : 0), frame.top + (vertical > 0 ? frame.height - 1 : 0), cropWidth, cropHeight,
              frame.x + (horizontal < 0 ? -extrude : horizontal > 0 ? frame.width : 0), frame.y + (vertical < 0 ? -extrude : vertical > 0 ? frame.height : 0),
              horizontal ? extrude : frame.width, vertical ? extrude : frame.height);
          }
        }
        frames.push({ ...frame });
      }
      sheets[sheets.length - 1].occupancy = frames.reduce((sum, frame) => sum + frame.width * frame.height, 0) / (canvas.width * canvas.height);
      await nextFrame();
    }
    return sheets;
  } catch (error) { release(sheets); throw error; }
  finally { prepared.forEach(item => { item.canvas.width = 0; item.canvas.height = 0; }); }
}
export function metadata(sheets: Sheet[], name: string, scale: number) {
  const json: Record<string, string> = {};
  const atlas: string[] = [];
  sheets.forEach((sheet, index) => {
    const pageName = `${name}-${index + 1}`;
    const frames: Record<string, unknown> = Object.create(null);
    const lines = [`${pageName}.png`, `size: ${sheet.canvas.width},${sheet.canvas.height}`, 'format: RGBA8888', 'filter: Linear,Linear', 'repeat: none'];
    sheet.frames.forEach(frame => {
      frames[frame.name] = { frame: { x: frame.x, y: frame.y, w: frame.width, h: frame.height }, rotated: false,
        trimmed: frame.width !== frame.sourceWidth || frame.height !== frame.sourceHeight,
        spriteSourceSize: { x: frame.left, y: frame.top, w: frame.width, h: frame.height }, sourceSize: { w: frame.sourceWidth, h: frame.sourceHeight } };
      lines.push(frame.name.replace(/\.[^/.]+$/, ''), '  rotate: false', `  xy: ${frame.x}, ${frame.y}`, `  size: ${frame.width}, ${frame.height}`,
        `  orig: ${frame.sourceWidth}, ${frame.sourceHeight}`, `  offset: ${frame.left}, ${frame.sourceHeight - frame.top - frame.height}`, '  index: -1');
    });
    json[`${pageName}.json`] = JSON.stringify({ frames, meta: { app: 'SpineSlim', version: '1.0', image: `${pageName}.png`, format: 'RGBA8888', size: { w: sheet.canvas.width, h: sheet.canvas.height }, scale: String(scale), related_multi_packs: sheets.map((_, other) => `${name}-${other + 1}.json`).filter(file => file !== `${pageName}.json`) } }, null, 2);
    atlas.push(lines.join('\n'));
  });
  return { json, atlas: atlas.join('\n\n') + '\n' };
}
export async function archive(sheets: Sheet[], name: string, scale: number, format: ExportFormat) {
  if (!exportFormats.includes(format)) throw new Error('invalidOptions');
  const output: Record<string, Uint8Array> = Object.create(null);
  for (const [index, sheet] of sheets.entries()) {
    const blob = await new Promise<Blob>((resolve, reject) => sheet.canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('write')), 'image/png'));
    output[`${name}-${index + 1}.png`] = new Uint8Array(await blob.arrayBuffer());
  }
  const data = metadata(sheets, name, scale);
  if (format === 'both' || format === 'pixi') Object.entries(data.json).forEach(([file, text]) => { output[file] = strToU8(text); });
  if (format === 'both' || format === 'spine') output[`${name}.atlas`] = strToU8(data.atlas);
  Object.entries(engineMetadata(sheets, name, scale, format)).forEach(([file, text]) => { output[file] = strToU8(text); });
  return zipSync(output, { level: 0 });
}
