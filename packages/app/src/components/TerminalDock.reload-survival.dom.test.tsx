
import { afterEach, describe, expect, mock, test } from 'bun:test';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { useEffect, useRef, useState } from 'react';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { OkDesktopBridge } from '@/lib/desktop-bridge-types';
import { requestActiveTerminalInput } from './handoff/terminal-input-events';

const TERMINAL_PANEL_ID = 'terminal-dock-panel';

// biome-ignore lint/suspicious/noExplicitAny: captured mock-component props
let terminalPanelProps: Record<string, any> | null = null;
const panelHandle = {
  collapse: mock(() => terminalPanelProps?.onResize?.({ asPercentage: 0, inPixels: 0 })),
  expand: mock(() => terminalPanelProps?.onResize?.({ asPercentage: 40, inPixels: 240 })),
  resize: mock(() => {}),
};
const sharedPanelRef: { current: unknown } = { current: panelHandle };

mock.module('react-resizable-panels', () => ({ usePanelRef: () => sharedPanelRef }));
mock.module('@/components/ui/resizable', () => ({
  // biome-ignore lint/suspicious/noExplicitAny: test stub
  ResizablePanelGroup: ({ children }: any) => <div>{children}</div>,
  // biome-ignore lint/suspicious/noExplicitAny: test stub
  ResizablePanel: (props: any) => {
    if (props.id === TERMINAL_PANEL_ID) terminalPanelProps = props;
    return <div id={props.id}>{props.children}</div>;
  },
  // biome-ignore lint/suspicious/noExplicitAny: test stub
  ResizableHandle: ({ onPointerDown }: any) => <div onPointerDown={onPointerDown} />,
}));

mock.module('./TerminalGate', () => ({
  // biome-ignore lint/suspicious/noExplicitAny: test stub
  TerminalGate: ({ adoptPtyId, onPtyId }: any) => {
    const onPtyIdRef = useRef(onPtyId);
    useEffect(() => {
      onPtyIdRef.current = onPtyId;
    });
    useEffect(() => {
      if (adoptPtyId != null) onPtyIdRef.current?.(adoptPtyId);
      return () => onPtyIdRef.current?.(null);
    }, [adoptPtyId]);
    return <span data-testid="terminal-session" className="xterm-helper-textarea" tabIndex={-1} />;
  },
}));

mock.module('@/lib/terminal-height-store', () => ({
  getInitialTerminalHeight: () => 240,
  writeTerminalHeight: () => {},
}));

const { TerminalDock } = await import('./TerminalDock');
const { TerminalSessionsHost } = await import('./TerminalSessionsHost');

function ReloadHarness({
  bridge,
  visible,
  launch = null,
}: {
  bridge: OkDesktopBridge;
  visible: boolean;
  launch?: { prompt: string; cli: string; nonce: number } | null;
}) {
  const [bottomContainer, setBottomContainer] = useState<HTMLDivElement | null>(null);
  return (
    <TooltipProvider>
      <TerminalDock
        visible={visible}
        onVisibleChange={() => {}}
        dockPosition="bottom"
        onBottomContainer={setBottomContainer}
        onEditorRegion={() => {}}
      >
        <div data-testid="editor-child" />
      </TerminalDock>
      <TerminalSessionsHost
        bridge={bridge}
        visible={visible}
        onVisibleChange={() => {}}
        // biome-ignore lint/suspicious/noExplicitAny: test launch shape
        launch={launch as any}
        container={bottomContainer}
        isShowing={visible && bottomContainer != null}
        onRequestEditorFocus={() => {}}
        dockPosition="bottom"
        onToggleDock={() => {}}
      />
    </TooltipProvider>
  );
}

