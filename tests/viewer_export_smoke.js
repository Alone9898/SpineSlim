async (page) => {
  await page.evaluate(async () => {
    const { invoke } = await import('/node_modules/@tauri-apps/api/core.js');
    const { loadRenderer, candidates } = await import('/frontend/src/viewer/model.ts');
    const { exportAnimation } = await import('/frontend/src/viewer/export.ts');
    const root = await invoke('app_directory');
    const catalog = await invoke('viewer_scan', { paths: [root + '/../../../output/viewer-fixtures'] });
    const asset = catalog.assets.find(asset => asset.path === '4.2/spineboy-pro.json');
    const atlas = candidates(catalog, asset)[0];
    const canvas = document.createElement('canvas');
    const { renderer } = await loadRenderer(canvas, catalog, asset, atlas, new AbortController().signal);
    renderer.reset('walk', 'default', true);
    const bounds = renderer.bounds();
    renderer.dispose();
    const options = { catalog, asset, atlas, animation: 'walk', skin: 'default', duration: 1, speed: 1,
      view: { width: 512, height: 512, x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2, scale: Math.min(400 / bounds.width, 400 / bounds.height), pma: null, bones: false },
      background: '#30343b', transparent: true, fps: 15, size: 512 };
    for (const format of ['gif', 'mp4']) {
      await exportAnimation({ ...options, format, target: root + '/../../../output/viewer-test.' + format }, new AbortController().signal, () => {});
    }
    const controller = new AbortController();
    let cancelled = false;
    try {
      await exportAnimation({ ...options, format: 'mp4', target: root + '/../../../output/viewer-cancel.mp4' }, controller.signal, (phase, done) => { if (done >= 2) controller.abort(); });
    } catch { cancelled = true; }
    if (!cancelled) throw new Error('Cancellation failed');
    const controllerEncoding = new AbortController();
    let encodingCancelled = false;
    try {
      await exportAnimation({ ...options, format: 'mp4', target: root + '/../../../output/viewer-cancel-encoding.mp4' }, controllerEncoding.signal, phase => { if (phase === 'export.encoding') controllerEncoding.abort(); });
    } catch { encodingCancelled = true; }
    if (!encodingCancelled) throw new Error('Encoding cancellation failed');
    const job = await invoke('viewer_export_begin', { target: root + '/../../../output/viewer-failure.mp4', format: 'mp4', fps: 15, frames: 1 });
    await invoke('viewer_export_frame', { id: job.id, index: 0, bytes: [137, 80, 78, 71, 13, 10, 26, 10] });
    let failed = false;
    try { await invoke('viewer_export_finish', { id: job.id }); } catch { failed = true; }
    if (!failed) throw new Error('Invalid PNG incorrectly encoded');
  });
}
