import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { MouseEventHandler, ReactNode } from 'react';
import type { FileEntry } from './file-tree-utils';

type MenuItemProps = {
  children?: ReactNode;
  disabled?: boolean;
  onSelect?: () => void;
  [key: string]: unknown;
};

function PassThrough({ children }: { children?: ReactNode }) {
  return <>{children}</>;
}

function MenuItem({ children, disabled, onSelect, variant: _variant, ...props }: MenuItemProps) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={() => onSelect?.()}
      {...props}
    >
      {children}
    </button>
  );
}

function MenuContent({ children }: { children?: ReactNode }) {
  return <div role="menu">{children}</div>;
}

function MenuSeparator() {
  return <hr />;
}

const toastSuccessMock = mock(() => {});
const toastErrorMock = mock(() => {});
const addPageMock = mock(() => {});
const openTargetMock = mock(() => {});
const notifySidebarFileSelectedMock = mock(() => {});
const closeTabsMock = mock(() => {});
const closeDocumentMock = mock(() => {});
const closeAndClearForRenameMock = mock(async () => {});
const remapTabsForRenameMock = mock(() => {});
const dispatchHandoffMock = mock(async () => ({ ok: true as const }));

const DOCUMENTS: FileEntry[] = [
  {
    kind: 'folder',
    path: 'notes',
    size: 0,
    modified: '2026-05-18T00:00:00.000Z',
  },
  {
    kind: 'document',
    docName: 'notes/source',
    docExt: '.md',
    size: 1,
    modified: '2026-05-18T00:00:00.000Z',
  },
];

interface FetchCall {
  url: string;
  init?: RequestInit;
}

class StubItem {
  expanded = false;
  selected = false;

  constructor(
    readonly path: string,
    private readonly directory: boolean,
  ) {}

  getPath() {
    return this.path;
  }

  isDirectory() {
    return this.directory;
  }

  isExpanded() {
    return this.expanded;
  }

  expand() {
    this.expanded = true;
  }

  collapse() {
    this.expanded = false;
  }

  isSelected() {
    return this.selected;
  }

  select() {
    this.selected = true;
  }

  deselect() {
    this.selected = false;
  }

  focus() {}
}

class StubModel {
  focusedPath: string | null = null;
  selectedPaths: string[] = [];
  items = new Map<string, StubItem>();
  startRenaming = mock(() => {});

  getFocusedPath() {
    return this.focusedPath;
  }

  getFocusedIndex() {
    return -1;
  }

  getItemHeight() {
    return 24;
  }

  getSelectedPaths() {
    return this.selectedPaths;
  }

  getItem(path: string) {
    return this.items.get(path) ?? null;
  }

  resetPaths(paths: string[]) {
    this.items.clear();
    for (const path of paths) {
      this.items.set(path, new StubItem(path, path.endsWith('/')));
    }
  }

  subscribe() {
    return () => {};
  }

  onMutation() {
    return () => {};
  }

  isSearchOpen() {
    return false;
  }

  add(path: string) {
    this.items.set(path, new StubItem(path, path.endsWith('/')));
  }

  move() {}
  remove() {}
}

let model = new StubModel();
let menuItem: { kind: 'file' | 'directory'; path: string };
let closeMenuMock = mock(() => {});
let createResponse: unknown;
let createStatus = 200;
let createGate: Promise<void> | null = null;
let createFetchError: Error | null = null;
let fetchCalls: FetchCall[] = [];
let folderTemplates: Array<{
  name: string;
  title?: string;
  path: string;
  source_folder: string;
  scope: 'local' | 'inherited';
}> = [];
let folderConfigStatus: 'ready' | 'loading' = 'ready';
let lastFolderConfigPath: string | null = null;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function createPageCalls() {
  return fetchCalls.filter((call) => call.url === '/api/create-page');
}

function makeFetchMock() {
  return mock(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    fetchCalls.push({ url, init });
    if (url.startsWith('/api/documents')) return jsonResponse({ documents: DOCUMENTS });
    if (url === '/api/workspace') {
      return jsonResponse({
        contentDir: '/tmp/open-knowledge',
        pathSeparator: '/',
        symlinkResolved: true,
      });
    }
    if (url === '/api/create-page') {
      if (createGate) await createGate;
      if (createFetchError) throw createFetchError;
      return jsonResponse(createResponse, createStatus);
    }
    if (url === '/api/create-folder') {
      return jsonResponse(createResponse, createStatus);
    }
    if (url === '/api/delete-path') return jsonResponse({ ok: true }, 200);
    if (url === '/api/rename-path') return jsonResponse({ renamed: [] }, 200);
    throw new Error(`unexpected fetch: ${url}`);
  });
}

