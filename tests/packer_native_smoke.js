async (page) => {
  await page.evaluate(async () => {
    const { invoke } = await import('/node_modules/@tauri-apps/api/core.js');
    const root = await invoke('app_directory');
    const folder = root + '/../../../output/viewer-fixtures';
    const first = await invoke('packer_list', { paths: [folder] });
    if (first.files.length !== 4) throw new Error('Expected four fixture PNGs');
    const bytes = new Uint8Array(await invoke('packer_read', { session: first.session, id: first.files[0].id }));
    if (bytes[0] !== 137 || bytes[1] !== 80) throw new Error('Invalid PNG');
    await invoke('packer_list', { paths: [folder] });
    let rejected = false;
    try { await invoke('packer_read', { session: first.session, id: first.files[0].id }); } catch { rejected = true; }
    if (!rejected) throw new Error('Expired read accepted');
    const zip = new Uint8Array(await (await fetch('/output/packer-smoke.zip')).arrayBuffer());
    const target = root + '/../../../output/packer-native-smoke.zip';
    await invoke('packer_save', { target, bytes: Array.from(zip) });
    rejected = false;
    try { await invoke('packer_save', { target, bytes: [0, 1, 2, 3] }); } catch { rejected = true; }
    if (!rejected) throw new Error('Invalid ZIP accepted');
    window.packerNativeResult = { target, bytes: zip.length, expiredSessionRejected: true, invalidZipRejected: true };
  });
}
