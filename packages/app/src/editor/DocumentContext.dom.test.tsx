import { afterEach, describe, expect, mock, spyOn, test } from 'bun:test';
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactNode, useLayoutEffect, useState } from 'react';
import type { OkDesktopBridge } from '@/lib/desktop-bridge-types';
import { docTabId, localTabSessionStorageKey } from './editor-tabs';

mock.module('@/lib/use-collab-url', () => ({
  useCollabUrl: () => ({
    collabUrl: null,
    attempts: 0,
    terminal: false,
    lastError: null,
    retry: () => {},
  }),
}));

const { DocumentProvider, useDocumentContext } = await import('./DocumentContext');

const PINNED_TAB_ID = docTabId('Pinned.md');
const OTHER_TAB_ID = docTabId('Other.md');

function seedTabSession() {
  window.localStorage.setItem(
    localTabSessionStorageKey(window.location.origin),
    JSON.stringify({
      openTabs: [PINNED_TAB_ID, OTHER_TAB_ID],
      pinnedTabIds: [PINNED_TAB_ID],
      activeDocName: 'Pinned.md',
      activeTabId: PINNED_TAB_ID,
      updatedAt: new Date('2026-05-13T00:00:00.000Z').toISOString(),
    }),
  );
}

function seedActiveOtherTabSession() {
  window.localStorage.setItem(
    localTabSessionStorageKey(window.location.origin),
    JSON.stringify({
      openTabs: [PINNED_TAB_ID, OTHER_TAB_ID],
      pinnedTabIds: [],
      activeDocName: 'Other.md',
      activeTabId: OTHER_TAB_ID,
      updatedAt: new Date('2026-05-13T00:00:00.000Z').toISOString(),
    }),
  );
}

function seedOnlyPinnedTabSession() {
  window.localStorage.setItem(
    localTabSessionStorageKey(window.location.origin),
    JSON.stringify({
      openTabs: [PINNED_TAB_ID],
      pinnedTabIds: [PINNED_TAB_ID],
      activeDocName: 'Pinned.md',
      activeTabId: PINNED_TAB_ID,
      updatedAt: new Date('2026-05-13T00:00:00.000Z').toISOString(),
    }),
  );
}

type MenuActionLike = 'close-active-tab-or-window' | 'new-doc';

interface EditorBridgeStub {
  bridge: OkDesktopBridge;
  fire(action: MenuActionLike): void;
}

function makeEditorBridgeStub(): EditorBridgeStub {
  let captured: ((action: MenuActionLike) => void) | null = null;
  const bridge = {
    config: {
      mode: 'editor',
      collabUrl: '',
      apiOrigin: '',
      projectPath: '',
      projectName: 'Test Project',
    },
    onMenuAction: (cb: (action: MenuActionLike) => void) => {
      captured = cb;
      return () => {
        captured = null;
      };
    },
    project: {
      getSessionState: async () => ({
        openTabs: [],
        pinnedTabIds: [],
        activeDocName: null,
        activeTabId: null,
        updatedAt: null,
      }),
      setSessionState: async () => undefined,
    },
  } as unknown as OkDesktopBridge;

  return {
    bridge,
    fire: (action) => {
      act(() => captured?.(action));
    },
  };
}

function Harness() {
  const ctx = useDocumentContext();
  return (
    <>
      <span data-testid="open-tabs">{ctx.openTabs.join('|')}</span>
      <span data-testid="pinned-tabs">{ctx.pinnedTabIds.join('|')}</span>
      <button type="button" onClick={() => ctx.closeTabs([PINNED_TAB_ID])}>
        Close pinned
      </button>
      <button type="button" onClick={() => ctx.closeTabs([PINNED_TAB_ID], { force: true })}>
        Force close pinned
      </button>
    </>
  );
}

