import { afterEach, describe, expect, mock, test } from 'bun:test';
import type { HandoffTarget, InstallState } from '@inkeep/open-knowledge-core';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { act } from 'react';
import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from '@/components/ui/context-menu';
import { renderLinguiTemplate } from '@/test-utils/lingui-mock';
import type { HandoffDispatchInput } from './useHandoffDispatch';

mock.module('@lingui/core/macro', () => ({
  t: renderLinguiTemplate,
}));

mock.module('@lingui/react/macro', () => ({
  Trans: ({ children }: { children: ReactNode }) => <>{children}</>,
  useLingui: () => ({ t: renderLinguiTemplate }),
}));

mock.module('next-themes', () => ({
  useTheme: () => ({ resolvedTheme: 'light' }),
}));

mock.module('sonner', () => ({
  toast: {
    error: mock(() => {}),
    success: mock(() => {}),
  },
}));

mock.module('@/lib/config-context', () => ({
  useConfigContext: () => ({
    merged: { appearance: { preview: { autoOpen: true } } },
  }),
}));

mock.module('@/hooks/use-is-embedded', () => ({
  useIsEmbedded: () => false,
}));

const readyInput: HandoffDispatchInput = {
  docContext: null,
  docPath: '',
  projectDir: '/project',
};

function installStates(
  overrides: Partial<Record<HandoffTarget, InstallState>> = {},
): Record<HandoffTarget, InstallState> {
  return {
    'claude-code': { installed: false, lastChecked: 1 },
    'claude-cowork': { installed: true, lastChecked: 1 },
    codex: { installed: true, lastChecked: 1 },
    cursor: { installed: null, lastChecked: 1 },
    ...overrides,
  };
}

async function renderSubmenu({
  input = readyInput,
  states = installStates(),
}: {
  input?: HandoffDispatchInput | null;
  states?: Record<HandoffTarget, InstallState>;
} = {}) {
  const { OpenInAgentEmptySpaceSubmenu } = await import('./OpenInAgentEmptySpaceSubmenu');
  const dispatchCalls: Array<{ input: HandoffDispatchInput; target: HandoffTarget }> = [];
  const dispatch = mock(async (target: HandoffTarget, nextInput: HandoffDispatchInput) => {
    dispatchCalls.push({ input: nextInput, target });
    return { ok: true as const };
  });

  render(
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <button type="button">Project files</button>
      </ContextMenuTrigger>
      <ContextMenuContent forceMount={true}>
        <OpenInAgentEmptySpaceSubmenu dispatch={dispatch} input={input} installStates={states} />
      </ContextMenuContent>
    </ContextMenu>,
  );

  await act(async () => {
    fireEvent.contextMenu(screen.getByText('Project files'));
    await Promise.resolve();
  });

  return { dispatch, dispatchCalls };
}

async function openEmptySpaceSubmenu() {
  const trigger = screen.getByRole('menuitem', { name: 'Open with AI' });
  await userEvent.hover(trigger);
  await waitFor(() => {
    expect(document.querySelector('[data-slot="context-menu-sub-content"]')).toBeTruthy();
  });
  return trigger;
}

describe('OpenInAgentEmptySpaceSubmenu runtime behavior', () => {
  afterEach(() => cleanup());

  test('renders as a ContextMenu submenu, filters visible installed targets, and dispatches rows', async () => {
    const { dispatchCalls } = await renderSubmenu();
    const trigger = await openEmptySpaceSubmenu();

    expect(trigger.getAttribute('data-slot')).toBe('context-menu-sub-trigger');
    expect(document.querySelector('[data-slot="dropdown-menu-sub-trigger"]') === null).toBe(true);
    expect(screen.getByTestId('empty-space-open-in-codex')).toBeTruthy();
    expect(screen.queryByTestId('empty-space-open-in-claude-cowork') === null).toBe(true);
    expect(screen.queryByTestId('empty-space-open-in-cursor') === null).toBe(true);
    expect(screen.queryByTestId('empty-space-open-in-claude-web-fallback') === null).toBe(true);

    await userEvent.click(screen.getByRole('menuitem', { name: 'Open with AI Codex' }));

    expect(dispatchCalls).toEqual([{ input: readyInput, target: 'codex' }]);
  });

  test('keeps rows disabled with a No workspace label while input is missing', async () => {
    const { dispatch } = await renderSubmenu({ input: null });
    await openEmptySpaceSubmenu();

    const codex = screen.getByRole('menuitem', { name: 'Open with AI Codex, No workspace' });
    expect(codex.getAttribute('data-disabled')).toBe('');
    expect(codex.textContent).toContain('No workspace');

    await userEvent.click(codex);

    expect(dispatch).not.toHaveBeenCalled();
  });

  test('hides the whole submenu when nothing can render (no installed targets, no terminal launcher)', async () => {
    await renderSubmenu({
      states: installStates({
        'claude-code': { installed: false, lastChecked: 1 },
        'claude-cowork': { installed: false, lastChecked: 1 },
        codex: { installed: false, lastChecked: 1 },
        cursor: { installed: false, lastChecked: 1 },
      }),
    });
    expect(screen.queryByRole('menuitem', { name: 'Open with AI' }) === null).toBe(true);
  });
});
