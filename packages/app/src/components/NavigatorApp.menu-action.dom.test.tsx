import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import type { OkDesktopBridge } from '@/lib/desktop-bridge-types';

mock.module('next-themes', () => ({
  useTheme: () => ({ theme: 'system' }),
}));

mock.module('@/hooks/use-theme-bridge', () => ({
  useThemeBridge: () => {},
}));

const { NavigatorApp } = await import('./NavigatorApp');

type WindowGlobals = { NodeFilter?: typeof NodeFilter };
type GlobalWithDomShims = typeof globalThis &
  WindowGlobals & { window?: WindowGlobals; ResizeObserver?: unknown };
const globalWithDomShims = globalThis as GlobalWithDomShims;
if (
  globalWithDomShims.NodeFilter === undefined &&
  globalWithDomShims.window?.NodeFilter !== undefined
) {
  globalWithDomShims.NodeFilter = globalWithDomShims.window.NodeFilter;
}
if (globalWithDomShims.ResizeObserver === undefined) {
  class NoopResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  globalWithDomShims.ResizeObserver = NoopResizeObserver;
}

const ASYNC_TIMEOUT_MS = 2000;

type MenuActionLike = 'new-project' | 'new-doc' | 'toggle-sidebar' | 'close-active-tab-or-window';

interface NavigatorBridgeStub {
  bridge: OkDesktopBridge;
  fire(action: MenuActionLike): void;
}

function makeNavigatorBridge(): NavigatorBridgeStub {
  let captured: ((action: MenuActionLike) => void) | null = null;

  const bridge = {
    config: {
      collabUrl: '',
      apiOrigin: '',
      projectPath: '',
      projectName: 'Project Navigator',
      mode: 'navigator',
    },
    onMenuAction: (cb: (action: MenuActionLike) => void) => {
      captured = cb;
      return () => {
        captured = null;
      };
    },
    project: {
      listRecent: async () => [],
      removeRecent: async () => undefined,
      getSessionState: async () => ({
        openTabs: [],
        pinnedTabIds: [],
        activeDocName: null,
        activeTabId: null,
        updatedAt: null,
      }),
      setSessionState: async () => undefined,
      open: async () => undefined,
      createNew: async () => undefined,
      recordCreateNewBannerShown: async () => undefined,
      readHeadBranch: async () => ({
        currentBranch: null,
        headSha: null,
        detached: false,
      }),
      close: async () => undefined,
    },
    dialog: {
      openFolder: async (): Promise<string | null> => null,
    },
    fs: {
      defaultProjectsRoot: async (): Promise<string> => '/Users/test/Projects',
    },
  } as unknown as OkDesktopBridge;

  return {
    bridge,
    fire: (action) => {
      if (captured) {
        act(() => captured?.(action));
      }
    },
  };
}

describe('NavigatorApp new-project menu-action subscription', () => {
  let consoleWarnSpy: ReturnType<typeof spyOn>;
  let consoleErrorSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    consoleWarnSpy = spyOn(console, 'warn').mockImplementation(() => {});
    consoleErrorSpy = spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  test('CreateProjectDialog is closed until the new-project menu action fires', async () => {
    const stub = makeNavigatorBridge();
    render(<NavigatorApp bridge={stub.bridge} />);

    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByTestId('create-project-dialog') !== null).toBe(false);
  });

  test('new-project menu action opens CreateProjectDialog', async () => {
    const stub = makeNavigatorBridge();
    render(<NavigatorApp bridge={stub.bridge} />);

    await new Promise((r) => setTimeout(r, 0));

    stub.fire('new-project');

    await waitFor(
      () => {
        expect(screen.queryByTestId('create-project-dialog') !== null).toBe(true);
      },
      { timeout: ASYNC_TIMEOUT_MS },
    );
  });

  test('unrelated menu actions do not open CreateProjectDialog', async () => {
    const stub = makeNavigatorBridge();
    render(<NavigatorApp bridge={stub.bridge} />);

    await new Promise((r) => setTimeout(r, 0));

    stub.fire('new-doc');
    stub.fire('toggle-sidebar');

    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByTestId('create-project-dialog') !== null).toBe(false);
  });

  test('close-active-tab-or-window menu action closes the navigator window', async () => {
    const closeSpy = spyOn(window, 'close').mockImplementation(() => {});
    const stub = makeNavigatorBridge();
    render(<NavigatorApp bridge={stub.bridge} />);

    await new Promise((r) => setTimeout(r, 0));

    stub.fire('close-active-tab-or-window');

    expect(closeSpy).toHaveBeenCalledTimes(1);
    closeSpy.mockRestore();
  });
});
