async (page) => {
  await page.goto('http://127.0.0.1:1420');
  const image = await page.evaluate(async () => {
    const { decode, pack, defaults, archive, release } = await import('/frontend/src/packer/engine.ts');
    const { packingOptions } = await import('/frontend/src/packer/exporters.ts');
    const { unzipSync, zipSync } = await import('/node_modules/.vite/deps/fflate.js');
    const canvas = document.createElement('canvas'); canvas.width = 80; canvas.height = 60;
    const context = canvas.getContext('2d'); context.fillStyle = '#fe3366'; context.fillRect(7, 11, 30, 20);
    const blob = await new Promise(resolve => canvas.toBlob(resolve));
    const source = await decode(blob, 'folder/hero&one.png');
    const sources = Array.from({ length: 5 }, (_, index) => ({ ...source, id: String(index), name: `folder/hero&${index}.png` }));
    const all = {};
    for (const format of ['both', 'pixi', 'spine', 'cocos', 'godot', 'unity', 'phaser']) {
      const options = packingOptions({ ...defaults, width: 64, height: 64, scale: format === 'unity' ? .5 : 1 }, format);
      const sheets = await pack(sources, options, new AbortController().signal, () => {});
      try {
        const zip = unzipSync(await archive(sheets, 'sample', options.scale, format));
        for (const [name, bytes] of Object.entries(zip)) all[`${format}/${name}`] = bytes;
        if (format !== 'unity') {
          let rejected = false;
          try { await archive(sheets, 'bad-unity', 1, 'unity'); } catch (error) { rejected = String(error).includes('unityTrim'); }
          if (!rejected) throw new Error('Unity accepted cropped input');
        }
      } finally { release(sheets); }
    }
    source.image.close();
    window.formatsZip = zipSync(all, { level: 0 });
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  });
  const downloadPromise = page.waitForEvent('download');
  await page.evaluate(() => {
    const url = URL.createObjectURL(new Blob([window.formatsZip], { type: 'application/zip' }));
    const link = document.createElement('a'); link.href = url; link.download = 'packer-formats.zip'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  });
  await (await downloadPromise).saveAs('output/packer-formats.zip');
  await page.getByRole('button', { name: '图集工具', exact: true }).click();
  await page.locator('.packer-root input[type=file]').first().setInputFiles({ name: 'hero.png', mimeType: 'image/png', buffer: Buffer.from(image) });
  const selector = page.getByRole('combobox', { name: '元数据格式', exact: true });
  for (const format of ['cocos', 'unity', 'godot', 'phaser', 'pixi', 'spine', 'both']) {
    await selector.selectOption(format);
    await page.waitForFunction(() => !document.querySelector('.packer-busy') && document.querySelectorAll('.packer-frame').length === 1);
    const trim = page.getByLabel('裁剪透明边缘', { exact: true });
    if (await trim.isDisabled() !== (format === 'unity')) throw new Error('Unity trim control mismatch');
    if (format === 'unity' && await trim.isChecked()) throw new Error('Unity trim is enabled');
    if (format !== 'unity' && !await trim.isChecked()) throw new Error('Trim preference was lost');
  }
  await selector.selectOption('cocos');
  await page.getByRole('combobox', { name: '界面语言', exact: true }).selectOption('en');
  if ((await page.getByRole('combobox', { name: 'Metadata format', exact: true }).locator('option').allTextContents()).length !== 7) throw new Error('Missing export options');
  await page.setViewportSize({ width: 1200, height: 860 });
  await page.locator('.packer-settings-scroll').evaluate(element => { element.scrollTop = element.scrollHeight; });
  await page.screenshot({ path: 'output/playwright/packer-formats.png' });
}
