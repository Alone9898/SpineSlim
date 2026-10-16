import { getCurrentWindow } from '@tauri-apps/api/window';

const guards = new Set<() => Promise<boolean>>();

export function registerCloseGuard(guard: () => Promise<boolean>) {
  guards.add(guard);
  return () => { guards.delete(guard); };
}

export function installCloseHandler(onError: (reason: unknown) => void) {
  let closing = false;
  return getCurrentWindow().onCloseRequested(async event => {
    event.preventDefault();
    if (closing) return;
    closing = true;
    try {
      for (const guard of guards) {
        if (!await guard()) return;
      }
      await getCurrentWindow().destroy();
    } catch (reason) {
      onError(reason);
    } finally {
      closing = false;
    }
  });
}