function CloseActiveHarness() {
  const ctx = useDocumentContext();
  const [handled, setHandled] = useState<string>('');
  return (
    <>
      <span data-testid="open-tabs">{ctx.openTabs.join('|')}</span>
      <span data-testid="active-tab">{ctx.activeTabId ?? ''}</span>
      <span data-testid="new-tabs">{ctx.newTabIds.join('|')}</span>
      <span data-testid="active-new-tab">{ctx.activeNewTabId ?? ''}</span>
      <span data-testid="close-handled">{handled}</span>
      <button type="button" onClick={() => ctx.openNewTab()}>
        Open new
      </button>
      <button type="button" onClick={() => setHandled(String(ctx.closeActiveTabOrWindow()))}>
        Close active
      </button>
    </>
  );
}

function BridgeCloseActiveHarness({ bridge }: { bridge: OkDesktopBridge }) {
  useLayoutEffect(() => {
    window.okDesktop = bridge;
    return () => {
      delete window.okDesktop;
    };
  }, [bridge]);
  return <CloseActiveHarness />;
}

function ProviderHarness({ children }: { children: ReactNode }) {
  return <DocumentProvider>{children}</DocumentProvider>;
}

describe('DocumentContext tab close force contract', () => {
  afterEach(() => {
    cleanup();
    delete window.okDesktop;
    window.localStorage.clear();
    window.location.hash = '';
  });

  test('closeTabs skips pinned tabs unless force is explicitly set', async () => {
    seedTabSession();
    render(<Harness />, { wrapper: ProviderHarness });

    expect(screen.getByTestId('open-tabs').textContent).toBe(`${PINNED_TAB_ID}|${OTHER_TAB_ID}`);
    expect(screen.getByTestId('pinned-tabs').textContent).toBe(PINNED_TAB_ID);

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Close pinned' }));

    expect(screen.getByTestId('open-tabs').textContent).toBe(`${PINNED_TAB_ID}|${OTHER_TAB_ID}`);
    expect(screen.getByTestId('pinned-tabs').textContent).toBe(PINNED_TAB_ID);

    await user.click(screen.getByRole('button', { name: 'Force close pinned' }));

    expect(screen.getByTestId('open-tabs').textContent).toBe(OTHER_TAB_ID);
    expect(screen.getByTestId('pinned-tabs').textContent).toBe('');
  });

  test('closeActiveTabOrWindow closes one active tab and reports the menu action handled', async () => {
    seedActiveOtherTabSession();
    render(<CloseActiveHarness />, { wrapper: ProviderHarness });

    expect(screen.getByTestId('open-tabs').textContent).toBe(`${PINNED_TAB_ID}|${OTHER_TAB_ID}`);
    expect(screen.getByTestId('active-tab').textContent).toBe(OTHER_TAB_ID);

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Close active' }));

    expect(screen.getByTestId('close-handled').textContent).toBe('true');
    expect(screen.getByTestId('open-tabs').textContent).toBe(PINNED_TAB_ID);
    expect(screen.getByTestId('active-tab').textContent).toBe(PINNED_TAB_ID);
  });

  test('closeActiveTabOrWindow skips active pinned tab and closes the next visible unpinned tab', async () => {
    seedTabSession();
    render(<CloseActiveHarness />, { wrapper: ProviderHarness });

    expect(screen.getByTestId('open-tabs').textContent).toBe(`${PINNED_TAB_ID}|${OTHER_TAB_ID}`);
    expect(screen.getByTestId('active-tab').textContent).toBe(PINNED_TAB_ID);

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Close active' }));

    expect(screen.getByTestId('close-handled').textContent).toBe('true');
    expect(screen.getByTestId('open-tabs').textContent).toBe(PINNED_TAB_ID);
    expect(screen.getByTestId('active-tab').textContent).toBe(PINNED_TAB_ID);
  });

  test('closeActiveTabOrWindow reports unhandled when only pinned tabs remain', async () => {
    seedOnlyPinnedTabSession();
    render(<CloseActiveHarness />, { wrapper: ProviderHarness });

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Close active' }));

    expect(screen.getByTestId('close-handled').textContent).toBe('false');
    expect(screen.getByTestId('open-tabs').textContent).toBe(PINNED_TAB_ID);
    expect(screen.getByTestId('active-tab').textContent).toBe(PINNED_TAB_ID);
  });

  test('closeActiveTabOrWindow closes an active new tab before falling back to the window', async () => {
    render(<CloseActiveHarness />, { wrapper: ProviderHarness });

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Open new' }));

    expect(screen.getByTestId('new-tabs').textContent).toBe('new-tab:1');
    expect(screen.getByTestId('active-new-tab').textContent).toBe('new-tab:1');

    await user.click(screen.getByRole('button', { name: 'Close active' }));

    expect(screen.getByTestId('close-handled').textContent).toBe('true');
    expect(screen.getByTestId('new-tabs').textContent).toBe('');
    expect(screen.getByTestId('active-new-tab').textContent).toBe('');
  });

  test('closeActiveTabOrWindow reports unhandled when no visible tabs remain', async () => {
    render(<CloseActiveHarness />, { wrapper: ProviderHarness });

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Close active' }));

    expect(screen.getByTestId('close-handled').textContent).toBe('false');
    expect(screen.getByTestId('open-tabs').textContent).toBe('');
    expect(screen.getByTestId('active-tab').textContent).toBe('');
  });

  test('desktop close-active-tab-or-window action closes tabs before closing the editor window', async () => {
    seedActiveOtherTabSession();
    const closeSpy = spyOn(window, 'close').mockImplementation(() => {});
    const stub = makeEditorBridgeStub();

    render(<BridgeCloseActiveHarness bridge={stub.bridge} />, { wrapper: ProviderHarness });
    await new Promise((r) => setTimeout(r, 0));

    expect(screen.getByTestId('open-tabs').textContent).toBe(`${PINNED_TAB_ID}|${OTHER_TAB_ID}`);

    stub.fire('close-active-tab-or-window');

    expect(closeSpy).toHaveBeenCalledTimes(0);
    expect(screen.getByTestId('open-tabs').textContent).toBe(PINNED_TAB_ID);

    cleanup();
    delete window.okDesktop;
    window.localStorage.clear();

    const emptyStub = makeEditorBridgeStub();
    render(<BridgeCloseActiveHarness bridge={emptyStub.bridge} />, { wrapper: ProviderHarness });
    await new Promise((r) => setTimeout(r, 0));

    emptyStub.fire('close-active-tab-or-window');

    expect(closeSpy).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('open-tabs').textContent).toBe('');
    closeSpy.mockRestore();
  });
});

