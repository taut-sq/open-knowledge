
import { afterEach, describe, expect, mock, test } from 'bun:test';
import type { HandoffTarget, InstallState } from '@inkeep/open-knowledge-core';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { DropdownMenu } from '@/components/ui/dropdown-menu';
import type { HandoffDispatchInput } from './useHandoffDispatch';

mock.module('@lingui/react/macro', () => ({
  Trans: ({ children }: { children: ReactNode }) => <>{children}</>,
  useLingui: () => ({
    t: (strings: TemplateStringsArray, ...values: unknown[]) =>
      strings.reduce((acc, part, index) => `${acc}${part}${values[index] ?? ''}`, ''),
  }),
}));

mock.module('@/hooks/use-is-embedded', () => ({ useIsEmbedded: () => false }));

const SKIP_IN_CI = process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true';

const input: HandoffDispatchInput = {
  docContext: { relativePath: 'docs/notes.md' },
  projectDir: '/tmp/project',
  docPath: '/tmp/project/docs/notes.md',
};

const installedStates = {
  'claude-cowork': { installed: true },
  'claude-code': { installed: true },
  codex: { installed: true },
  cursor: { installed: true },
} as unknown as Record<HandoffTarget, InstallState>;

const { OpenInAgentMenuContent } = await import('./OpenInAgentMenu');
const { TerminalLaunchProvider } = await import('./TerminalLaunchContext');

async function renderContent(opts: {
  launcher: ((input: HandoffDispatchInput) => void) | null;
  menuInput?: HandoffDispatchInput | null;
}) {
  const menuInput = 'menuInput' in opts ? opts.menuInput : input;
  render(
    <TerminalLaunchProvider value={opts.launcher ? { launchInTerminal: opts.launcher } : null}>
      <DropdownMenu open>
        <OpenInAgentMenuContent
          input={menuInput ?? null}
          states={installedStates}
          dispatch={() => Promise.resolve({ ok: true as const })}
          isElectronHost
          autoOpen
        />
      </DropdownMenu>
    </TerminalLaunchProvider>,
  );
}

describe.skipIf(SKIP_IN_CI)('Open-in-Agent "Claude CLI" row', () => {
  afterEach(() => {
    cleanup();
  });

  test('renders the terminal row when the launcher is available (desktop)', async () => {
    await renderContent({ launcher: () => {} });
    expect(screen.getByTestId('open-in-agent-terminal')).toBeTruthy();
  });

  test('hides the terminal row when no launcher is available (web host)', async () => {
    await renderContent({ launcher: null });
    expect(screen.queryByTestId('open-in-agent-terminal')).toBeNull();
  });

  test('clicking the row hands the handoff input to the launcher', async () => {
    const calls: HandoffDispatchInput[] = [];
    await renderContent({ launcher: (i) => calls.push(i) });
    await userEvent.click(screen.getByTestId('open-in-agent-terminal'));
    expect(calls).toEqual([input]);
  });

  test('the row does not launch when there is no handoff input', async () => {
    const calls: HandoffDispatchInput[] = [];
    await renderContent({ launcher: (i) => calls.push(i), menuInput: null });
    await userEvent.click(screen.getByTestId('open-in-agent-terminal'));
    expect(calls).toEqual([]);
  });
});
