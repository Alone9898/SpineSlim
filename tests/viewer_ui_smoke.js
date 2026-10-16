async (page) => {
  await page.getByRole('button', { name: 'Spine 预览', exact: true }).click();
  await page.evaluate(async () => {
    const { invoke } = await import('/node_modules/@tauri-apps/api/core.js');
    const { emitTo } = await import('/node_modules/@tauri-apps/api/event.js');
    const root = await invoke('app_directory');
    await emitTo('main', 'tauri://drag-drop', { paths: [root + '/../../../output/viewer-fixtures'], position: { x: 450, y: 400 } });
  });
  await page.waitForFunction(() => document.querySelectorAll('.viewer-resource-list button[data-asset]').length === 8);
  const rows = page.locator('.viewer-resource-list button[data-asset]');
  for (let index = 0; index < 8; index++) {
    await rows.nth(index).click();
    await page.waitForFunction(() => {
      if (document.querySelector('.viewer-error')) throw new Error(document.querySelector('.viewer-error').textContent);
      return /(?:pixi-spine|spine-webgl)/.test(document.querySelector('.viewer-bottom')?.textContent ?? '');
    });
    const properties = page.getByRole('button', { name: '预览设置', exact: true });
    if (!(await page.getByRole('combobox', { name: '动画', exact: true }).isVisible()) && await properties.isVisible()) await properties.click();
    await page.getByRole('combobox', { name: '动画', exact: true }).selectOption('walk');
    if (await page.getByRole('button', { name: '暂停', exact: true }).isVisible()) await page.getByRole('button', { name: '暂停', exact: true }).click();
    await page.getByLabel('播放进度', { exact: true }).evaluate(input => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '0.5');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.waitForFunction(() => document.querySelector('.viewer-transport>span')?.textContent.startsWith('0.50'));
    if (await page.getByRole('button', { name: 'Close', exact: true }).isVisible()) await page.getByRole('button', { name: 'Close', exact: true }).click();
    await page.getByRole('button', { name: '适应画布', exact: true }).click();
    await page.screenshot({ path: 'output/playwright/viewer-' + index + '.png' });
    await page.getByRole('button', { name: '播放', exact: true }).click();
  }
}
