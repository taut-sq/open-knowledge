import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { act, cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { OkDesktopBridge } from '@/lib/desktop-bridge-types';

type ConsentState = { enabled: boolean | null; synced: boolean };
type Writer = ((enabled: boolean) => { ok: true } | { ok: false; error: string }) | null;

let consentState: ConsentState = { enabled: null, synced: true };
let writerImpl: Writer = null;
const writerCalls: boolean[] = [];
const toastErrors: string[] = [];

mock.module('@lingui/react/macro', () => ({
  Trans: ({ children }: { children: ReactNode }) => <>{children}</>,
  useLingui: () => ({
    t: (strings: TemplateStringsArray, ...values: unknown[]) =>
      strings.reduce((out, part, index) => `${out}${part}${values[index] ?? ''}`, ''),
  }),
}));

mock.module('sonner', () => ({
  toast: { error: (message: string) => toastErrors.push(message) },
}));

mock.module('@/hooks/use-terminal-enabled', () => ({
  useTerminalConsentState: () => consentState,
  useTerminalEnabledWriter: () => writerImpl,
}));

// biome-ignore lint/suspicious/noExplicitAny: captured mock-component props, asserted structurally
let lastPanelProps: Record<string, any> | null = null;
mock.module('./TerminalPanel', () => ({
  // biome-ignore lint/suspicious/noExplicitAny: test stub
  TerminalPanel: (props: any) => {
    lastPanelProps = props;
    return <span data-testid="terminal-panel" />;
  },
}));

const { TerminalGate } = await import('./TerminalGate');

const bridge = {} as OkDesktopBridge;

function renderGate() {
  return render(<TerminalGate bridge={bridge} />);
}

function notice() {
  return screen.queryByRole('region', { name: 'Terminal disabled' });
}

describe('TerminalGate', () => {
  beforeEach(() => {
    consentState = { enabled: null, synced: true };
    writerImpl = (enabled) => {
      writerCalls.push(enabled);
      return { ok: true };
    };
    writerCalls.length = 0;
    toastErrors.length = 0;
    lastPanelProps = null;
  });
  afterEach(() => cleanup());

  test('default (enabled === null) mounts the terminal — available with no dialog', async () => {
    consentState = { enabled: null, synced: true };
    renderGate();
    expect(await screen.findByTestId('terminal-panel')).toBeTruthy();
    expect(notice()).toBeNull();
  });

  test('forwards onClose, onKill, and the launch intent to the mounted terminal panel', async () => {
    const onClose = mock(() => {});
    const onKill = mock(() => {});
    const launch = { prompt: 'work on docs/notes', nonce: 1 };
    consentState = { enabled: null, synced: true };
    render(<TerminalGate bridge={bridge} onClose={onClose} onKill={onKill} launch={launch} />);
    await screen.findByTestId('terminal-panel');
    expect(lastPanelProps?.onClose).toBe(onClose);
    expect(lastPanelProps?.onKill).toBe(onKill);
    expect(lastPanelProps?.launch).toBe(launch);
  });

  test('enabled === true mounts the terminal', async () => {
    consentState = { enabled: true, synced: true };
    renderGate();
    expect(await screen.findByTestId('terminal-panel')).toBeTruthy();
    expect(notice()).toBeNull();
  });

  test('enabled === false shows the not-enabled notice; no shell', () => {
    consentState = { enabled: false, synced: true };
    renderGate();
    expect(screen.getByRole('region', { name: 'Terminal disabled' })).toBeTruthy();
    expect(screen.queryByTestId('terminal-panel')).toBeNull();
  });

  test('does not flash the shell before the binding syncs (cold start)', () => {
    consentState = { enabled: null, synced: false };
    renderGate();
    expect(screen.queryByTestId('terminal-panel')).toBeNull();
    expect(notice()).toBeNull();
  });

  test('re-enabling from the notice grants via the writer, then mounts the terminal', async () => {
    consentState = { enabled: false, synced: true };
    const view = render(<TerminalGate bridge={bridge} />);
    act(() => screen.getByRole('button', { name: 'Enable terminal' }).click());
    expect(writerCalls).toEqual([true]);
    consentState = { enabled: true, synced: true };
    view.rerender(<TerminalGate bridge={bridge} />);
    expect(await screen.findByTestId('terminal-panel')).toBeTruthy();
    expect(notice()).toBeNull();
  });

  test('re-enable with no writer yet surfaces an actionable toast, no crash', () => {
    consentState = { enabled: false, synced: true };
    writerImpl = null;
    renderGate();
    act(() => screen.getByRole('button', { name: 'Enable terminal' }).click());
    expect(writerCalls).toEqual([]);
    expect(toastErrors.length).toBe(1);
  });

  test('a writer that fails to persist surfaces a toast and never mounts the shell', () => {
    consentState = { enabled: false, synced: true };
    writerImpl = (enabled) => {
      writerCalls.push(enabled);
      return { ok: false, error: 'ENOSPC: no space left on device' };
    };
    renderGate();
    act(() => screen.getByRole('button', { name: 'Enable terminal' }).click());

    expect(writerCalls).toEqual([true]);
    expect(toastErrors.length).toBe(1);
    expect(toastErrors[0]).toContain('ENOSPC');
    expect(screen.queryByTestId('terminal-panel')).toBeNull();
  });
});