mock.module('sonner', () => ({
  toast: {
    success: toastSuccessMock,
    error: toastErrorMock,
  },
}));

mock.module('next-themes', () => ({
  useTheme: () => ({ resolvedTheme: 'light' }),
}));

mock.module('@/editor/DocumentContext', () => ({
  useDocumentContext: () => ({
    activeDocName: 'notes/source',
    activeTarget: { kind: 'doc', target: 'notes/source', docName: 'notes/source' },
    closeTabs: closeTabsMock,
    closeDocument: closeDocumentMock,
    closeAndClearDocument: closeAndClearForRenameMock,
    closeAndClearForDelete: closeAndClearForRenameMock,
    closeAndClearForRename: closeAndClearForRenameMock,
    getPoolActiveDocName: () => 'notes/source',
    poolHas: () => false,
    isNewTabActive: false,
    openTarget: openTargetMock,
    prewarm: () => {},
    remapTabsForRename: remapTabsForRenameMock,
  }),
}));

mock.module('@/components/PageListContext', () => ({
  usePageList: () => ({ addPage: addPageMock }),
}));

mock.module('./ui/sidebar', () => ({
  useSidebar: () => ({ notifySidebarFileSelected: notifySidebarFileSelectedMock }),
}));

mock.module('@/lib/config-provider', () => ({
  useConfigContext: () => ({
    okignoreBinding: null,
    projectLocalBinding: null,
    merged: null,
  }),
}));

mock.module('@/hooks/use-folder-config', () => ({
  useFolderConfig: (folderPath: string | null) => {
    lastFolderConfigPath = folderPath;
    if (folderConfigStatus === 'loading') {
      return { state: { status: 'loading' }, refresh: () => {} };
    }
    return {
      state: {
        status: 'ready',
        data: { folder: { templates_available: folderTemplates } },
      },
      refresh: () => {},
    };
  },
}));

mock.module('./handoff/useInstalledAgents', () => ({
  useInstalledAgents: () => ({ states: {} }),
}));

mock.module('./handoff/useHandoffDispatch', () => ({
  buildFolderHandoffInput: () => null,
  buildHandoffInput: () => null,
  useHandoffDispatch: () => ({ dispatch: dispatchHandoffMock }),
}));

mock.module('./handoff/OpenInAgentContextSubmenu', () => ({
  OpenInAgentContextSubmenu: () => null,
}));

mock.module('./sidebar-hover-prewarm', () => ({
  cancelHoverPrewarm: () => {},
  scheduleHoverPrewarm: () => {},
}));

mock.module('@/components/ui/button', () => ({
  Button: ({ children, ...props }: { children?: ReactNode; [key: string]: unknown }) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
}));

mock.module('@/components/ui/dialog', () => ({
  Dialog: PassThrough,
}));

mock.module('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: PassThrough,
  DropdownMenuCheckboxItem: MenuItem,
  DropdownMenuContent: MenuContent,
  DropdownMenuItem: MenuItem,
  DropdownMenuSeparator: MenuSeparator,
  DropdownMenuSub: PassThrough,
  DropdownMenuSubContent: MenuContent,
  DropdownMenuSubTrigger: MenuItem,
  DropdownMenuTrigger: PassThrough,
}));

mock.module('@/components/ui/skeleton', () => ({
  Skeleton: ({ className }: { className?: string }) => <span className={className} />,
}));

mock.module('@/components/DeleteConfirmationDialog', () => ({
  DeleteConfirmationDialog: () => null,
}));

mock.module('@/components/NewItemDialog', () => ({
  NewItemDialog: () => null,
}));

mock.module('@/components/TrashFailureModal', () => ({
  TrashFailureModal: () => null,
  coerceTrashFailureReason: (reason: string) => reason,
}));

mock.module('@/components/use-selection-mirror', () => ({
  asDirectoryHandle: (item: StubItem | null) => (item?.isDirectory() ? item : null),
  useSelectionMirror: () => {},
}));

