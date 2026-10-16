async (page) => {
  await page.getByRole('button', { name: '音频处理', exact: true }).click();
  await page.evaluate(async () => {
    const { invoke } = await import('/node_modules/@tauri-apps/api/core.js');
    const root = await invoke('app_directory');
    window.audioTestRoot = root + '/../../../output';
    const { emitTo } = await import('/node_modules/@tauri-apps/api/event.js');
    await emitTo('main', 'tauri://drag-drop', { paths: [window.audioTestRoot + '/audio-fixtures'], position: { x: 400, y: 300 } });
  });
  await page.getByRole('button', { name: /tone-a.wav/ }).waitFor({ timeout: 30000 });
  await page.getByRole('button', { name: /tone-a.wav/ }).click();
  await page.getByRole('spinbutton', { name: '开始（秒）', exact: true }).fill('0.2');
  await page.getByRole('spinbutton', { name: '结束（秒）', exact: true }).fill('1.2');
  await page.getByRole('spinbutton', { name: '淡入（秒）', exact: true }).fill('0.1');
  await page.getByRole('button', { name: '加载试听', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('audio')?.readyState >= 1, { timeout: 30000 });
  await page.getByRole('textbox', { name: '输出目录 选择目录', exact: true }).fill(await page.evaluate(() => window.audioTestRoot + '/audio-results'));
  await page.getByRole('combobox', { name: '输出格式', exact: true }).selectOption('wav');
  for (const operation of ['batch', 'merge', 'sprite']) {
    await page.getByRole('combobox', { name: '开始导出', exact: true }).selectOption(operation);
    await page.getByRole('button', { name: '开始导出', exact: true }).click();
    await page.getByText('导出完成', { exact: true }).waitFor({ timeout: 60000 });
    if (await page.getByRole('alert').count()) throw new Error(await page.getByRole('alert').allTextContents());
    const progress = await page.locator('.audio-editor progress').getAttribute('value');
    if (progress !== '100') throw new Error('Progress did not reach 100');
  }
  await page.screenshot({ path: 'output/playwright/audio-zh.png', fullPage: true });
  await page.getByRole('combobox', { name: '界面语言', exact: true }).selectOption('en');
  await page.getByRole('heading', { name: 'Audio processing', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Load preview', exact: true }).waitFor();
  await page.screenshot({ path: 'output/playwright/audio-en.png', fullPage: true });
  await page.getByRole('combobox', { name: 'Language', exact: true }).selectOption('zh');
  console.log('Native audio import, preview, batch, merge, sprite, progress and language checks passed');
}
