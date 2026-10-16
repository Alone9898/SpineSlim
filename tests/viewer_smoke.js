async (page) => {
  await page.evaluate(async () => {
    const { invoke } = await import('/node_modules/@tauri-apps/api/core.js');
    const { loadRenderer, candidates, resolvePage } = await import('/frontend/src/viewer/model.ts');
    for (const reference of ['../../outside.png', 'https://example.com/image.png', 'C:/outside.png', '/outside.png']) {
      let rejected = false;
      try { resolvePage('folder/test.atlas', reference); } catch { rejected = true; }
      if (!rejected) throw new Error('Unscoped page accepted: ' + reference);
    }
    const root = await invoke('app_directory');
    const catalog = await invoke('viewer_scan', { paths: [root + '/../../../output/viewer-fixtures'] });
    const results = [];
    for (const asset of catalog.assets.filter(asset => asset.kind === 'skeleton')) {
      const canvas = document.createElement('canvas');
      let renderer;
      try {
        const loaded = await loadRenderer(canvas, catalog, asset, candidates(catalog, asset)[0], new AbortController().signal);
        renderer = loaded.renderer;
        renderer.reset('walk', 'default', true);
        for (let frame = 0; frame < 30; frame++) renderer.step(1 / 60);
        const bounds = renderer.bounds();
        if (![bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite) || bounds.width <= 0) throw new Error('Invalid bounds');
        renderer.draw({ width: 512, height: 512, x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2, scale: Math.min(400 / bounds.width, 400 / bounds.height), pma: null, bones: false });
        const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
        const pixels = new Uint8Array(canvas.width * canvas.height * 4);
        gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        let visible = 0;
        for (let offset = 3; offset < pixels.length; offset += 4) if (pixels[offset] > 0) visible++;
        if (visible < 100) throw new Error('Blank render: ' + visible);
        renderer.reset('walk', 'default', true);
        for (let frame = 0; frame < 30; frame++) renderer.step(1 / 60);
        const replay = renderer.bounds();
        for (const key of ['x', 'y', 'width', 'height']) if (Math.abs(bounds[key] - replay[key]) > .01) throw new Error('Replay differs at ' + key);
        results.push({ asset: asset.path, version: asset.version, runtime: renderer.runtime, visible });
      } catch (error) { throw new Error(asset.path + ': ' + String(error)); }
      finally { renderer?.dispose(); canvas.remove(); }
    }
    if (results.length !== 8) throw new Error('Expected eight fixtures');
    await invoke('viewer_release');
    let rejected = false;
    try { await invoke('viewer_read', { session: catalog.session, id: catalog.assets[0].id }); } catch { rejected = true; }
    if (!rejected) throw new Error('Expired session accepted');
    window.__viewerTestResults = results;
  });
}
