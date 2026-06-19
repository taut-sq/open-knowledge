import { afterEach, describe, expect, mock, test } from 'bun:test';
import type { CreateScenario, InstallState } from '@inkeep/open-knowledge-core';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { HandoffDispatchInput } from '@/components/handoff/useHandoffDispatch';
import type { Workspace } from '@/lib/workspace-paths';

mock.module('@lingui/react/macro', () => ({
  Trans: ({ children }: { children: ReactNode }) => <>{children}</>,
  useLingui: () => ({
    t: (strings: TemplateStringsArray, ...values: unknown[]) =>
      strings.reduce((acc, part, index) => `${acc}${part}${values[index] ?? ''}`, ''),
  }),
}));

mock.module('@/lib/config-context', () => ({
  useConfigContext: () => ({ merged: { appearance: { preview: { autoOpen: true } } } }),
}));

let states: Record<string, InstallState> = {};
mock.module('@/components/handoff/useInstalledAgents', () => ({
  useInstalledAgents: () => ({ states, refresh: () => Promise.resolve() }),
}));

let workspaceValue: Workspace | null = null;
mock.module('@/lib/use-workspace', () => ({
  useWorkspace: () => workspaceValue,
}));

mock.module('@/components/handoff/OpenInAgentMenuItem', () => ({
  TargetIcon: ({ id }: { id: string }) => (
    <svg data-testid={`target-icon-${id}`} aria-hidden="true" />
  ),
}));

type MenuChild = {
  children?: ReactNode;
  disabled?: boolean;
  onSelect?: () => void;
  [key: string]: unknown;
};
mock.module('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: MenuChild) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: MenuChild) => <>{children}</>,
  DropdownMenuContent: ({ children, ...props }: MenuChild) => (
    <div role="menu" {...props}>
      {children}
    </div>
  ),
  DropdownMenuGroup: ({ children }: MenuChild) => <>{children}</>,
  DropdownMenuItem: ({ children, disabled, onSelect, ...props }: MenuChild) => (
    <button type="button" role="menuitem" disabled={disabled} onClick={onSelect} {...props}>
      {children}
    </button>
  ),
  DropdownMenuLabel: ({ children, ...props }: MenuChild) => <div {...props}>{children}</div>,
  DropdownMenuSeparator: () => <hr data-testid="menu-separator" />,
}));

const installedAll: Record<string, InstallState> = {
  'claude-code': { installed: true },
  codex: { installed: true },
  cursor: { installed: true },
};

const launchCalls: HandoffDispatchInput[] = [];

const { CreatePromptComposer } = await import('./CreatePromptComposer');
const { TerminalLaunchProvider } = await import('@/components/handoff/TerminalLaunchContext');

async function renderComposer(
  opts: { withTerminal: boolean; scenario?: CreateScenario } = { withTerminal: true },
) {
  const value = opts.withTerminal
    ? { launchInTerminal: (i: HandoffDispatchInput) => launchCalls.push(i) }
    : null;
  render(
    <TerminalLaunchProvider value={value}>
      <CreatePromptComposer scenario={opts.scenario ?? 'new-project'} />
    </TerminalLaunchProvider>,
  );
  await waitFor(() => {
    expect(screen.getByTestId('create-with-agent-menu')).toBeTruthy();
  });
}

