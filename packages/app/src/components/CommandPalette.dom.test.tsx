import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { renderLinguiTemplate } from '@/test-utils/lingui-mock';

type CommandDialogProps = {
  children?: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  title?: string;
  description?: string;
  className?: string;
  commandProps?: Record<string, unknown>;
  transition?: unknown;
  placement?: unknown;
};
type CommandItemProps = {
  children?: ReactNode;
  disabled?: boolean;
  onSelect?: () => void;
  value?: string;
  [key: string]: unknown;
};

let activeDocName: string | null = 'docs/active';
let activeTarget: { kind: 'doc'; docName: string } | null = { kind: 'doc', docName: 'docs/active' };
let requestDocPanelTabCalls: string[] = [];
let seedDialogProps: Array<{ open: boolean }> = [];
let newItemDialogProps: Array<{ open: boolean; kind: string; initialDir: string }> = [];
let createProjectDialogProps: Array<{ open: boolean; bridge: unknown }> = [];
let commandDialogProps: CommandDialogProps[] = [];
let refreshInstallStatesCalls = 0;
const refreshInstallStates = () => {
  refreshInstallStatesCalls += 1;
};
const installedAgentStates = {
  codex: { installed: false },
  'claude-code': { installed: false },
  cursor: { installed: false },
};
const workspaceValue = { rootPath: '/workspace' };
let pageListLoading = false;

mock.module('@lingui/react/macro', () => ({
  Trans: ({ children }: { children?: ReactNode }) => <>{children}</>,
  Plural: ({ value, one, other }: { value: number; one: string; other: string }) => (
    <>{(value === 1 ? one : other).replace('#', String(value))}</>
  ),
  useLingui: () => ({ t: renderLinguiTemplate }),
}));

mock.module('@/components/ui/command', () => ({
  CommandDialog: (props: CommandDialogProps) => {
    commandDialogProps.push(props);
    return props.open ? (
      <div
        aria-describedby="command-palette-description"
        aria-label={props.title}
        className={props.className}
        role="dialog"
      >
        <p id="command-palette-description">{props.description}</p>
        {props.children}
      </div>
    ) : null;
  },
  CommandEmpty: ({ children }: { children?: ReactNode }) => <div role="status">{children}</div>,
  CommandGroup: ({ children, heading }: { children?: ReactNode; heading?: ReactNode }) => (
    <section aria-label={typeof heading === 'string' ? heading : undefined}>
      {heading ? <h2>{heading}</h2> : null}
      {children}
    </section>
  ),
  CommandInput: ({
    onValueChange,
    value,
    ...props
  }: {
    onValueChange?: (value: string) => void;
    value?: string;
    [key: string]: unknown;
  }) => (
    <input
      {...props}
      aria-label="Command search"
      value={value}
      onChange={(event) => onValueChange?.(event.currentTarget.value)}
    />
  ),
  CommandItem: ({ children, disabled, onSelect, ...props }: CommandItemProps) => (
    <button type="button" role="option" disabled={disabled} onClick={() => onSelect?.()} {...props}>
      {children}
    </button>
  ),
  CommandList: ({ children, ...props }: { children?: ReactNode; [key: string]: unknown }) => (
    <div role="listbox" {...props}>
      {children}
    </div>
  ),
  CommandShortcut: ({ children }: { children?: ReactNode }) => (
    <span data-testid="command-shortcut">{children}</span>
  ),
}));

mock.module('@/components/doc-panel-events', () => ({
  requestDocPanelTab: (tab: string) => {
    requestDocPanelTabCalls.push(tab);
  },
}));

mock.module('@/components/NewItemDialog', () => ({
  NewItemDialog: (props: { open: boolean; kind: string; initialDir: string }) => {
    newItemDialogProps.push(props);
    return (
      <div data-kind={props.kind} data-open={String(props.open)} data-testid="new-item-dialog" />
    );
  },
}));

mock.module('@/components/SeedDialog', () => ({
  SeedDialog: (props: { open: boolean }) => {
    seedDialogProps.push(props);
    return <div data-open={String(props.open)} data-testid="seed-dialog" />;
  },
}));

