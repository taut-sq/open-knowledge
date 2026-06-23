import { afterEach, describe, expect, mock, test } from 'bun:test';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TooltipProvider } from '@/components/ui/tooltip';
import { type TerminalTabDescriptor, TerminalTabStrip } from './TerminalTabStrip';

const SESSIONS: readonly TerminalTabDescriptor[] = [
  { id: 's1', label: 'Terminal 1' },
  { id: 's2', label: 'Terminal 2' },
  { id: 's3', label: 'Terminal 3' },
];

function renderStrip(props?: {
  sessions?: readonly TerminalTabDescriptor[];
  activeSessionId?: string;
}) {
  const onSelect = mock((_id: string) => {});
  const onTabActivate = mock((_id: string) => {});
  const onNew = mock(() => {});
  const onClose = mock((_id: string) => {});
  render(
    <TooltipProvider>
      <TerminalTabStrip
        sessions={props?.sessions ?? SESSIONS}
        activeSessionId={props?.activeSessionId ?? 's1'}
        onSelect={onSelect}
        onTabActivate={onTabActivate}
        onNew={onNew}
        onClose={onClose}
      />
    </TooltipProvider>,
  );
  return { onSelect, onTabActivate, onNew, onClose };
}

describe('TerminalTabStrip', () => {
  afterEach(() => cleanup());

  test('renders one tab per session inside a labeled tablist', () => {
    renderStrip();
    const tablist = screen.getByRole('tablist', { name: 'Terminal sessions' });
    const tabs = within(tablist).getAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent)).toEqual(['Terminal 1', 'Terminal 2', 'Terminal 3']);
  });

  test('marks the active session as selected and leaves others unselected', () => {
    renderStrip({ activeSessionId: 's2' });
    expect(screen.getByRole('tab', { name: 'Terminal 2' }).getAttribute('aria-selected')).toBe(
      'true',
    );
    expect(screen.getByRole('tab', { name: 'Terminal 1' }).getAttribute('aria-selected')).toBe(
      'false',
    );
    expect(screen.getByRole('tab', { name: 'Terminal 3' }).getAttribute('aria-selected')).toBe(
      'false',
    );
  });

  test('is fully controlled: clicking a tab reports onSelect without changing its own selection', async () => {
    const user = userEvent.setup();
    const { onSelect } = renderStrip({ activeSessionId: 's1' });

    await user.click(screen.getByRole('tab', { name: 'Terminal 2' }));

    expect(onSelect).toHaveBeenCalledWith('s2');
    expect(screen.getByRole('tab', { name: 'Terminal 1' }).getAttribute('aria-selected')).toBe(
      'true',
    );
    expect(screen.getByRole('tab', { name: 'Terminal 2' }).getAttribute('aria-selected')).toBe(
      'false',
    );
  });

  test('reports onTabActivate with the session id on click, but not on arrow-key nav', async () => {
    const user = userEvent.setup();
    const { onTabActivate } = renderStrip({ activeSessionId: 's1' });

    await user.click(screen.getByRole('tab', { name: 'Terminal 2' }));
    expect(onTabActivate).toHaveBeenCalledWith('s2');

    onTabActivate.mockClear();
    act(() => screen.getByRole('tab', { name: 'Terminal 2' }).focus());
    await user.keyboard('{ArrowRight}');
    expect(onTabActivate).not.toHaveBeenCalled();
  });

  test('arrow-key navigation reports the next session via onSelect', async () => {
    const user = userEvent.setup();
    const { onSelect } = renderStrip({ activeSessionId: 's1' });
    const first = screen.getByRole('tab', { name: 'Terminal 1' });

    act(() => {
      first.focus();
    });
    expect(document.activeElement).toBe(first);
    await user.keyboard('{ArrowRight}');

    expect(onSelect).toHaveBeenCalledWith('s2');
  });

  test('the new-terminal control reports onNew and never onSelect', async () => {
    const user = userEvent.setup();
    const { onNew, onSelect } = renderStrip();

    await user.click(screen.getByRole('button', { name: 'New terminal' }));

    expect(onNew).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled();
  });

  test('a tab close control reports onClose with that session id only', async () => {
    const user = userEvent.setup();
    const { onClose, onSelect, onNew } = renderStrip({ activeSessionId: 's1' });

    await user.click(screen.getByRole('button', { name: 'Close Terminal 2' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledWith('s2');
    expect(onSelect).not.toHaveBeenCalled();
    expect(onNew).not.toHaveBeenCalled();
  });

  test('every icon-only control exposes an accessible name', () => {
    renderStrip();
    expect(screen.getByRole('button', { name: 'New terminal' })).toBeDefined();
    for (const label of ['Terminal 1', 'Terminal 2', 'Terminal 3']) {
      expect(screen.getByRole('button', { name: `Close ${label}` })).toBeDefined();
    }
  });
});
