async (page) => {
  await page.goto('http://127.0.0.1:1420');
  const files = await page.evaluate(async () => {
    const { decode, pack, defaults, metadata, archive, release } = await import('/frontend/src/packer/engine.ts');
    const { unzipSync, strFromU8 } = await import('/node_modules/.vite/deps/fflate.js');
    const { TextureAtlas } = await import('/node_modules/.vite/deps/@esotericsoftware_spine-webgl.js');
    const { BaseTexture, Spritesheet } = await import('/node_modules/.vite/deps/pixi__js.js');
    const sourceCanvas = document.createElement('canvas'); sourceCanvas.width = 80; sourceCanvas.height = 60;
    const context = sourceCanvas.getContext('2d'); context.fillStyle = '#f04f5f'; context.fillRect(7, 11, 30, 20);
    const blob = await new Promise(resolve => sourceCanvas.toBlob(resolve));
    const source = await decode(blob, 'folder/hero.png');
    const sheet = await pack([source], defaults, new AbortController().signal, () => {});
    try {
      const frame = sheet[0].frames[0];
      if (frame.left !== 7 || frame.top !== 11 || frame.width !== 30 || frame.height !== 20) throw new Error('Incorrect alpha crop');
      const data = metadata(sheet, 'test', 1);
      const json = JSON.parse(data.json['test-1.json']);
      const atlas = new TextureAtlas(data.atlas);
      const region = atlas.findRegion('folder/hero');
      if (!region || region.offsetX !== 7 || region.offsetY !== 29 || region.originalWidth !== 80 || region.originalHeight !== 60) throw new Error('Incorrect Spine offsets');
      const pixi = new Spritesheet(BaseTexture.from(sheet[0].canvas), json);
      await pixi.parse();
      const texture = pixi.textures['folder/hero.png'];
      if (texture.orig.width !== 80 || texture.orig.height !== 60 || texture.trim.x !== 7 || texture.trim.y !== 11) throw new Error('Incorrect Pixi trim');
      pixi.destroy(true);
      const zip = unzipSync(await archive(sheet, 'test', 1, 'both'));
      if (!zip['test-1.png'] || !zip['test-1.json'] || !zip['test.atlas'] || JSON.parse(strFromU8(zip['test-1.json'])).frames['folder/hero.png'].rotated) throw new Error('Invalid ZIP');
      const pixel = sheet[0].canvas.getContext('2d').getImageData(frame.x - 1, frame.y, 1, 1).data;
      if (pixel[3] !== 255) throw new Error('Missing extrusion');
    } finally { release(sheet); }
    const sources = Array.from({ length: 5 }, (_, index) => ({ ...source, id: String(index), name: `sprite-${index}.png` }));
    const packed = await pack(sources, { ...defaults, width: 64, height: 64, trim: true }, new AbortController().signal, () => {});
    if (packed.length < 2 || packed.flatMap(sheet => sheet.frames).length !== 5) throw new Error('Expected multiple pages');
    for (const sheet of packed) for (const frame of sheet.frames) {
      if (frame.x + frame.width > sheet.canvas.width || frame.y + frame.height > sheet.canvas.height) throw new Error('Frame outside page');
      for (const other of sheet.frames) if (frame !== other && frame.x < other.x + other.width && frame.x + frame.width > other.x && frame.y < other.y + other.height && frame.y + frame.height > other.y) throw new Error('Overlapping frames');
    }
    release(packed);
    let rejected = false;
    try { await pack(sources, { ...defaults, width: 64, height: 64, multipage: false }, new AbortController().signal, () => {}); } catch (error) { rejected = String(error).includes('multiple'); }
    if (!rejected) throw new Error('Single-page limit ignored');
    source.image.close();
    const files = [];
    for (let index = 0; index < 15; index++) {
      const canvas = document.createElement('canvas'); canvas.width = index === 0 ? 480 : 100 + index * 12; canvas.height = index === 0 ? 620 : 50 + index * 5;
      const draw = canvas.getContext('2d'); draw.fillStyle = ['#3572ea', '#42caa0', '#ffb85c', '#b397e8'][index % 4];
      draw.beginPath(); draw.roundRect(8, 10, canvas.width - 16, canvas.height - 20, 16); draw.fill();
      draw.fillStyle = '#ffffff'; draw.font = 'bold 22px sans-serif'; draw.fillText(`SPRITE ${index + 1}`, 18, 38);
      files.push({ name: `sprite-${String(index + 1).padStart(2, '0')}.png`, bytes: Array.from(new Uint8Array(await (await new Promise(resolve => canvas.toBlob(resolve))).arrayBuffer())) });
    }
    return files;
  });
  await page.getByRole('button', { name: '图集打包', exact: true }).click();
  await page.locator('.packer-root input[type=file]').first().setInputFiles(files.map(file => ({ name: file.name, mimeType: 'image/png', buffer: Buffer.from(file.bytes) })));
  await page.getByRole('button', { name: '导出 ZIP', exact: true }).waitFor();
  await page.waitForFunction(() => !document.querySelector('.packer-busy') && document.querySelectorAll('.packer-frame').length === 15);
  await page.setViewportSize({ width: 1500, height: 950 });
  await page.getByRole('button', { name: '适应画布', exact: true }).click();
  await page.screenshot({ path: 'output/playwright/packer-zh.png' });
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出 ZIP', exact: true }).click();
  const download = await downloadPromise;
  await download.saveAs('output/packer-smoke.zip');
  await page.getByRole('combobox', { name: '界面语言', exact: true }).selectOption('en');
  await page.getByRole('button', { name: 'Export ZIP', exact: true }).waitFor();
  await page.screenshot({ path: 'output/playwright/packer-en.png' });
  await page.setViewportSize({ width: 960, height: 720 });
  if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error('Horizontal viewport overflow');
  await page.screenshot({ path: 'output/playwright/packer-narrow.png' });
}