const REORDER_A = docTabId('A.md');
const REORDER_B = docTabId('B.md');
const REORDER_C = docTabId('C.md');

function seedReorderSession() {
  window.localStorage.setItem(
    localTabSessionStorageKey(window.location.origin),
    JSON.stringify({
      openTabs: [REORDER_A, REORDER_B, REORDER_C],
      pinnedTabIds: [REORDER_A],
      activeDocName: 'A.md',
      activeTabId: REORDER_A,
      updatedAt: new Date('2026-05-16T00:00:00.000Z').toISOString(),
    }),
  );
}

function ReorderHarness({
  newOrder,
  draggedTabId,
}: {
  newOrder: readonly string[];
  draggedTabId: string;
}) {
  const ctx = useDocumentContext();
  return (
    <>
      <span data-testid="open-tabs">{ctx.openTabs.join('|')}</span>
      <span data-testid="pinned-tabs">{ctx.pinnedTabIds.join('|')}</span>
      <span data-testid="visible-tabs">{ctx.visibleTabIds.join('|')}</span>
      <button type="button" onClick={() => ctx.reorderTabs(newOrder, draggedTabId)}>
        Reorder
      </button>
    </>
  );
}

describe('DocumentContext reorderTabs — order + drag-mutable pin', () => {
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    window.location.hash = '';
  });

  test('dragging the lone pinned tab out of the pinned zone unpins it (wired end-to-end)', async () => {
    seedReorderSession();
    render(
      <ReorderHarness newOrder={[REORDER_B, REORDER_A, REORDER_C]} draggedTabId={REORDER_A} />,
      {
        wrapper: ProviderHarness,
      },
    );

    expect(screen.getByTestId('pinned-tabs').textContent).toBe(REORDER_A);

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Reorder' }));

    expect(screen.getByTestId('open-tabs').textContent).toBe(
      `${REORDER_B}|${REORDER_A}|${REORDER_C}`,
    );
    expect(screen.getByTestId('visible-tabs').textContent).toBe(
      `${REORDER_B}|${REORDER_A}|${REORDER_C}`,
    );
    expect(screen.getByTestId('pinned-tabs').textContent).toBe('');
  });

  test('dragging an unpinned tab into the pinned zone pins it; non-dragged tabs keep state', async () => {
    seedReorderSession();
    render(
      <ReorderHarness newOrder={[REORDER_C, REORDER_A, REORDER_B]} draggedTabId={REORDER_C} />,
      {
        wrapper: ProviderHarness,
      },
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Reorder' }));

    expect(screen.getByTestId('open-tabs').textContent).toBe(
      `${REORDER_C}|${REORDER_A}|${REORDER_B}`,
    );
    expect(screen.getByTestId('pinned-tabs').textContent).toBe(`${REORDER_A}|${REORDER_C}`);
  });

  test('reorderTabs is a no-op when the supplied order matches the current order', async () => {
    seedReorderSession();
    render(
      <ReorderHarness newOrder={[REORDER_A, REORDER_B, REORDER_C]} draggedTabId={REORDER_A} />,
      {
        wrapper: ProviderHarness,
      },
    );

    const beforeOpen = screen.getByTestId('open-tabs').textContent;
    const beforePinned = screen.getByTestId('pinned-tabs').textContent;
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Reorder' }));
    expect(screen.getByTestId('open-tabs').textContent).toBe(beforeOpen);
    expect(screen.getByTestId('pinned-tabs').textContent).toBe(beforePinned);
  });

  test('reorderTabs commits a new-tab-placeholder reorder among doc-tabs (QA-024)', async () => {
    seedReorderSession();
    function NewTabReorderHarness() {
      const ctx = useDocumentContext();
      return (
        <>
          <span data-testid="visible-tabs">{ctx.visibleTabIds.join('|')}</span>
          <button
            type="button"
            onClick={() => {
              ctx.openNewTab();
            }}
          >
            New tab
          </button>
          <button
            type="button"
            onClick={() => {
              const visible = ctx.visibleTabIds;
              const newTabId = ctx.newTabIds[0];
              if (!newTabId) return;
              const next = visible.filter((id) => id !== newTabId);
              next.splice(1, 0, newTabId);
              ctx.reorderTabs(next, newTabId);
            }}
          >
            Move new-tab to middle
          </button>
        </>
      );
    }
    render(<NewTabReorderHarness />, { wrapper: ProviderHarness });
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'New tab' }));
    const beforeReorder = screen.getByTestId('visible-tabs').textContent ?? '';
    const beforeParts = beforeReorder.split('|');
    expect(beforeParts).toEqual([REORDER_A, REORDER_B, REORDER_C, beforeParts[3] ?? '']);
    const newTabId = beforeParts[3];
    expect(newTabId).toMatch(/^new-tab:/);
    await user.click(screen.getByRole('button', { name: 'Move new-tab to middle' }));
    const afterParts = (screen.getByTestId('visible-tabs').textContent ?? '').split('|');
    expect(afterParts).toEqual([REORDER_A, newTabId, REORDER_B, REORDER_C]);
  });

  test('reorderTabs defensively appends any open tab the caller forgot to include', async () => {
    seedReorderSession();
    render(<ReorderHarness newOrder={[REORDER_C, REORDER_A]} draggedTabId={REORDER_B} />, {
      wrapper: ProviderHarness,
    });

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Reorder' }));
    const tabs = screen.getByTestId('open-tabs').textContent ?? '';
    expect(tabs.split('|')).toEqual([REORDER_C, REORDER_A, REORDER_B]);
    expect(screen.getByTestId('pinned-tabs').textContent).toBe(REORDER_A);
  });
});