mock.module('@pierre/trees', () => ({
  FILE_TREE_TAG_NAME: 'ok-file-tree',
  themeToTreeStyles: () => ({}),
}));

mock.module('@pierre/trees/react', () => ({
  useFileTree: () => ({ model }),
  FileTree: ({
    renderContextMenu,
    onClickCapture,
    onMouseMove,
    onMouseLeave,
  }: {
    renderContextMenu?: (
      item: typeof menuItem,
      context: { close: typeof closeMenuMock },
    ) => ReactNode;
    onClickCapture?: MouseEventHandler<HTMLDivElement>;
    onMouseMove?: MouseEventHandler<HTMLDivElement>;
    onMouseLeave?: MouseEventHandler<HTMLDivElement>;
  }) => (
    <div
      data-testid="fake-pierre-tree"
      role="tree"
      onClickCapture={onClickCapture}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
    >
      <button type="button" data-testid="tree-focus-target">
        Focus target
      </button>
      {renderContextMenu?.(menuItem, { close: closeMenuMock })}
    </div>
  ),
}));

const { FileTree } = await import('./FileTree');

function renderFileTree() {
  return render(<FileTree />);
}

describe('FileTree startCreating addPage symmetry', () => {
  let consoleWarnSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    model = new StubModel();
    menuItem = { kind: 'directory', path: 'notes/' };
    closeMenuMock = mock(() => {});
    createResponse = {
      docName: 'notes/Untitled',
      path: 'notes/Untitled.md',
    };
    createStatus = 200;
    createGate = null;
    createFetchError = null;
    folderTemplates = [];
    folderConfigStatus = 'ready';
    lastFolderConfigPath = null;
    fetchCalls = [];
    globalThis.fetch = makeFetchMock() as unknown as typeof fetch;
    toastSuccessMock.mockClear();
    toastErrorMock.mockClear();
    addPageMock.mockClear();
    openTargetMock.mockClear();
    notifySidebarFileSelectedMock.mockClear();
    consoleWarnSpy = spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    consoleWarnSpy.mockRestore();
  });

  test('folder context-menu New File registers the created docName via addPage exactly once', async () => {
    const user = userEvent.setup();
    renderFileTree();

    const newFile = await screen.findByRole('menuitem', { name: /new file/i });
    fetchCalls = [];
    await user.click(newFile);

    await waitFor(() => expect(createPageCalls()).toHaveLength(1));
    const [call] = createPageCalls();
    expect(call?.url).toBe('/api/create-page');
    expect(call?.init?.method).toBe('POST');
    await waitFor(() => expect(addPageMock).toHaveBeenCalledWith('notes/Untitled'));
    expect(addPageMock).toHaveBeenCalledTimes(1);
  });

  test('folder context-menu New Folder does NOT register an addPage call', async () => {
    createResponse = {
      kind: 'folder',
      path: 'notes/SubDir',
    };
    const user = userEvent.setup();
    renderFileTree();

    const newFolder = await screen.findByRole('menuitem', { name: /new folder/i });
    fetchCalls = [];
    await user.click(newFolder);

    await waitFor(() => expect(fetchCalls.some((c) => c.url === '/api/create-folder')).toBe(true));
    expect(addPageMock).not.toHaveBeenCalled();
  });

  test('folder context-menu hides "New from template" when the folder has no templates', async () => {
    folderTemplates = [];
    renderFileTree();

    expect(await screen.findByRole('menuitem', { name: /new file/i })).toBeTruthy();
    expect(screen.queryByRole('menuitem', { name: /new from template/i })).toBeNull();
  });

  test('folder context-menu shows "New from template" when the folder has templates', async () => {
    folderTemplates = [
      {
        name: 'daily',
        title: 'Daily',
        path: 'notes/.ok/templates/daily.md',
        source_folder: 'notes',
        scope: 'local',
      },
    ];
    renderFileTree();

    expect(await screen.findByRole('menuitem', { name: /new from template/i })).toBeTruthy();
    expect(lastFolderConfigPath).toBe('notes');
  });

  test('folder context-menu keeps "New from template" while folder config is loading', async () => {
    folderConfigStatus = 'loading';
    folderTemplates = [];
    renderFileTree();

    expect(await screen.findByRole('menuitem', { name: /new from template/i })).toBeTruthy();
  });
});