mock.module('@/components/CreateProjectDialog', () => ({
  CreateProjectDialog: (props: { open: boolean; bridge: unknown }) => {
    createProjectDialogProps.push(props);
    return (
      <div
        data-open={String(props.open)}
        data-has-bridge={String(props.bridge !== null)}
        data-testid="create-project-dialog"
      />
    );
  },
}));

mock.module('@/components/PageListContext', () => ({
  usePageList: () => ({
    pages: new Set<string>(),
    pageTitles: new Map<string, string>(),
    pageMeta: new Map<string, unknown>(),
    folderPaths: new Set<string>(),
    filePaths: new Set<string>(),
    loading: pageListLoading,
  }),
}));

mock.module('@/editor/DocumentContext', () => ({
  useDocumentContext: () => ({
    activeDocName,
    activeTarget,
  }),
}));

mock.module('@/lib/use-workspace', () => ({
  useWorkspace: () => workspaceValue,
}));

mock.module('./handoff/useInstalledAgents', () => ({
  useInstalledAgents: () => ({
    states: installedAgentStates,
    refresh: refreshInstallStates,
  }),
}));

mock.module('./handoff/useHandoffDispatch', () => ({
  buildHandoffInput: ({ docName, workspace }: { docName: string | null; workspace: unknown }) =>
    docName && workspace ? { docName, workspace } : null,
  useHandoffDispatch: () => ({
    dispatch: mock(() => Promise.resolve()),
  }),
}));

mock.module('@/components/command-palette-tag-search', () => ({
  TAG_QUERY_PREFIX: 'tag:',
  parseTagPaletteQuery: () => ({ kind: 'normal' }),
  filterTagList: () => [],
  fetchTagsList: mock(() => Promise.resolve([])),
  fetchDocsForTag: mock(() => Promise.resolve([])),
}));

function recent(name: string, path = `/projects/${name.toLowerCase()}`) {
  return { name, path: path.replaceAll(' ', '-') };
}

function createBridge() {
  return {
    config: {
      projectName: 'Current Project',
      projectPath: '/projects/current',
    },
    project: {
      listRecent: mock(() =>
        Promise.resolve([
          recent('Current', '/projects/current'),
          recent('Alpha', '/projects/alpha'),
          recent('Omega', '/archive/omega-project'),
        ]),
      ),
      open: mock(() => Promise.resolve()),
    },
    dialog: {
      openFolder: mock(() => Promise.resolve('/chosen/folder')),
    },
    navigator: {
      open: mock(() => Promise.resolve()),
    },
  };
}

async function renderPalette({
  bridge = createBridge(),
  docName = 'docs/active',
}: {
  bridge?: ReturnType<typeof createBridge> | null;
  docName?: string | null;
} = {}) {
  activeDocName = docName;
  activeTarget = docName ? { kind: 'doc', docName } : null;
  const onOpenChange = mock(() => {});
  const { CommandPalette } = await import('./CommandPalette');
  render(<CommandPalette bridge={bridge as never} open={true} onOpenChange={onOpenChange} />);
  await waitFor(() => expect(screen.getByRole('dialog')).not.toBeNull());
  return { bridge, onOpenChange };
}

async function setQuery(value: string) {
  fireEvent.change(screen.getByLabelText('Command search'), { target: { value } });
  await waitFor(() => {
    expect((screen.getByLabelText('Command search') as HTMLInputElement).value).toBe(value);
  });
}

