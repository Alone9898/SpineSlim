async (page) => {
  await page.route('http://127.0.0.1:1420/', async route => {
    await route.fulfill({
      contentType: 'text/html',
      headers: { 'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'" },
      body: '<!doctype html><html><body></body></html>',
    });
  });
  await page.route('http://127.0.0.1:1420/csp-probe.js', route => route.fulfill({
    contentType: 'text/javascript',
    body: "window.evalBlocked = false; try { new Function('return 1')(); } catch { window.evalBlocked = true; }",
  }));
  await page.goto('http://127.0.0.1:1420/');
  await page.addScriptTag({ url: '/csp-probe.js' });
  return await page.evaluate(async () => {
    const evalBlocked = window.evalBlocked;
    if (!evalBlocked) throw new Error('Test requires CSP to block unsafe-eval');
    const { create } = await import('/frontend/src/viewer/legacy.ts');
    const texture = document.createElement('canvas');
    texture.width = texture.height = 32;
    texture.getContext('2d').fillRect(0, 0, 32, 32);
    const bitmap = await createImageBitmap(texture);
    const atlas = 'test.png\nsize: 32,32\nformat: RGBA8888\nfilter: Linear,Linear\nrepeat: none\nbox\n  rotate: false\n  xy: 0,0\n  size: 32,32\n  orig: 32,32\n  offset: 0,0\n  index: -1\n';
    const results = [];
    try {
      for (const version of ['3.8', '4.0', '4.1']) {
        const data = {
          skeleton: { spine: version + '.99' }, bones: [{ name: 'root' }],
          slots: [{ name: 'slot', bone: 'root', attachment: 'box' }],
          skins: [{ name: 'default', attachments: { slot: { box: { type: 'region', width: 32, height: 32 } } } }],
          animations: { idle: {} },
        };
        const canvas = document.createElement('canvas');
        const renderer = await create(canvas, atlas, new Map([['test.png', bitmap]]), new TextEncoder().encode(JSON.stringify(data)), false, version);
        try {
          renderer.reset('idle', 'default', true);
          renderer.step(1 / 60);
          renderer.draw({ width: 128, height: 128, x: 0, y: 0, scale: 2, pma: null, bones: false });
          const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
          const pixel = new Uint8Array(4);
          gl.readPixels(64, 64, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
          if (!pixel[3]) throw new Error('Blank render: ' + version);
          results.push({ version, runtime: renderer.runtime, visible: true });
        } finally { renderer.dispose(); }
      }
    } finally { bitmap.close(); }
    return { evalBlocked, results };
  });
}
