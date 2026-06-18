import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { OkDesktopBridge } from '@/lib/desktop-bridge-types';

const TERMINAL_PANEL_ID = 'terminal-dock-panel';

type Size = { asPercentage: number; inPixels: number };
// biome-ignore lint/suspicious/noExplicitAny: captured mock-component props, asserted structurally
let terminalPanelProps: Record<string, any> | null = null;
// biome-ignore lint/suspicious/noExplicitAny: captured TerminalGate props (onClose), asserted structurally
let lastTerminalPanelProps: Record<string, any> | null = null;
let written: number[] = [];

const panelHandle = {
  collapse: mock(() => terminalPanelProps?.onResize?.({ asPercentage: 0, inPixels: 0 })),
  expand: mock(() => terminalPanelProps?.onResize?.({ asPercentage: 40, inPixels: 240 })),
  resize: mock((s: string) => {
    const px = Number.parseInt(s, 10) || 0;
    terminalPanelProps?.onResize?.({ asPercentage: px > 0 ? 30 : 0, inPixels: px });
  }),
};
const sharedPanelRef: { current: unknown } = { current: panelHandle };

mock.module('react-resizable-panels', () => ({
  usePanelRef: () => sharedPanelRef,
}));

mock.module('@/components/ui/resizable', () => ({
  // biome-ignore lint/suspicious/noExplicitAny: test stub
  ResizablePanelGroup: ({ children, orientation }: any) => (
    <div data-testid="rrp-group" data-orientation={orientation}>
      {children}
    </div>
  ),
  // biome-ignore lint/suspicious/noExplicitAny: test stub
  ResizablePanel: (props: any) => {
    if (props.id === TERMINAL_PANEL_ID) terminalPanelProps = props;
    return (
      <div
        id={props.id}
        data-panel={props.id ?? 'editor'}
        data-inert={props.inert ? 'true' : undefined}
      >
        {props.children}
      </div>
    );
  },
  // biome-ignore lint/suspicious/noExplicitAny: test stub
  ResizableHandle: ({ onPointerDown }: any) => (
    <div data-testid="terminal-resize-handle" onPointerDown={onPointerDown} />
  ),
}));

mock.module('./TerminalGate', () => ({
  // biome-ignore lint/suspicious/noExplicitAny: test stub
  TerminalGate: (props: any) => {
    lastTerminalPanelProps = props;
    return <span data-testid="terminal-panel" className="xterm-helper-textarea" tabIndex={-1} />;
  },
}));

mock.module('@/lib/terminal-height-store', () => ({
  getInitialTerminalHeight: () => 240,
  writeTerminalHeight: (px: number) => {
    written.push(px);
  },
}));

const { TerminalDock } = await import('./TerminalDock');

function makeBridge() {
  const menuHandlers: Array<(action: string) => void> = [];
  const viewMenuPushes: Array<{ terminalLive?: boolean }> = [];
  const bridge = {
    onMenuAction(cb: (action: string) => void) {
      menuHandlers.push(cb);
      return () => {
        const index = menuHandlers.indexOf(cb);
        if (index >= 0) menuHandlers.splice(index, 1);
      };
    },
    editor: {
      notifyViewMenuStateChanged(state: { terminalLive?: boolean }) {
        viewMenuPushes.push(state);
      },
    },
  } as unknown as OkDesktopBridge;
  return {
    bridge,
    viewMenuPushes,
    dispatchMenuAction(action: string) {
      for (const cb of menuHandlers) cb(action);
    },
  };
}

function renderDock(visible: boolean) {
  const onVisibleChange = mock((_v: boolean) => {});
  const { bridge, viewMenuPushes, dispatchMenuAction } = makeBridge();
  const ui = (v: boolean) => (
    <TerminalDock bridge={bridge} visible={v} onVisibleChange={onVisibleChange}>
      <div data-testid="editor-child" />
    </TerminalDock>
  );
  const utils = render(ui(visible));
  return {
    ...utils,
    onVisibleChange,
    viewMenuPushes,
    dispatchMenuAction,
    rerender: (v: boolean) => utils.rerender(ui(v)),
  };
}

function editorRegion(): HTMLElement {
  const region = screen.getByTestId('editor-child').parentElement;
  if (region == null) throw new Error('editor region not found');
  return region;
}

