async (page) => {
  await page.getByRole('button', { name: 'Spine 预览', exact: true }).click();
  await page.evaluate(async () => {
    const { invoke } = await import('/node_modules/@tauri-apps/api/core.js');
    const { emitTo } = await import('/node_modules/@tauri-apps/api/event.js');
    const root = await invoke('app_directory');
    await emitTo('main', 'tauri://drag-drop', { paths: [root + '/../../../output/viewer-fixtures/4.2'], position: { x: 450, y: 400 } });
  });
  await page.waitForFunction(() => document.querySelector('.viewer-bottom')?.textContent.includes('spine-webgl'));
  const stage = page.locator('.viewer-canvas');
  const before = await stage.evaluate(element => element.style.backgroundPosition);
  const bounds = await stage.boundingBox();
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width / 2 + 80, bounds.y + bounds.height / 2 + 40, { steps: 5 });
  await page.mouse.up();
  const after = await stage.evaluate(element => element.style.backgroundPosition);
  if (before === after) throw new Error('Grid did not pan');
  await page.getByRole('button', { name: '画布全屏', exact: true }).click();
  await page.waitForFunction(() => !!document.fullscreenElement);
  await page.getByRole('button', { name: '退出全屏', exact: true }).click();
  await page.waitForFunction(() => !document.fullscreenElement);
  await page.getByRole('button', { name: '画布全屏', exact: true }).click();
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.fullscreenElement);
  await page.getByRole('button', { name: '适应画布', exact: true }).click();
}
