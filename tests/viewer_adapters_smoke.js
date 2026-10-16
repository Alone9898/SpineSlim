async (page) => {
  await page.goto('http://127.0.0.1:1420');
  await page.evaluate(async () => {
    const results = [];
    const cases = ['3.8', '4.0', '4.1', '4.2'].flatMap(version => ['json', 'skel'].map(extension => ({
      version, prefix: `/output/viewer-fixtures/${version}/spineboy`, skeleton: `spineboy-pro.${extension}`, animation: 'walk',
    })));
    const door = await fetch('/output/door-fixture/base_door.skel');
    if (door.ok && !(door.headers.get('content-type') || '').includes('text/html')) {
      for (const animation of ['in', 'loop', 'out']) cases.push({ version: '4.0', prefix: '/output/door-fixture/base_door', skeleton: 'base_door.skel', animation });
    }
    for (const sample of cases) {
      const { create } = await import(sample.version === '4.2' ? '/frontend/src/viewer/modern.ts' : '/frontend/src/viewer/legacy.ts');
      const atlas = await (await fetch(sample.prefix + '.atlas')).text();
      const directory = sample.prefix.slice(0, sample.prefix.lastIndexOf('/') + 1);
      const bytes = new Uint8Array(await (await fetch(directory + sample.skeleton)).arrayBuffer());
      const bitmap = await createImageBitmap(await (await fetch(sample.prefix + '.png')).blob(), { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
      const canvas = document.createElement('canvas');
      let renderer;
      try {
        const filename = sample.prefix.slice(sample.prefix.lastIndexOf('/') + 1) + '.png';
        renderer = await create(canvas, atlas, new Map([[filename, bitmap]]), bytes, sample.skeleton.endsWith('.skel'), sample.version);
        if (sample.version === '4.0' && !renderer.runtime.includes('pixi-spine 4.1')) throw new Error('Missing 4.0 compatibility runtime');
        const skin = renderer.skins.includes('default') ? 'default' : renderer.skins[0] || '';
        const hashes = [];
        for (const time of [0.2, 0.6]) {
          renderer.reset(sample.animation, skin, false);
          for (let frame = 0; frame < Math.round(time * 60); frame++) renderer.step(1 / 60);
          const bounds = renderer.bounds();
          if (!Object.values(bounds).every(Number.isFinite) || bounds.width <= 0 || bounds.height <= 0) throw new Error('Invalid bounds');
          renderer.draw({ width: 512, height: 512, x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2, scale: Math.min(400 / bounds.width, 400 / bounds.height), pma: null, bones: false });
          const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
          const pixels = new Uint8Array(canvas.width * canvas.height * 4);
          gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
          let visible = 0;
          let hash = 0;
          for (let offset = 0; offset < pixels.length; offset++) {
            hash = (Math.imul(hash, 31) + pixels[offset]) | 0;
            if (offset % 4 === 3 && pixels[offset] > 0) visible++;
          }
          if (visible < 100) throw new Error('Blank render');
          hashes.push(hash);
          if (sample.skeleton === 'base_door.skel' && sample.animation === 'loop' && time === 0.6) {
            const image = document.createElement('img');
            image.id = 'door-result'; image.src = canvas.toDataURL(); image.style.background = '#30343b';
            document.body.replaceChildren(image);
          }
        }
        if (hashes[0] === hashes[1]) throw new Error('Animation did not change');
        results.push({ version: sample.version, asset: sample.skeleton, animation: sample.animation, runtime: renderer.runtime });
      } catch (error) { throw new Error(`${sample.version}/${sample.skeleton}/${sample.animation}: ${error}`); }
      finally { renderer?.dispose(); bitmap.close(); }
    }
    window.adapterSmokeResults = results;
  });
  if (await page.locator('#door-result').count()) await page.locator('#door-result').screenshot({ path: 'output/playwright/base-door-fixed.png' });
}
