import { afterEach, describe, expect, mock, test } from 'bun:test';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import type { HandoffDispatchInput } from './useHandoffDispatch';

const input: HandoffDispatchInput = {
  docContext: { relativePath: 'docs/notes.md' },
  projectDir: '/tmp/project',
  docPath: '/tmp/project/docs/notes.md',
};

const installedStates = {
  'claude-cowork': { installed: true, lastChecked: 1 },
  'claude-code': { installed: true, lastChecked: 1 },
  codex: { installed: true, lastChecked: 1 },
  cursor: { installed: true, lastChecked: 1 },
};

mock.module('@lingui/react/macro', () => ({
  Trans: ({ children }: { children: ReactNode }) => <>{children}</>,
  useLingui: () => ({
    t: (strings: TemplateStringsArray, ...values: unknown[]) =>
      strings.reduce((acc, part, index) => `${acc}${part}${values[index] ?? ''}`, ''),
  }),
}));

mock.module('./useInstalledAgents', () => ({
  useInstalledAgents: () => ({ states: installedStates, refresh: () => Promise.resolve() }),
}));

mock.module('./useHandoffDispatch', () => ({
  useHandoffDispatch: () => ({ dispatch: () => Promise.resolve({ ok: true as const }) }),
}));

mock.module('@/lib/config-context', () => ({
  useConfigContext: () => ({ merged: { appearance: { preview: { autoOpen: true } } } }),
}));

mock.module('@/hooks/use-is-embedded', () => ({ useIsEmbedded: () => false }));

mock.module('./OpenInAgentMenuItem', () => ({ TargetIcon: () => null }));

const { OpenInAgentMenu } = await import('./OpenInAgentMenu');
const { TerminalLaunchProvider } = await import('./TerminalLaunchContext');

async function renderMenu(opts: {
  launcher: ((input: HandoffDispatchInput) => void) | null;
  menuInput?: HandoffDispatchInput | null;
}) {
  const menuInput = 'menuInput' in opts ? opts.menuInput : input;
  render(
    <TerminalLaunchProvider value={opts.launcher ? { launchInTerminal: opts.launcher } : null}>
      <OpenInAgentMenu input={menuInput ?? null} />
    </TerminalLaunchProvider>,
  );
}

async function openMenu() {
  await userEvent.click(screen.getByTestId('open-in-agent-trigger'));
  await waitFor(() => {
    expect(screen.getByTestId('open-in-agent-menu')).toBeTruthy();
  });
}

describe('Open-with-AI "Claude CLI" row', () => {
  afterEach(() => {
    cleanup();
  });

  test('renders the terminal row when the launcher is available (desktop)', async () => {
    await renderMenu({ launcher: () => {} });
    await openMenu();
    expect(screen.getByTestId('open-in-agent-terminal')).toBeTruthy();
  });

  test('hides the terminal row when no launcher is available (web host)', async () => {
    await renderMenu({ launcher: null });
    await openMenu();
    expect(screen.queryByTestId('open-in-agent-terminal')).toBeNull();
  });

  test('clicking the row hands the bare handoff input to the launcher', async () => {
    const calls: HandoffDispatchInput[] = [];
    await renderMenu({ launcher: (i) => calls.push(i) });
    await openMenu();
    await userEvent.click(screen.getByTestId('open-in-agent-terminal'));
    expect(calls).toStrictEqual([input]);
  });

  test('typing an instruction threads it onto the launched input', async () => {
    const calls: HandoffDispatchInput[] = [];
    await renderMenu({ launcher: (i) => calls.push(i) });
    await openMenu();
    await userEvent.type(screen.getByTestId('open-in-agent-instruction'), 'Add error handling');
    await userEvent.click(screen.getByTestId('open-in-agent-terminal'));
    expect(calls).toStrictEqual([{ ...input, instruction: 'Add error handling' }]);
  });

  test('the trigger is disabled when there is no handoff input', async () => {
    await renderMenu({ launcher: () => {}, menuInput: null });
    const trigger = screen.getByTestId('open-in-agent-trigger') as HTMLButtonElement;
    expect(trigger.disabled).toBe(true);
  });
});