const COLD_START_DOC = docTabId('event_watcher');

function seedColdStartSession() {
  window.localStorage.setItem(
    localTabSessionStorageKey(window.location.origin),
    JSON.stringify({
      openTabs: [COLD_START_DOC],
      pinnedTabIds: [],
      activeDocName: 'event_watcher',
      activeTabId: COLD_START_DOC,
      updatedAt: new Date('2026-06-07T00:00:00.000Z').toISOString(),
    }),
  );
}

function ColdStartSyncHarness() {
  const ctx = useDocumentContext();
  return (
    <>
      <span data-testid="open-tabs">{ctx.openTabs.join('|')}</span>
      <button
        type="button"
        onClick={() =>
          ctx.syncOpenTabsWithKnownTargets({
            pages: new Set(),
            folderPaths: new Set(),
            assetPaths: new Set(),
          })
        }
      >
        Sync empty pages
      </button>
    </>
  );
}

describe('DocumentContext syncOpenTabsWithKnownTargets — cold-start hash preservation', () => {
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    window.location.hash = '';
  });

  test('a sync against transiently-empty pages keeps the hash-targeted doc (no empty-state splash)', async () => {
    seedColdStartSession();
    window.location.hash = '#/event_watcher';
    render(<ColdStartSyncHarness />, { wrapper: ProviderHarness });

    expect(screen.getByTestId('open-tabs').textContent).toBe(COLD_START_DOC);

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Sync empty pages' }));

    expect(screen.getByTestId('open-tabs').textContent).toBe(COLD_START_DOC);
    expect(window.location.hash).toBe('#/event_watcher');
  });
});

