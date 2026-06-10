
type OkDesktopClipboard = { writeText: (text: string) => Promise<void> };

interface OkDesktopHost {
  okDesktop?: { clipboard?: OkDesktopClipboard };
}

interface NavClipboardHost {
  navigator?: {
    clipboard?: { writeText?: (text: string) => Promise<void> };
  };
}

export function isPermissionsPolicyRefusal(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error.name !== 'NotAllowedError') return false;
  return /permission denied/i.test(error.message);
}

export async function scheduleClipboardWrite(text: string): Promise<void> {
  const okClipboard = (globalThis as OkDesktopHost).okDesktop?.clipboard;
  if (okClipboard && typeof okClipboard.writeText === 'function') {
    await okClipboard.writeText(text);
    return;
  }

  const navClipboard = (globalThis as NavClipboardHost).navigator?.clipboard;
  if (navClipboard && typeof navClipboard.writeText === 'function') {
    await navClipboard.writeText(text);
    return;
  }

  throw new Error('clipboard API unavailable');
}