describe('CreatePromptComposer Desktop / Terminal sections', () => {
  afterEach(() => {
    cleanup();
    launchCalls.length = 0;
    states = {};
    workspaceValue = null;
  });

  test('renders Desktop and Terminal sections with the CLI launch row when a launcher is present', async () => {
    states = { ...installedAll };
    workspaceValue = { contentDir: '/tmp/project', pathSeparator: '/' };
    await renderComposer({ withTerminal: true });

    expect(screen.getByText('Desktop')).toBeTruthy();
    expect(screen.getByText('Terminal')).toBeTruthy();
    expect(screen.getByTestId('create-with-claude-cli')).toBeTruthy();
    expect(screen.queryByTestId('menu-separator')).not.toBeNull();
  });

  test('omits the Terminal section (label, row, separator) on the web host while keeping Desktop', async () => {
    states = { ...installedAll };
    workspaceValue = { contentDir: '/tmp/project', pathSeparator: '/' };
    await renderComposer({ withTerminal: false });

    expect(screen.getByText('Desktop')).toBeTruthy();
    expect(screen.queryByText('Terminal')).toBeNull();
    expect(screen.queryByTestId('create-with-claude-cli')).toBeNull();
    expect(screen.queryByTestId('menu-separator')).toBeNull();
  });

  test('selecting the Terminal Claude row switches the button to CLI mode; Create launches with the typed brief', async () => {
    states = { ...installedAll };
    workspaceValue = { contentDir: '/tmp/project', pathSeparator: '/' };
    await renderComposer({ withTerminal: true, scenario: 'new-project' });

    fireEvent.change(screen.getByLabelText('Describe the project you want to create'), {
      target: { value: 'Build a competitor wiki' },
    });

    fireEvent.click(screen.getByTestId('create-with-claude-cli'));
    await waitFor(() => {
      expect(screen.getByTestId('create-with-agent').textContent).toContain(
        'Create with Claude CLI',
      );
    });
    expect(launchCalls).toEqual([]);

    fireEvent.click(screen.getByTestId('create-with-agent'));
    expect(launchCalls).toEqual([
      {
        docContext: null,
        createDescription: 'Build a competitor wiki',
        createScenario: 'new-project',
        projectDir: '/tmp/project',
        docPath: '',
      },
    ]);
  });

  test('CLI mode does not launch when the workspace is unresolved', async () => {
    states = { ...installedAll };
    workspaceValue = null; // buildCreateHandoffInput returns null until the workspace resolves.
    await renderComposer({ withTerminal: true });

    fireEvent.click(screen.getByTestId('create-with-claude-cli'));
    await waitFor(() => {
      expect(screen.getByTestId('create-with-agent').textContent).toContain(
        'Create with Claude CLI',
      );
    });
    fireEvent.click(screen.getByTestId('create-with-agent'));
    expect(launchCalls).toEqual([]);
  });

  test('Desktop selection items set the default and do not launch the terminal', async () => {
    states = { ...installedAll };
    workspaceValue = { contentDir: '/tmp/project', pathSeparator: '/' };
    await renderComposer({ withTerminal: true });

    fireEvent.click(screen.getByTestId('create-agent-option-codex'));

    await waitFor(() => {
      expect(screen.getByTestId('create-with-agent').textContent).toContain('Create with Codex');
    });
    expect(launchCalls).toEqual([]);
  });

  test('the Terminal row shows visible "Claude" with accessible name "Claude CLI"', async () => {
    states = { ...installedAll };
    workspaceValue = { contentDir: '/tmp/project', pathSeparator: '/' };
    await renderComposer({ withTerminal: true });

    const row = screen.getByTestId('create-with-claude-cli');
    expect(row.textContent).toBe('Claude');
    expect(row.getAttribute('aria-label')).toBe('Claude CLI');
  });

  test('Cmd+Enter in CLI mode launches the terminal with the typed brief', async () => {
    states = { ...installedAll };
    workspaceValue = { contentDir: '/tmp/project', pathSeparator: '/' };
    await renderComposer({ withTerminal: true, scenario: 'new-project' });

    const textarea = screen.getByLabelText('Describe the project you want to create');
    fireEvent.change(textarea, { target: { value: 'Build a wiki' } });
    fireEvent.click(screen.getByTestId('create-with-claude-cli')); // enter CLI mode
    await waitFor(() => {
      expect(screen.getByTestId('create-with-agent').textContent).toContain(
        'Create with Claude CLI',
      );
    });

    fireEvent.keyDown(textarea, { key: 'Enter', metaKey: true });
    expect(launchCalls).toEqual([
      {
        docContext: null,
        createDescription: 'Build a wiki',
        createScenario: 'new-project',
        projectDir: '/tmp/project',
        docPath: '',
      },
    ]);
  });

  test('selecting a Desktop agent after CLI reverts the button and does not launch', async () => {
    states = { ...installedAll };
    workspaceValue = { contentDir: '/tmp/project', pathSeparator: '/' };
    await renderComposer({ withTerminal: true });

    fireEvent.click(screen.getByTestId('create-with-claude-cli')); // enter CLI mode
    await waitFor(() => {
      expect(screen.getByTestId('create-with-agent').textContent).toContain(
        'Create with Claude CLI',
      );
    });

    fireEvent.click(screen.getByTestId('create-agent-option-codex'));
    await waitFor(() => {
      expect(screen.getByTestId('create-with-agent').textContent).toContain('Create with Codex');
    });
    expect(launchCalls).toEqual([]);
  });
});