const RENAME_FOO = docTabId('foo.md');
const RENAME_BAR = docTabId('bar.md');
const RENAME_BAZZ = docTabId('bazz.md');

function seedRenameSession() {
  window.localStorage.setItem(
    localTabSessionStorageKey(window.location.origin),
    JSON.stringify({
      openTabs: [RENAME_FOO, RENAME_BAR],
      pinnedTabIds: [],
      activeDocName: 'foo.md',
      activeTabId: RENAME_FOO,
      updatedAt: new Date('2026-05-16T00:00:00.000Z').toISOString(),
    }),
  );
}

function RenameHarness({ fromDocName, toDocName }: { fromDocName: string; toDocName: string }) {
  const ctx = useDocumentContext();
  return (
    <>
      <span data-testid="open-tabs">{ctx.openTabs.join('|')}</span>
      <span data-testid="visible-tabs">{ctx.visibleTabIds.join('|')}</span>
      <span data-testid="active-tab">{ctx.activeTabId ?? ''}</span>
      <button type="button" onClick={() => ctx.remapTabsForRename([{ fromDocName, toDocName }])}>
        Rename
      </button>
    </>
  );
}

describe('DocumentContext remapTabsForRename — preserves tab position', () => {
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    window.location.hash = '';
  });

  test('renaming an open tab keeps its index in both openTabs and visibleTabIds', async () => {
    seedRenameSession();
    render(<RenameHarness fromDocName="foo.md" toDocName="bazz.md" />, {
      wrapper: ProviderHarness,
    });

    expect(screen.getByTestId('open-tabs').textContent).toBe(`${RENAME_FOO}|${RENAME_BAR}`);
    expect(screen.getByTestId('visible-tabs').textContent).toBe(`${RENAME_FOO}|${RENAME_BAR}`);

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Rename' }));

    expect(screen.getByTestId('open-tabs').textContent).toBe(`${RENAME_BAZZ}|${RENAME_BAR}`);
    expect(screen.getByTestId('visible-tabs').textContent).toBe(`${RENAME_BAZZ}|${RENAME_BAR}`);
  });

  test('renaming the active tab commits the remapped tab id to activeTabId', async () => {
    seedRenameSession();
    render(<RenameHarness fromDocName="foo.md" toDocName="bazz.md" />, {
      wrapper: ProviderHarness,
    });

    expect(screen.getByTestId('active-tab').textContent).toBe(RENAME_FOO);

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Rename' }));

    expect(screen.getByTestId('active-tab').textContent).toBe(RENAME_BAZZ);
  });

  test('renaming a non-active tab leaves activeTabId untouched', async () => {
    seedRenameSession();
    render(<RenameHarness fromDocName="bar.md" toDocName="bazz.md" />, {
      wrapper: ProviderHarness,
    });

    expect(screen.getByTestId('active-tab').textContent).toBe(RENAME_FOO);

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Rename' }));

    expect(screen.getByTestId('active-tab').textContent).toBe(RENAME_FOO);
  });
});