function makeSurvivingMainBridge(preExisting: ReadonlyArray<{ ptyId: string }>) {
  let freshCounter = 0;
  const create = mock(async () => {
    freshCounter += 1;
    return { ok: true as const, ptyId: `fresh-pty-${freshCounter}` };
  });
  const kill = mock(async (_id: string) => {});
  const input = mock((_id: string, _d: string) => {});
  const listLive = mock(async () => preExisting);
  const bridge = {
    onMenuAction: () => () => {},
    editor: { notifyViewMenuStateChanged: () => {} },
    terminal: {
      create,
      kill,
      input,
      list: listLive,
      listSessions: listLive,
      getSessions: listLive,
      snapshotSessions: listLive,
      restoreSessions: listLive,
    },
  } as unknown as OkDesktopBridge;
  return { bridge, create, input, listLive };
}

function renderDock(bridge: OkDesktopBridge, visible: boolean) {
  return render(<ReloadHarness bridge={bridge} visible={visible} />);
}

describe('issue #351 — the terminal dock rehydrates surviving sessions after a renderer reload', () => {
  afterEach(() => {
    cleanup();
    terminalPanelProps = null;
  });

  test('recovers a tab per surviving session instead of seeding a single fresh one', async () => {
    const { bridge } = makeSurvivingMainBridge([{ ptyId: 'pty-1' }, { ptyId: 'pty-2' }]);

    renderDock(bridge, true);

    await waitFor(() => expect(screen.getAllByTestId('terminal-session')).toHaveLength(2), {
      timeout: 2000,
    });

    expect(document.querySelectorAll('[data-terminal-session][data-state="active"]')).toHaveLength(
      1,
    );
  });

  function dockUi(bridge: OkDesktopBridge, visible: boolean) {
    return <ReloadHarness bridge={bridge} visible={visible} />;
  }

  test('zero survivors settles so a later open still cold-starts exactly one tab', async () => {
    const { bridge, listLive } = makeSurvivingMainBridge([]);
    const { rerender } = render(dockUi(bridge, false));
    await waitFor(() => expect(listLive).toHaveBeenCalled());
    await act(async () => {});
    expect(screen.queryAllByTestId('terminal-session')).toHaveLength(0);
    rerender(dockUi(bridge, true));
    await waitFor(() => expect(screen.getAllByTestId('terminal-session')).toHaveLength(1), {
      timeout: 2000,
    });
  });

  test('a rejecting list() still settles so a later open cold-starts (no hang on IPC error)', async () => {
    const listLive = mock(async () => {
      throw new Error('ipc boom');
    });
    const bridge = {
      onMenuAction: () => () => {},
      editor: { notifyViewMenuStateChanged: () => {} },
      terminal: {
        create: mock(async () => ({ ok: true as const, ptyId: 'fresh-pty-1' })),
        kill: mock(async (_id: string) => {}),
        list: listLive,
        listSessions: listLive,
        getSessions: listLive,
        snapshotSessions: listLive,
        restoreSessions: listLive,
      },
    } as unknown as OkDesktopBridge;
    const { rerender } = render(dockUi(bridge, false));
    await waitFor(() => expect(listLive).toHaveBeenCalled());
    await act(async () => {});
    rerender(dockUi(bridge, true));
    await waitFor(() => expect(screen.getAllByTestId('terminal-session')).toHaveLength(1), {
      timeout: 2000,
    });
  });

  test('an Ask-AI selection reuses a reload-rehydrated (adopted) session via a direct PTY write', async () => {
    const { bridge, create, input } = makeSurvivingMainBridge([{ ptyId: 'pty-1' }]);
    render(dockUi(bridge, true));

    await waitFor(() => expect(screen.getAllByTestId('terminal-session')).toHaveLength(1), {
      timeout: 2000,
    });
    await act(async () => {}); // flush the onPtyId report into the host's reuse map

    await act(async () => {
      requestActiveTerminalInput('explain');
    });

    await waitFor(() => expect(input).toHaveBeenCalledWith('pty-1', 'explain'));
    expect(screen.getAllByTestId('terminal-session')).toHaveLength(1);
    expect(create).not.toHaveBeenCalled();
  });
});