describe('CommandPalette DOM behavior', () => {
  beforeEach(() => {
    cleanup();
    activeDocName = 'docs/active';
    activeTarget = { kind: 'doc', docName: 'docs/active' };
    pageListLoading = false;
    requestDocPanelTabCalls = [];
    seedDialogProps = [];
    newItemDialogProps = [];
    createProjectDialogProps = [];
    commandDialogProps = [];
    refreshInstallStatesCalls = 0;
    window.location.hash = '';
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify({ results: [] }), { status: 200 })),
    ) as never;
  });

  test('hides active-document commands without an active doc and opens the graph panel when one exists', async () => {
    await renderPalette({ bridge: null, docName: null });

    expect(document.body.textContent).not.toContain('No active doc');
    expect(screen.queryByTestId('command-palette-open-graph')).toBeNull();
    expect(screen.queryByText('Open with AI Codex')).toBeNull();

    cleanup();
    await renderPalette({ bridge: null, docName: 'docs/active' });

    fireEvent.click(screen.getByTestId('command-palette-open-graph'));

    expect(requestDocPanelTabCalls).toEqual(['graph']);
  });

  test('routes project commands through runtime bridge entry points and exposes switch-project search tokens', async () => {
    const bridge = createBridge();
    const { onOpenChange } = await renderPalette({ bridge });
    await waitFor(() => expect(bridge.project.listRecent).toHaveBeenCalledTimes(1));
    expect(refreshInstallStatesCalls).toBeGreaterThan(0);

    const switchProject = screen.getByTestId('command-palette-switch-project');
    expect(switchProject.textContent).toContain('Switch project');
    expect(switchProject.textContent).toMatch(/⌘⇧N|Ctrl Shift P/);
    expect(switchProject.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
    expect(document.body.textContent).not.toContain('Start fresh in a new folder');

    fireEvent.click(switchProject);
    await waitFor(() => expect(bridge.navigator.open).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByTestId('command-palette-open-folder'));
    await waitFor(() => {
      expect(bridge.project.open).toHaveBeenCalledWith({
        path: '/chosen/folder',
        target: 'new-window',
        entryPoint: 'pick-existing',
      });
    });

    fireEvent.click(screen.getByTestId('command-palette-recent-/projects/alpha'));
    await waitFor(() => {
      expect(bridge.project.open).toHaveBeenCalledWith({
        path: '/projects/alpha',
        target: 'new-window',
        entryPoint: 'recents',
      });
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);

    await setQuery('navigator');
    expect(screen.getByTestId('command-palette-switch-project')).not.toBeNull();

    await setQuery('manage');
    expect(screen.queryByTestId('command-palette-switch-project')).toBeNull();
  });

  test('settings command is searchable by preferences/config, closes the palette, and routes through the canonical hash', async () => {
    const { onOpenChange } = await renderPalette({ bridge: null });

    await setQuery('preferences');
    const settingsByPreference = screen.getByTestId('command-palette-settings');
    expect(settingsByPreference.textContent).toContain('Settings');
    expect(settingsByPreference.textContent).toMatch(/⌘,|Ctrl ,/);
    expect(settingsByPreference.querySelector('svg[aria-hidden="true"]')).not.toBeNull();

    await setQuery('config');
    expect(screen.getByTestId('command-palette-settings')).not.toBeNull();

    fireEvent.click(screen.getByTestId('command-palette-settings'));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    const { SETTINGS_OPEN_HASH } = await import('@/lib/use-settings-route');
    expect(window.location.hash).toBe(SETTINGS_OPEN_HASH);
  });

  test('new-project command is desktop-only, searchable by scaffold tokens, and opens CreateProjectDialog', async () => {
    await renderPalette({ bridge: null });

    await setQuery('new project');
    expect(screen.queryByTestId('command-palette-new-project')).toBeNull();
    expect(screen.queryByTestId('create-project-dialog')).toBeNull();

    cleanup();
    const bridge = createBridge();
    const { onOpenChange } = await renderPalette({ bridge });

    await setQuery('scaffold');
    const newProject = screen.getByTestId('command-palette-new-project');
    expect(newProject.textContent).toContain('New project');

    fireEvent.click(newProject);

    expect(onOpenChange).toHaveBeenCalledWith(false);
    await waitFor(() => {
      expect(screen.getByTestId('create-project-dialog').getAttribute('data-open')).toBe('true');
    });
    expect(createProjectDialogProps.at(-1)?.bridge).toBe(bridge);
  });

  test('starter-pack command is searchable, participates in empty-state aggregation, and opens SeedDialog after closing', async () => {
    const { onOpenChange } = await renderPalette({ bridge: null });

    await setQuery('scaffold');
    expect(screen.queryByText('No matching commands.')).toBeNull();
    const seedItem = screen.getByTestId('command-palette-initialize-starter-pack');
    expect(seedItem.textContent).toContain('Initialize starter pack');
    expect(seedItem.querySelector('svg[aria-hidden="true"]')).not.toBeNull();

    fireEvent.click(seedItem);

    expect(onOpenChange).toHaveBeenCalledWith(false);
    await waitFor(() => {
      expect(screen.getByTestId('seed-dialog').getAttribute('data-open')).toBe('true');
    });
    expect(seedDialogProps.at(-1)?.open).toBe(true);
  });

  test('CommandDialog receives no transition or placement prop from CommandPalette', async () => {
    await renderPalette();

    expect(commandDialogProps.at(-1)?.transition).toBeUndefined();
    expect(commandDialogProps.at(-1)?.placement).toBeUndefined();
  });

  test('during cold load, a typed query shows a preparing state and never fires the body search', async () => {
    pageListLoading = true;
    await renderPalette({ bridge: null });

    await setQuery('rename');

    await waitFor(() =>
      expect(screen.getByTestId('command-palette-search-preparing')).not.toBeNull(),
    );
    expect(screen.queryByText('Search failed.')).toBeNull();
    expect(screen.queryByText('No matching commands.')).toBeNull();

    const fetchMock = globalThis.fetch as unknown as { mock: { calls: unknown[][] } };
    expect(fetchMock.mock.calls.some((call) => call[0] === '/api/search')).toBe(false);
  });

  test('once the page list has loaded, a typed query fires the body search with no preparing state', async () => {
    await renderPalette({ bridge: null });

    await setQuery('rename');

    await waitFor(() => {
      const fetchMock = globalThis.fetch as unknown as { mock: { calls: unknown[][] } };
      expect(fetchMock.mock.calls.some((call) => call[0] === '/api/search')).toBe(true);
    });
    expect(screen.queryByTestId('command-palette-search-preparing')).toBeNull();
  });

  test('a query typed during cold load auto-fires the body search once the page list loads', async () => {
    pageListLoading = true;
    const { CommandPalette } = await import('./CommandPalette');
    const onOpenChange = mock(() => {});
    const { rerender } = render(
      <CommandPalette bridge={null} open={true} onOpenChange={onOpenChange} />,
    );
    await waitFor(() => expect(screen.getByRole('dialog')).not.toBeNull());

    await setQuery('rename');
    await waitFor(() =>
      expect(screen.getByTestId('command-palette-search-preparing')).not.toBeNull(),
    );
    const fetchMock = globalThis.fetch as unknown as { mock: { calls: unknown[][] } };
    expect(fetchMock.mock.calls.some((call) => call[0] === '/api/search')).toBe(false);

    pageListLoading = false;
    rerender(<CommandPalette bridge={null} open={true} onOpenChange={onOpenChange} />);

    await waitFor(() =>
      expect(fetchMock.mock.calls.some((call) => call[0] === '/api/search')).toBe(true),
    );
    expect(screen.queryByTestId('command-palette-search-preparing')).toBeNull();
  });
});

describe('NavigationItem path subtitle', () => {
  beforeEach(() => {
    cleanup();
  });

  test('a file result row renders its path so same-named siblings are distinguishable', async () => {
    const { NavigationItem } = await import('./CommandPalette');
    const fileA = {
      kind: 'file' as const,
      path: 'reports/q3/data.csv',
      name: 'data.csv',
      title: 'data.csv',
      score: 1,
    };
    const fileB = {
      kind: 'file' as const,
      path: 'exports/legacy/data.csv',
      name: 'data.csv',
      title: 'data.csv',
      score: 1,
    };
    render(
      <>
        <NavigationItem entry={fileA as never} query="data.csv" onSelect={() => {}} />
        <NavigationItem entry={fileB as never} query="data.csv" onSelect={() => {}} />
      </>,
    );

    const rowA = screen.getByTestId('command-palette-nav-file-reports/q3/data.csv');
    const rowB = screen.getByTestId('command-palette-nav-file-exports/legacy/data.csv');
    expect(rowA.textContent).toContain('reports/q3/data.csv');
    expect(rowB.textContent).toContain('exports/legacy/data.csv');
  });
});