describe('TerminalDock', () => {
  beforeEach(() => {
    terminalPanelProps = null;
    lastTerminalPanelProps = null;
    written = [];
    panelHandle.collapse.mockClear();
    panelHandle.resize.mockClear();
    panelHandle.expand.mockClear();
    sharedPanelRef.current = panelHandle;
  });
  afterEach(() => {
    cleanup();
  });

  test('wraps the editor in a vertical group with a collapsible bottom terminal panel', () => {
    renderDock(false);

    expect(screen.getByTestId('editor-child')).toBeTruthy();
    expect(screen.getByTestId('rrp-group').getAttribute('data-orientation')).toBe('vertical');
    expect(screen.getByTestId('terminal-resize-handle')).toBeTruthy();

    expect(terminalPanelProps?.collapsible).toBe(true);
    expect(terminalPanelProps?.collapsedSize).toBe(0);
    expect(terminalPanelProps?.minSize).toBe('120px');
    expect(terminalPanelProps?.maxSize).toBe('50%');
    expect(terminalPanelProps?.defaultSize).toBe(0);
    expect(terminalPanelProps?.inert).toBe(true);
  });

  test('does not mount the terminal (no PTY) until first opened, then keeps it mounted on hide', () => {
    const view = renderDock(false);
    expect(screen.queryByTestId('terminal-panel')).toBeNull();

    act(() => view.rerender(true));
    expect(screen.getByTestId('terminal-panel')).toBeTruthy();

    act(() => view.rerender(false));
    expect(screen.getByTestId('terminal-panel')).toBeTruthy();
  });

  test('opening restores the persisted height; hiding collapses the panel', () => {
    const view = renderDock(false);
    panelHandle.resize.mockClear();
    panelHandle.collapse.mockClear();

    act(() => view.rerender(true));
    expect(panelHandle.resize).toHaveBeenCalledWith('240px');

    act(() => view.rerender(false));
    expect(panelHandle.collapse).toHaveBeenCalledTimes(1);
  });

  test('reflects collapsed state via inert as the panel opens and closes', () => {
    const view = renderDock(true);
    expect(terminalPanelProps?.inert).toBeFalsy();

    act(() => view.rerender(false));
    expect(terminalPanelProps?.inert).toBe(true);
  });

  test('persists height only on user drag, never on an imperative open', async () => {
    const view = renderDock(false);

    act(() => view.rerender(true));
    expect(written).toEqual([]);

    fireEvent.pointerDown(screen.getByTestId('terminal-resize-handle'));
    act(() => terminalPanelProps?.onResize?.({ asPercentage: 35, inPixels: 300 } as Size));
    await waitFor(() => expect(written).toContain(300));
    fireEvent.pointerUp(window);
  });

  test('drag-collapsing the panel reports the hidden state to the parent', () => {
    const view = renderDock(true);

    fireEvent.pointerDown(screen.getByTestId('terminal-resize-handle'));
    act(() => terminalPanelProps?.onResize?.({ asPercentage: 0, inPixels: 0 } as Size));

    expect(view.onVisibleChange).toHaveBeenCalledWith(false);
    fireEvent.pointerUp(window);
  });

  test('returns focus to the editor when the terminal collapses (no keyboard strand)', () => {
    const view = renderDock(true);
    const term = screen.getByTestId('terminal-panel');
    act(() => term.focus());
    expect(document.getElementById(TERMINAL_PANEL_ID)?.contains(document.activeElement)).toBe(true);

    act(() => view.rerender(false));

    expect(document.activeElement).toBe(editorRegion());
  });

  test('focuses the terminal on reveal so the user can type immediately', () => {
    const view = renderDock(true);
    const term = screen.getByTestId('terminal-panel');

    act(() => view.rerender(false));
    expect(document.activeElement).toBe(editorRegion());

    act(() => view.rerender(true));
    expect(document.activeElement).toBe(term);
  });

  test('does not pass an Escape handler to the gate — Escape reaches the shell, ⌘J is the exit', () => {
    renderDock(true);
    screen.getByTestId('terminal-panel'); // mounted

    expect(lastTerminalPanelProps?.onEscape).toBeUndefined();
  });

  test('the "Close terminal" affordance collapses the dock and returns focus to the editor', () => {
    const view = renderDock(true);
    act(() => screen.getByTestId('terminal-panel').focus());

    act(() => lastTerminalPanelProps?.onClose?.());

    expect(view.onVisibleChange).toHaveBeenCalledWith(false);
    expect(document.activeElement).toBe(editorRegion());
  });

  test('the trash/kill affordance unmounts the terminal, hides the dock, and returns focus', () => {
    const view = renderDock(true);
    act(() => screen.getByTestId('terminal-panel').focus());

    act(() => lastTerminalPanelProps?.onKill?.());

    expect(screen.queryByTestId('terminal-panel')).toBeNull();
    expect(view.onVisibleChange).toHaveBeenCalledWith(false);
    expect(document.activeElement).toBe(editorRegion());
    expect(view.viewMenuPushes.at(-1)).toEqual({ terminalLive: false });
  });

  test('reopening after a kill spawns a fresh terminal — unlike collapse, the session is gone', () => {
    const view = renderDock(true);

    act(() => lastTerminalPanelProps?.onKill?.());
    act(() => view.rerender(false));
    expect(screen.queryByTestId('terminal-panel')).toBeNull();

    act(() => view.rerender(true));
    expect(screen.getByTestId('terminal-panel')).toBeTruthy();
  });

  test('the Terminal menu "Kill Terminal" action unmounts the terminal and hides the dock', () => {
    const view = renderDock(true);
    expect(screen.getByTestId('terminal-panel')).toBeTruthy();

    act(() => view.dispatchMenuAction('kill-terminal'));

    expect(screen.queryByTestId('terminal-panel')).toBeNull();
    expect(view.onVisibleChange).toHaveBeenCalledWith(false);
    expect(view.viewMenuPushes.at(-1)).toEqual({ terminalLive: false });
  });

  test('reports terminal liveness to the View menu — true once mounted, false after a kill', () => {
    const view = renderDock(false);
    expect(view.viewMenuPushes.at(-1)).toEqual({ terminalLive: false });

    act(() => view.rerender(true));
    expect(view.viewMenuPushes.at(-1)).toEqual({ terminalLive: true });

    act(() => view.dispatchMenuAction('kill-terminal'));
    expect(view.viewMenuPushes.at(-1)).toEqual({ terminalLive: false });
  });
});
