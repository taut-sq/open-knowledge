
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { isPermissionsPolicyRefusal, scheduleClipboardWrite } from './clipboard-adapter';

interface MockableGlobals {
  windowOkDesktop: { clipboard: { writeText: (text: string) => Promise<void> } } | undefined;
  navigatorClipboardWriteText: ((text: string) => Promise<void>) | undefined;
}

function captureGlobals(): MockableGlobals {
  const win = globalThis as unknown as {
    okDesktop?: MockableGlobals['windowOkDesktop'];
  };
  const nav = globalThis as unknown as {
    navigator?: { clipboard?: { writeText?: (text: string) => Promise<void> } };
  };
  return {
    windowOkDesktop: win.okDesktop,
    navigatorClipboardWriteText: nav.navigator?.clipboard?.writeText,
  };
}

function setGlobals(g: MockableGlobals): void {
  const win = globalThis as unknown as {
    okDesktop?: MockableGlobals['windowOkDesktop'];
  };
  if (g.windowOkDesktop) win.okDesktop = g.windowOkDesktop;
  else delete win.okDesktop;

  const navHolder = globalThis as unknown as {
    navigator?: { clipboard?: { writeText?: (text: string) => Promise<void> } };
  };
  const clip: { writeText?: typeof g.navigatorClipboardWriteText } = {};
  if (g.navigatorClipboardWriteText) clip.writeText = g.navigatorClipboardWriteText;
  if (!navHolder.navigator) {
    (navHolder as { navigator: { clipboard: typeof clip } }).navigator = { clipboard: clip };
  } else {
    navHolder.navigator.clipboard = clip;
  }
}

let savedGlobals: MockableGlobals;

beforeEach(() => {
  savedGlobals = captureGlobals();
});

afterEach(() => {
  setGlobals(savedGlobals);
});

describe('scheduleClipboardWrite — Electron IPC bridge path (preferred when available)', () => {
  test('routes the URL through window.okDesktop.clipboard.writeText', async () => {
    const calls: string[] = [];
    setGlobals({
      windowOkDesktop: {
        clipboard: {
          writeText: async (text) => {
            calls.push(text);
          },
        },
      },
      navigatorClipboardWriteText: undefined,
    });

    await scheduleClipboardWrite('https://openknowledge.ai/d/AAA');
    expect(calls).toEqual(['https://openknowledge.ai/d/AAA']);
  });

  test('does NOT touch navigator.clipboard when okDesktop bridge is available', async () => {
    const navWriteText = mock(async () => undefined);
    setGlobals({
      windowOkDesktop: {
        clipboard: { writeText: async () => undefined },
      },
      navigatorClipboardWriteText: navWriteText,
    });

    await scheduleClipboardWrite('https://openknowledge.ai/d/AAA');
    expect(navWriteText).not.toHaveBeenCalled();
  });

  test('propagates the bridge rejection when Electron IPC fails', async () => {
    setGlobals({
      windowOkDesktop: {
        clipboard: {
          writeText: async () => {
            throw new Error('ipc-channel-closed');
          },
        },
      },
      navigatorClipboardWriteText: undefined,
    });

    await expect(scheduleClipboardWrite('https://openknowledge.ai/d/AAA')).rejects.toThrow(
      /ipc-channel-closed/,
    );
  });
});

describe('scheduleClipboardWrite — navigator.clipboard.writeText fallback', () => {
  test('writes the URL via writeText when the Electron bridge is absent', async () => {
    const calls: string[] = [];
    setGlobals({
      windowOkDesktop: undefined,
      navigatorClipboardWriteText: async (text) => {
        calls.push(text);
      },
    });

    await scheduleClipboardWrite('https://openknowledge.ai/d/BBB');
    expect(calls).toEqual(['https://openknowledge.ai/d/BBB']);
  });

  test('propagates the writeText rejection (e.g. NotAllowedError)', async () => {
    setGlobals({
      windowOkDesktop: undefined,
      navigatorClipboardWriteText: async () => {
        throw new Error('NotAllowedError: clipboard denied');
      },
    });

    await expect(scheduleClipboardWrite('https://openknowledge.ai/d/BBB')).rejects.toThrow(
      /NotAllowedError|clipboard denied/,
    );
  });
});

describe('isPermissionsPolicyRefusal', () => {
  test('matches NotAllowedError with "permission denied" wording (Chrome / Edge)', () => {
    const error = new Error(
      "Failed to execute 'writeText' on 'Clipboard': Write permission denied.",
    );
    error.name = 'NotAllowedError';
    expect(isPermissionsPolicyRefusal(error)).toBe(true);
  });

  test('matches case-insensitively', () => {
    const error = new Error('Write Permission Denied.');
    error.name = 'NotAllowedError';
    expect(isPermissionsPolicyRefusal(error)).toBe(true);
  });

  test('does NOT match NotAllowedError without "permission denied" (activation expiry)', () => {
    const error = new Error('Document is not focused.');
    error.name = 'NotAllowedError';
    expect(isPermissionsPolicyRefusal(error)).toBe(false);
  });

  test('does NOT match a different error name even with matching message', () => {
    const error = new Error('Write permission denied.');
    error.name = 'SecurityError';
    expect(isPermissionsPolicyRefusal(error)).toBe(false);
  });

  test('does NOT match non-Error values', () => {
    expect(isPermissionsPolicyRefusal('Write permission denied')).toBe(false);
    expect(isPermissionsPolicyRefusal(null)).toBe(false);
    expect(isPermissionsPolicyRefusal(undefined)).toBe(false);
    expect(
      isPermissionsPolicyRefusal({ name: 'NotAllowedError', message: 'permission denied' }),
    ).toBe(false);
  });
});

describe('scheduleClipboardWrite — no clipboard API available', () => {
  test('throws "clipboard API unavailable" when no platform path is supported', async () => {
    setGlobals({
      windowOkDesktop: undefined,
      navigatorClipboardWriteText: undefined,
    });

    await expect(scheduleClipboardWrite('https://openknowledge.ai/d/ZZZ')).rejects.toThrow(
      /clipboard API unavailable/,
    );
  });
});
