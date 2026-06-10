import {
  type Config,
  type ConfigBinding,
  CreateFolderSuccessSchema,
  CreatePageSuccessSchema,
  DeletePathSuccessSchema,
  DocumentListSuccessSchema,
  DuplicatePathSuccessSchema,
  type HandoffOutcome,
  type HandoffTarget,
  humanFormat,
  type InstallState,
  isDocumentOverOpenByteLimit,
  type OkignoreBinding,
  RenamePathSuccessSchema,
  TrashCleanupSuccessSchema,
  WorkspaceSuccessSchema,
} from '@inkeep/open-knowledge-core';
import { plural, t } from '@lingui/core/macro';
import { Trans, useLingui } from '@lingui/react/macro';
import {
  type ContextMenuItem,
  type ContextMenuOpenContext,
  FILE_TREE_TAG_NAME,
  type FileTreeDropResult,
  type FileTreeRenameEvent,
  type FileTree as PierreFileTreeModel,
  themeToTreeStyles,
} from '@pierre/trees';
import { FileTree as PierreFileTree, useFileTree } from '@pierre/trees/react';
import {
  Copy,
  CopyPlus,
  EyeOff,
  FilePlus,
  FolderOpen,
  FolderPlus,
  FoldVertical,
  Pencil,
  SquarePen,
  Terminal,
  Trash2,
  UnfoldVertical,
} from 'lucide-react';
import { __iconNode as botIcon } from 'lucide-react/dist/esm/icons/bot';
import { __iconNode as link2Icon } from 'lucide-react/dist/esm/icons/link-2';
import { useTheme } from 'next-themes';
import {
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type Ref,
  startTransition,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { toast } from 'sonner';
import { DeleteConfirmationDialog } from '@/components/DeleteConfirmationDialog';
import {
  collectTreeFolderPathsFromDocuments,
  computeTreeAncestorPaths,
  computeTreeDropDestinationPath,
  createPagePathFromTreeDestination,
  createTreePlaceholder,
  docNameToTreePath,
  documentsToTreePaths,
  documentsTreePathSignature,
  fileEntryToTreePath,
  folderPathToTreeDirectoryPath,
  normalizeTreePathForKind,
  relativePathForTreeItem,
  treeDirectoryPathToFolderPath,
  treeFilePathToDocName,
  treeItemToTarget,
  treePathSignature,
  treePathToAppPath,
} from '@/components/file-tree-adapter';
import {
  applyExtensionBadges,
  FILE_TREE_EXT_BADGE_CSS,
} from '@/components/file-tree-extension-badge';
import { buildOkignorePatternFromTarget } from '@/components/file-tree-okignore';
import {
  applyDeleteToDocuments,
  applyDuplicateToDocuments,
  applyRenameToDocuments,
  buildTrashAbsPath,
  canonicalizeAssetTargetForDelete,
  type FileTreeTarget,
  planRenameCleanupCalls,
  type RenamedAssetMapping,
  type RenamedDocMapping,
  type RenamedFolderMapping,
  remapActiveDocName,
} from '@/components/file-tree-operations';
import { applyRenameChip, FILE_TREE_RENAME_CHIP_CSS } from '@/components/file-tree-rename-chip';
import {
  getFileExtension,
  validateAndCoerceRenameDestination,
} from '@/components/file-tree-rename-validation';
import { revealActiveRow } from '@/components/file-tree-reveal';
import {
  resolveFileTreeSelection,
  resolveFileTreeSelectionAction,
} from '@/components/file-tree-selection';
import { selectTrashConfirmCopy, trashTargetDisplayName } from '@/components/file-tree-trash-copy';
import {
  type DocumentEntry,
  type FileEntry,
  filterVisibleEntries,
  isAssetEntry,
  isDocumentEntry,
  isFolderEntry,
} from '@/components/file-tree-utils';
import { NewItemDialog } from '@/components/NewItemDialog';
import {
  largeFileNavigationTarget,
  type ResolvedNavigationTarget,
} from '@/components/navigation-targets';
import { usePageList } from '@/components/PageListContext';
import {
  appendPattern,
  parseOkignoreDoc,
  serializeOkignoreDoc,
} from '@/components/settings/okignore-doc';
import {
  coerceTrashFailureReason,
  type TrashFailedTarget,
  TrashFailureModal,
} from '@/components/TrashFailureModal';
import { TemplateMenuRows } from '@/components/template-menu-rows';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { asDirectoryHandle, useSelectionMirror } from '@/components/use-selection-mirror';
import { useDocumentContext } from '@/editor/DocumentContext';
import { captureRenameSnapshots } from '@/editor/editor-cache';
import { assetTabId, docTabId, folderTabId, remapPathForFolderRenames } from '@/editor/editor-tabs';
import { useConflicts } from '@/hooks/use-conflicts';
import { useConfigContext } from '@/lib/config-provider';
import { dispatchOpenInTerminal } from '@/lib/dispatch-open-in-terminal';
import { hashFromAssetPath, hashFromDocName, hashFromFolderPath } from '@/lib/doc-hash';
import { emitDocumentsChanged, subscribeToDocumentsChanged } from '@/lib/documents-events';
import {
  subscribeToFileTreeMenuActionDelete,
  subscribeToFileTreeMenuActionDuplicate,
  subscribeToFileTreeMenuActionRename,
} from '@/lib/file-tree-menu-action-events';
import { parseServerResponse, parseSuccessOrWarn } from '@/lib/parse-server-response';
import { createRefreshScheduler } from '@/lib/refresh-scheduler';
import {
  consumeShowAllStream,
  isNdjsonResponse,
  SHOW_ALL_NDJSON_ACCEPT,
} from '@/lib/show-all-stream';
import { joinWorkspacePath } from '@/lib/workspace-paths';
import { mergeAndPruneRecentLocalAdds } from './file-tree-merge';
import { OpenInAgentContextSubmenu } from './handoff/OpenInAgentContextSubmenu';
import {
  buildFolderHandoffInput,
  buildHandoffInput,
  type HandoffDispatchInput,
  useHandoffDispatch,
} from './handoff/useHandoffDispatch';
import { useInstalledAgents } from './handoff/useInstalledAgents';
import { cancelHoverPrewarm, scheduleHoverPrewarm } from './sidebar-hover-prewarm';
import { useSidebar } from './ui/sidebar';

const MARKDOWN_TREE_EXTENSION_PATTERN = /\.(md|mdx)$/i;

function replaceHashWithoutNavigation(hash: string) {
  if (window.location.hash === hash) return;
  const { pathname, search } = window.location;
  window.history.replaceState(null, '', `${pathname}${search}${hash}`);
}

function parseAlreadyExistsRenamePath(message: string): string | null {
  const match = message.match(/^"(.+)" already exists\.$/);
  return match ? match[1] : null;
}

function markdownTreeExtension(path: string): string | null {
  const match = path.match(MARKDOWN_TREE_EXTENSION_PATTERN);
  return match ? match[0] : null;
}

async function copyToClipboard(text: string, kind: 'full' | 'relative'): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(kind === 'full' ? t`Copied full path` : t`Copied relative path`, {
      description: text,
    });
  } catch (err) {
    console.warn('[FileTree] clipboard write failed:', err);
    toast.error(kind === 'full' ? t`Could not copy full path` : t`Could not copy relative path`);
  }
}

const AGENT_FILE_NAMES = new Set(['agents', 'agent', 'claude', 'skill']);
const LINK_DECORATION_ICON_ID = 'ok-file-tree-link-decoration';
const AGENT_DECORATION_ICON_ID = 'ok-file-tree-agent-decoration';
const MARKDOWN_FILE_ICON_ID = 'ok-file-tree-markdown';
const MARKDOWN_FILE_ICON_VIEWBOX = '0 0 48 48';
const MARKDOWN_FILE_ICON_SYMBOL = `<symbol id="${MARKDOWN_FILE_ICON_ID}" viewBox="${MARKDOWN_FILE_ICON_VIEWBOX}" fill="none" stroke="currentColor" stroke-width="4.62651" stroke-linecap="round" stroke-linejoin="round"><path d="M3.18066 33.4398V13.5603L12.4337 22.8133L21.6867 13.5603V33.4398"/><path d="M38 13.5L38 33"/><path d="M44.8195 26.5L37.8797 33.4398L30.9399 26.5"/></symbol>`;

type IconNode = [string, Record<string, string>][];

function iconNodeToSvg(iconNode: IconNode): string {
  return (
    iconNode
      .map(([tag, { key: _, ...attrs }]) => {
        const attrString = Object.entries(attrs)
          .map(([k, v]) => `${k}="${v}"`)
          .join(' ');
        return `<${tag} ${attrString} />`;
      })
      .join('')
  );
}

function createLucideSpriteSymbol(id: string, iconNode: IconNode): string {
  const symbolContent = iconNodeToSvg(iconNode);
  return `<symbol id="${id}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${symbolContent}</symbol>`;
}

const FILE_TREE_DECORATION_SPRITE_SHEET = `<svg data-icon-sprite aria-hidden="true" width="0" height="0">
  ${createLucideSpriteSymbol(LINK_DECORATION_ICON_ID, link2Icon)}
  ${createLucideSpriteSymbol(AGENT_DECORATION_ICON_ID, botIcon)}
  ${MARKDOWN_FILE_ICON_SYMBOL}
</svg>`;

const FILE_TREE_UNSAFE_CSS = `${FILE_TREE_EXT_BADGE_CSS}\n${FILE_TREE_RENAME_CHIP_CSS}`;

function createFileTreeStyle(resolvedTheme: string | undefined): CSSProperties {
  return {
    ...themeToTreeStyles({
      type: resolvedTheme === 'dark' ? 'dark' : 'light',
      colors: {
        'sideBar.background': 'var(--sidebar)',
        'sideBar.foreground': 'var(--sidebar-foreground)',
        'sideBar.border': 'var(--sidebar-border)',
        'list.activeSelectionBackground': 'var(--sidebar-accent)',
        'list.activeSelectionForeground': 'var(--sidebar-accent-foreground)',
        'list.hoverBackground': 'var(--sidebar-hover)',
        focusBorder: 'var(--color-primary)',
        'input.background': 'var(--input)',
        'input.border': 'var(--border)',
      },
    }),
    '--trees-font-family-override': 'var(--font-sans)',
    '--trees-font-size-override': '0.875rem',
    '--trees-item-padding-x-override': '0.5rem',
    '--trees-padding-inline-override': '0.5rem',
    '--trees-border-radius-override': '0.375rem',
    '--trees-selected-fg': 'var(--color-primary)',
    '--truncate-marker-fade-in-duration': '0s', // render ellipsis without delay
    '--trees-file-icon-color-markdown': 'light-dark(var(--color-gray-400), var(--color-gray-500))',
    '--trees-file-icon-color-image': 'light-dark(var(--color-gray-400), var(--color-gray-500))',
    '--trees-fg-muted': 'light-dark(var(--color-gray-400), var(--color-gray-500))',
  } as CSSProperties;
}

function isAgentTreePath(treePath: string): boolean {
  const name = treePath.split('/').pop()?.replace(/\.md$/i, '').toLowerCase();
  return !!name && AGENT_FILE_NAMES.has(name);
}

interface PendingCreate {
  kind: 'file' | 'folder';
  renamePath: string;
  createdPath: string;
  previousHash: string;
  disposeCommitListener: () => void;
}

interface PendingCreateCleanupOptions {
  updateUi?: boolean;
  restoreLocation?: boolean;
}

interface FileTreeDeleteRequest {
  targets: FileTreeTarget[];
}

interface TrashFailureRequest {
  failed: TrashFailedTarget[];
  originalTargets: FileTreeTarget[];
}

interface WorkspaceInfo {
  contentDir: string;
  pathSeparator: '/' | '\\';
}

function revealInFileManagerLabel(platform: 'darwin' | 'win32' | 'linux'): string {
  if (platform === 'darwin') return t`Reveal in Finder`;
  if (platform === 'win32') return t`Reveal in File Explorer`;
  return t`Open Containing Folder`;
}

function RevealInFileManagerMenuItem({
  item,
  workspace,
  onClose,
}: {
  item: ContextMenuItem;
  workspace: WorkspaceInfo | null;
  onClose: () => void;
}) {
  const { t } = useLingui();
  const bridge = typeof window !== 'undefined' ? window.okDesktop : undefined;
  if (!bridge) return null;
  const platform = bridge.platform;
  const label = revealInFileManagerLabel(platform);
  const hint = !workspace ? t`No workspace` : null;
  const ariaLabel =
    platform === 'darwin'
      ? hint
        ? t`Reveal in Finder, ${hint}`
        : t`Reveal in Finder`
      : platform === 'win32'
        ? hint
          ? t`Reveal in File Explorer, ${hint}`
          : t`Reveal in File Explorer`
        : hint
          ? t`Open Containing Folder, ${hint}`
          : t`Open Containing Folder`;
  return (
    <DropdownMenuItem
      disabled={!workspace}
      onSelect={() => {
        if (!workspace) return;
        onClose();
        const full = joinWorkspacePath(
          workspace.contentDir,
          relativePathForTreeItem(item),
          workspace.pathSeparator,
        );
        void bridge.shell.showItemInFolder(full);
      }}
      aria-label={ariaLabel}
    >
      <FolderOpen aria-hidden="true" />
      <span className="flex-1">{label}</span>
      {hint ? (
        <span aria-hidden="true" className="ml-2 text-muted-foreground text-xs">
          {hint}
        </span>
      ) : null}
    </DropdownMenuItem>
  );
}

function OpenInTerminalMenuItem({
  dirAbsPath,
  onClose,
}: {
  dirAbsPath: string | null;
  onClose: () => void;
}) {
  const { t } = useLingui();
  const bridge = typeof window !== 'undefined' ? window.okDesktop : undefined;
  if (!bridge) return null;
  const hint = dirAbsPath === null ? t`No workspace` : null;
  return (
    <DropdownMenuItem
      disabled={dirAbsPath === null}
      onSelect={() => {
        if (dirAbsPath === null) return;
        onClose();
        void dispatchOpenInTerminal(bridge, dirAbsPath);
      }}
      aria-label={hint ? t`Open in Terminal, ${hint}` : t`Open in Terminal`}
    >
      <Terminal aria-hidden="true" />
      <span className="flex-1">
        <Trans>Open in Terminal</Trans>
      </span>
      {hint ? (
        <span aria-hidden="true" className="ml-2 text-muted-foreground text-xs">
          {hint}
        </span>
      ) : null}
    </DropdownMenuItem>
  );
}

interface FileTreeMenuProps {
  item: ContextMenuItem;
  context: ContextMenuOpenContext;
  anyActionBusy: boolean;
  workspace: WorkspaceInfo | null;
  handoff: {
    readonly installStates: Record<HandoffTarget, InstallState>;
    readonly isElectronHost: boolean;
    readonly dispatch: (
      target: HandoffTarget,
      input: HandoffDispatchInput,
    ) => Promise<HandoffOutcome>;
  };
  model: PierreFileTreeModel;
  okignoreBinding: OkignoreBinding | null;
  /** Project-local config binding for the `Show Hidden Files` / `Show all files`
   *  folder-menu toggles. Patched directly here (mirrors the okignore Hide
   *  flow); `null` during cold-start disables the toggle items. */
  projectLocalBinding: ConfigBinding | null;
  /** Layered config view, source for the two toggle check-states
   *  (`appearance.sidebar.{showHiddenFiles,showAllFiles}`). */
  mergedConfig: Config | null;
  onStartCreating: (kind: 'file' | 'folder', parentDir: string) => void;
  /** Inline create-from-template for the given parent dir + template name —
   *  same inline-rename fast path as `onStartCreating`, seeded from a template.
   *  Drives the folder menu's "New from template" hover submenu. */
  onCreateFromTemplate: (parentDir: string, templateName: string) => void;
  onDuplicate: (target: FileTreeTarget) => void;
  onDelete: (targets: FileTreeTarget[]) => void;
  onExpandSubtree: (treePath: string) => void;
  onCollapseSubtree: (treePath: string) => void;
  folderTreePaths: readonly string[];
  isAsset: boolean;
  /** Authoritative document list — sourced for `docExt` when Pierre's tree
   *  path has lost its extension (post-rename-strip). See `treeItemToTarget`. */
  documents: readonly FileEntry[];
}

function treePathToTarget(treePath: string, documents: readonly FileEntry[]): FileTreeTarget {
  return treeItemToTarget(
    {
      kind: treePath.endsWith('/') ? 'directory' : 'file',
      name: treePath,
      path: treePath,
    },
    documents,
  );
}

function isTreePathInsideFolder(treePath: string, folderTreePath: string): boolean {
  return treePath !== folderTreePath && treePath.startsWith(folderTreePath);
}

function selectedTreePathsToDeleteTargets(
  selectedTreePaths: readonly string[],
  documents: readonly FileEntry[],
): FileTreeTarget[] {
  const uniqueDeletablePaths = [...new Set(selectedTreePaths)];
  const selectedFolderPaths = uniqueDeletablePaths.filter((treePath) => treePath.endsWith('/'));
  return uniqueDeletablePaths
    .filter(
      (treePath) =>
        !selectedFolderPaths.some((folderPath) => isTreePathInsideFolder(treePath, folderPath)),
    )
    .map((treePath) => treePathToTarget(treePath, documents));
}

function isPathAtOrInsideFolder(path: string, folderPath: string): boolean {
  return path === folderPath || path.startsWith(`${folderPath}/`);
}

function isEditableKeyboardTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tagName = target.tagName;
  return (
    tagName === 'INPUT' ||
    tagName === 'TEXTAREA' ||
    tagName === 'SELECT' ||
    target.isContentEditable ||
    target.closest('[contenteditable="true"]') !== null
  );
}

function collectTabsToCloseForDelete(
  targets: readonly FileTreeTarget[],
  documents: readonly FileEntry[],
  folderTreePaths: readonly string[],
): { docNames: Set<string>; folderPaths: Set<string>; assetPaths: Set<string> } {
  const docNames = new Set<string>();
  const folderPaths = new Set<string>();
  const assetPaths = new Set<string>();

  for (const target of targets) {
    if (target.kind === 'file') {
      docNames.add(target.path);
      continue;
    }
    if (target.kind === 'asset') {
      assetPaths.add(target.path);
      continue;
    }

    folderPaths.add(target.path);
    for (const entry of documents) {
      if (isDocumentEntry(entry) && entry.docName.startsWith(`${target.path}/`)) {
        docNames.add(entry.docName);
      } else if (isAssetEntry(entry) && entry.path.startsWith(`${target.path}/`)) {
        assetPaths.add(entry.path);
      }
    }
    for (const treePath of folderTreePaths) {
      const folderPath = treeDirectoryPathToFolderPath(treePath);
      if (isPathAtOrInsideFolder(folderPath, target.path)) {
        folderPaths.add(folderPath);
      }
    }
  }

  return { docNames, folderPaths, assetPaths };
}

function deleteTargetCoversPendingCreate(target: FileTreeTarget, pending: PendingCreate): boolean {
  if (target.kind === 'file') {
    return pending.kind === 'file' && target.path === pending.createdPath;
  }
  if (target.kind === 'asset') return false;
  return isPathAtOrInsideFolder(pending.createdPath, target.path);
}

function FileTreeMenu({
  item,
  context,
  anyActionBusy,
  workspace,
  handoff,
  model,
  okignoreBinding,
  projectLocalBinding,
  mergedConfig,
  onStartCreating,
  onCreateFromTemplate,
  onDuplicate,
  onDelete,
  onExpandSubtree,
  onCollapseSubtree,
  folderTreePaths,
  isAsset,
  documents,
}: FileTreeMenuProps) {
  const { t } = useLingui();
  const target = treeItemToTarget(item, documents);
  const isFolder = item.kind === 'directory';
  const okignoreTarget = target.kind === 'asset' ? null : target;
  const canHide = okignoreTarget !== null && okignoreBinding !== null;
  const hideLabel = isFolder ? t`Hide folder` : t`Hide this file`;
  const showHiddenFiles = mergedConfig?.appearance?.sidebar?.showHiddenFiles ?? false;
  const showAllFiles = mergedConfig?.appearance?.sidebar?.showAllFiles ?? false;
  const canToggleVisibility = projectLocalBinding !== null;
  const selectedTreePaths = model.getSelectedPaths();
  const selectedDeleteTargets = selectedTreePaths.includes(target.treePath)
    ? selectedTreePathsToDeleteTargets(selectedTreePaths, documents)
    : [];
  const deleteTargets = selectedDeleteTargets.length > 1 ? selectedDeleteTargets : [target];
  const deleteCount = deleteTargets.length;
  const deleteLabel = plural(deleteCount, { one: 'Delete', other: 'Delete # Items' });
  const folderAbsPath =
    isFolder && workspace
      ? joinWorkspacePath(
          workspace.contentDir,
          relativePathForTreeItem(item),
          workspace.pathSeparator,
        )
      : null;
  const parentDirAbsPath: string | null = (() => {
    if (!workspace || isFolder) return null;
    const rel = relativePathForTreeItem(item);
    const lastSep = rel.lastIndexOf('/');
    if (lastSep === -1) return workspace.contentDir;
    return joinWorkspacePath(workspace.contentDir, rel.slice(0, lastSep), workspace.pathSeparator);
  })();
  const handoffInput: HandoffDispatchInput | null = isAsset
    ? null
    : isFolder
      ? buildFolderHandoffInput({
          folderRelativePath: relativePathForTreeItem(item),
          workspace,
        })
      : buildHandoffInput({
          docName: treeFilePathToDocName(item.path),
          workspace,
        });

  const closeForInlineSurface = () => context.close({ restoreFocus: false });
  const close = () => context.close();

  const handleShowHiddenFilesToggle = (checked: boolean) => {
    if (projectLocalBinding === null) return;
    const result = projectLocalBinding.patch({
      appearance: { sidebar: { showHiddenFiles: checked } },
    });
    if (!result.ok) {
      console.warn('[FileTree] showHiddenFiles toggle rejected:', humanFormat(result.error));
      toast.error(t`Could not update sidebar settings`, {
        description: humanFormat(result.error),
      });
    }
  };
  const handleShowAllFilesToggle = (checked: boolean) => {
    if (projectLocalBinding === null) return;
    const result = projectLocalBinding.patch({
      appearance: { sidebar: { showAllFiles: checked } },
    });
    if (!result.ok) {
      console.warn('[FileTree] showAllFiles toggle rejected:', humanFormat(result.error));
      toast.error(t`Could not update sidebar settings`, {
        description: humanFormat(result.error),
      });
    }
  };

  let subtreeFolderCount = 0;
  let subtreeExpandedCount = 0;
  if (isFolder) {
    const root = folderPathToTreeDirectoryPath(item.path);
    for (const folderPath of folderTreePaths) {
      if (folderPath === root || folderPath.startsWith(root)) {
        subtreeFolderCount++;
        if (asDirectoryHandle(model.getItem(folderPath))?.isExpanded()) {
          subtreeExpandedCount++;
        }
      }
    }
  }
  const showSubtreeExpandAll = isFolder && subtreeExpandedCount < subtreeFolderCount;
  const showSubtreeCollapseAll = isFolder && subtreeExpandedCount > 0;

  return (
    <DropdownMenu
      open
      modal={false}
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DropdownMenuTrigger asChild>
        <span
          aria-hidden="true"
          data-file-tree-context-menu-root="true"
          className="block size-px"
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        sideOffset={0}
        align="start"
        data-file-tree-context-menu-root="true"
        className="min-w-52"
      >
        {isFolder ? (
          <>
            <DropdownMenuItem
              disabled={anyActionBusy}
              onSelect={() => {
                closeForInlineSurface();
                onStartCreating('file', treeDirectoryPathToFolderPath(item.path));
              }}
            >
              <SquarePen aria-hidden="true" />
              <Trans>New File</Trans>
            </DropdownMenuItem>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger disabled={anyActionBusy}>
                <FilePlus aria-hidden="true" />
                <Trans>New from template</Trans>
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <TemplateMenuRows
                  parentDir={treeDirectoryPathToFolderPath(item.path)}
                  onSelectTemplate={(templateName) => {
                    closeForInlineSurface();
                    onCreateFromTemplate(treeDirectoryPathToFolderPath(item.path), templateName);
                  }}
                  ItemComponent={DropdownMenuItem}
                />
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuItem
              disabled={anyActionBusy}
              onSelect={() => {
                closeForInlineSurface();
                onStartCreating('folder', treeDirectoryPathToFolderPath(item.path));
              }}
            >
              <FolderPlus aria-hidden="true" />
              <Trans>New Folder</Trans>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <RevealInFileManagerMenuItem item={item} workspace={workspace} onClose={close} />
            <OpenInAgentContextSubmenu
              input={handoffInput}
              installStates={handoff.installStates}
              isElectronHost={handoff.isElectronHost}
              dispatch={handoff.dispatch}
              webFallbackVisible={false}
            />
            <OpenInTerminalMenuItem dirAbsPath={folderAbsPath} onClose={close} />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Copy aria-hidden="true" />
                <Trans>Copy Path</Trans>
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuItem
                  disabled={!workspace}
                  onSelect={() => {
                    if (!workspace) return;
                    close();
                    const full = joinWorkspacePath(
                      workspace.contentDir,
                      relativePathForTreeItem(item),
                      workspace.pathSeparator,
                    );
                    void copyToClipboard(full, 'full');
                  }}
                >
                  <Trans>Full Path</Trans>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => {
                    close();
                    void copyToClipboard(relativePathForTreeItem(item), 'relative');
                  }}
                >
                  <Trans>Relative Path</Trans>
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
            {/* These toggles only flip the persisted config; the filter
                pipeline (client dot-segment bypass / server showAll) reads it
                from a separate seam. */}
            <DropdownMenuCheckboxItem
              checked={showHiddenFiles}
              onCheckedChange={handleShowHiddenFilesToggle}
              disabled={!canToggleVisibility}
              data-testid="file-tree-menu-show-hidden-files"
            >
              <Trans>Show Hidden Files</Trans>
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={showAllFiles}
              onCheckedChange={handleShowAllFilesToggle}
              disabled={!canToggleVisibility}
              data-testid="file-tree-menu-show-all-files"
            >
              <Trans>Show all files</Trans>
            </DropdownMenuCheckboxItem>
            {/* Subtree-scoped Expand/Collapse, smart-hidden. The divider only
                renders when the section is non-empty so a fully-expanded or
                fully-collapsed subtree collapses to a single divider before
                the destructive section instead of an empty double rule. */}
            {showSubtreeExpandAll || showSubtreeCollapseAll ? <DropdownMenuSeparator /> : null}
            {showSubtreeExpandAll ? (
              <DropdownMenuItem
                onSelect={() => {
                  close();
                  onExpandSubtree(item.path);
                }}
              >
                <UnfoldVertical aria-hidden="true" />
                <Trans>Expand All</Trans>
              </DropdownMenuItem>
            ) : null}
            {showSubtreeCollapseAll ? (
              <DropdownMenuItem
                onSelect={() => {
                  close();
                  onCollapseSubtree(item.path);
                }}
              >
                <FoldVertical aria-hidden="true" />
                <Trans>Collapse All</Trans>
              </DropdownMenuItem>
            ) : null}
            {/* Destructive section. Rename sits with Hide/Delete here (not at
                the top with creation) so the menu's read order is
                create → act → filter → tree → mutate-or-remove. */}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              disabled={anyActionBusy}
              onSelect={() => {
                if (target.kind === 'asset') return;
                close();
                onDuplicate(target);
              }}
            >
              <CopyPlus aria-hidden="true" />
              <Trans>Duplicate</Trans>
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={anyActionBusy}
              onSelect={() => {
                closeForInlineSurface();
                model.startRenaming(item.path);
              }}
            >
              <Pencil aria-hidden="true" />
              <Trans>Rename</Trans>
            </DropdownMenuItem>
            <DropdownMenuItem
              data-testid="file-tree-menu-hide"
              disabled={!canHide}
              onSelect={() => {
                if (!okignoreBinding || !okignoreTarget) return;
                close();
                const pattern = buildOkignorePatternFromTarget(okignoreTarget);
                const current = okignoreBinding.current();
                const doc = parseOkignoreDoc(current);
                const updated = appendPattern(doc, pattern);
                if (updated === doc) return;
                okignoreBinding.patch(serializeOkignoreDoc(updated));
                const basename = okignoreTarget.path.split('/').pop() || okignoreTarget.path;
                toast.success(t`Hidden folder “${basename}”`, {
                  description: t`Manage hidden files in Settings → Ignore patterns.`,
                  duration: 5000,
                });
              }}
            >
              <EyeOff aria-hidden="true" />
              {hideLabel}
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              disabled={anyActionBusy}
              onSelect={() => {
                close();
                onDelete(deleteTargets);
              }}
            >
              <Trash2 aria-hidden="true" />
              {deleteLabel}
            </DropdownMenuItem>
          </>
        ) : (
          <>
            <RevealInFileManagerMenuItem item={item} workspace={workspace} onClose={close} />
            {!isAsset && (
              <OpenInAgentContextSubmenu
                input={handoffInput}
                installStates={handoff.installStates}
                isElectronHost={handoff.isElectronHost}
                dispatch={handoff.dispatch}
                webFallbackVisible={true}
              />
            )}
            <OpenInTerminalMenuItem dirAbsPath={parentDirAbsPath} onClose={close} />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Copy aria-hidden="true" />
                <Trans>Copy Path</Trans>
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuItem
                  disabled={!workspace}
                  onSelect={() => {
                    if (!workspace) return;
                    close();
                    const full = joinWorkspacePath(
                      workspace.contentDir,
                      relativePathForTreeItem(item),
                      workspace.pathSeparator,
                    );
                    void copyToClipboard(full, 'full');
                  }}
                >
                  <Trans>Full Path</Trans>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => {
                    close();
                    void copyToClipboard(relativePathForTreeItem(item), 'relative');
                  }}
                >
                  <Trans>Relative Path</Trans>
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
            {!isAsset ? (
              <DropdownMenuItem
                disabled={anyActionBusy}
                onSelect={() => {
                  close();
                  onDuplicate(target);
                }}
              >
                <CopyPlus aria-hidden="true" />
                <Trans>Duplicate</Trans>
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem
              disabled={anyActionBusy}
              onSelect={() => {
                closeForInlineSurface();
                model.startRenaming(item.path);
              }}
            >
              <Pencil aria-hidden="true" />
              <Trans>Rename</Trans>
            </DropdownMenuItem>
            {okignoreTarget ? (
              <DropdownMenuItem
                data-testid="file-tree-menu-hide"
                disabled={!canHide}
                onSelect={() => {
                  if (!okignoreBinding) return;
                  close();
                  const pattern = buildOkignorePatternFromTarget(okignoreTarget);
                  const current = okignoreBinding.current();
                  const doc = parseOkignoreDoc(current);
                  const updated = appendPattern(doc, pattern);
                  if (updated === doc) return;
                  okignoreBinding.patch(serializeOkignoreDoc(updated));
                  const basename = okignoreTarget.path.split('/').pop() || okignoreTarget.path;
                  toast.success(t`Hidden “${basename}”`, {
                    description: t`Manage hidden files in Settings → Ignore patterns.`,
                    duration: 5000,
                  });
                }}
              >
                <EyeOff aria-hidden="true" />
                {hideLabel}
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem
              variant="destructive"
              disabled={anyActionBusy}
              onSelect={() => {
                close();
                onDelete(deleteTargets);
              }}
            >
              <Trash2 aria-hidden="true" />
              {deleteLabel}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export interface FileTreeHandle {
  startCreating(kind: 'file' | 'folder', parentDir: string): void;
  /** Open NewItemDialog at the given parentDir so the template picker is
   *  reachable. Used by the native macOS File menu's "New from Template…"
   *  item, where an inline hover-submenu of templates isn't expressible. */
  startCreatingFromTemplate(parentDir: string): void;
  /** Inline create-from-template: same fast path as `startCreating('file', …)`
   *  (placeholder + inline rename) but seeds the doc from the named template.
   *  Drives the in-renderer "New from template" submenus. */
  createFromTemplate(parentDir: string, templateName: string): void;
  expandAll(): void;
  collapseAll(): void;
  getFolderState(): { folderCount: number; expandedCount: number };
  subscribe(listener: () => void): () => void;
}

export function FileTree({ ref }: { ref?: Ref<FileTreeHandle | null> }) {
  const { t } = useLingui();
  const {
    activeDocName,
    activeTarget,
    closeTabs,
    closeDocument,
    closeAndClearForRename,
    getPoolActiveDocName,
    poolHas,
    isNewTabActive,
    openTarget,
    prewarm,
    remapTabsForRename,
  } = useDocumentContext();
  const { notifySidebarFileSelected } = useSidebar();
  const { resolvedTheme } = useTheme();
  const { addPage, pageMeta } = usePageList();
  function navigationTargetForDocument(
    docName: string,
    size: number | null | undefined,
  ): ResolvedNavigationTarget {
    return (
      largeFileNavigationTarget(docName, size ?? pageMeta.get(docName)?.size) ?? {
        kind: 'doc',
        target: docName,
        docName,
      }
    );
  }
  function navigateToWithPulse(targetPath: string, size?: number) {
    openTarget(navigationTargetForDocument(targetPath, size), { tabBehavior: 'replace-active' });
    replaceHashWithoutNavigation(hashFromDocName(targetPath));
    notifySidebarFileSelected();
  }
  function navigateToFolderWithPulse(folderPath: string) {
    const nextHash = hashFromFolderPath(folderPath);
    openTarget(
      { kind: 'folder', target: folderPath, folderPath },
      { tabBehavior: 'replace-active' },
    );
    replaceHashWithoutNavigation(nextHash);
    notifySidebarFileSelected();
  }
  const [documents, setDocuments] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [truncatedShownCount, setTruncatedShownCount] = useState<number | null>(null);
  const [busyPath, setBusyPath] = useState<string | null>(null);
  const [deleteRequest, setDeleteRequest] = useState<FileTreeDeleteRequest | null>(null);
  const [trashFailure, setTrashFailure] = useState<TrashFailureRequest | null>(null);
  const { conflicts: activeConflicts } = useConflicts();
  const [newItemRequest, setNewItemRequest] = useState<{ parentDir: string } | null>(null);
  const [workspace, setWorkspace] = useState<WorkspaceInfo | null>(null);

  const documentsRef = useRef(documents);
  function activateTreePath(treePath: string, entries: readonly FileEntry[] = documents) {
    const action = resolveFileTreeSelectionAction(treePath, entries);
    if (action.kind === 'none') {
      console.debug(
        '[FileTree] Dropped selection for unknown docName:',
        treePathToAppPath(treePath),
      );
      return;
    }
    if (action.kind === 'asset') {
      openTarget(
        {
          kind: 'asset',
          target: action.path,
          assetPath: action.path,
          mediaKind: action.mediaKind,
        },
        { tabBehavior: 'replace-active' },
      );
      replaceHashWithoutNavigation(action.hash);
      notifySidebarFileSelected();
      return;
    }
    if (action.kind === 'folder') {
      navigateToFolderWithPulse(action.path);
      return;
    }
    const docEntry = entries.find(
      (item): item is DocumentEntry => isDocumentEntry(item) && item.docName === action.path,
    );
    navigateToWithPulse(action.path, docEntry?.size);
  }
  function navigateToAssetWithPulse(assetPath: string) {
    const entry = documentsRef.current.find(
      (item): item is Extract<FileEntry, { kind: 'asset' }> =>
        isAssetEntry(item) && item.path === assetPath,
    );
    openTarget(
      {
        kind: 'asset',
        target: assetPath,
        assetPath,
        mediaKind: entry?.mediaKind ?? null,
      },
      { tabBehavior: 'replace-active' },
    );
    replaceHashWithoutNavigation(hashFromAssetPath(assetPath));
    notifySidebarFileSelected();
  }
  const activeDocNameRef = useRef(activeDocName);
  const assetTreePaths = new Set(
    documents.filter(isAssetEntry).map((entry) => fileEntryToTreePath(entry)),
  );
  const assetTreePathsRef = useRef(assetTreePaths);
  const activeAncestorTreePathsRef = useRef<string[]>([]);
  const pendingCreateRef = useRef<PendingCreate | null>(null);
  const cleanupPendingCreateRef = useRef<
    (pending: PendingCreate, options?: PendingCreateCleanupOptions) => Promise<void>
  >(async () => {});
  const skipNextResetSignatureRef = useRef<string | null>(null);
  const hoveredPrewarmDocRef = useRef<string | null>(null);
  const suppressSelectionRef = useRef(false);
  const busyPathRef = useRef<string | null>(null);
  const recentLocalAddsRef = useRef<Map<string, number>>(new Map());
  const showHiddenFilesRef = useRef<boolean>(false);
  const showAllFilesRef = useRef<boolean>(false);
  const refreshDocsScheduleRef = useRef<(() => void) | null>(null);
  const fileTreeHostRef = useRef<HTMLDivElement | null>(null);
  const handleSelectionChangeRef = useRef<(selectedPaths: readonly string[]) => void>(() => {});
  const handleRenameRef = useRef<(event: FileTreeRenameEvent) => void>(() => {});
  const handleRenameErrorRef = useRef<(message: string) => void>((message) => toast.error(message));
  const handleDropCompleteRef = useRef<(event: FileTreeDropResult) => void>(() => {});
  const activeTargetRef = useRef(activeTarget);

  const {
    selectedFilePath,
    selectedFolderPath,
    navigationPath: activeNavigationPath,
  } = resolveFileTreeSelection(activeTarget, isNewTabActive ? null : activeDocName);
  const activeTreePath = selectedFilePath
    ? docNameToTreePath(
        selectedFilePath,
        documents.find(
          (d): d is DocumentEntry => isDocumentEntry(d) && d.docName === selectedFilePath,
        )?.docExt,
      )
    : selectedFolderPath
      ? folderPathToTreeDirectoryPath(selectedFolderPath)
      : activeTarget?.kind === 'asset'
        ? activeTarget.assetPath
        : null;

  const handoffInstallStates = useInstalledAgents().states;
  const { dispatch: dispatchHandoff } = useHandoffDispatch();
  const handoff = {
    installStates: handoffInstallStates,
    isElectronHost: typeof window !== 'undefined' && window.okDesktop != null,
    dispatch: dispatchHandoff,
  };
  const { okignoreBinding, projectLocalBinding, merged } = useConfigContext();
  const showHiddenFiles = merged?.appearance?.sidebar?.showHiddenFiles ?? false;
  const showAllFiles = merged?.appearance?.sidebar?.showAllFiles ?? false;

  const isAvailable = () => busyPathRef.current === null;

  const { model } = useFileTree({
    paths: [],
    flattenEmptyDirectories: false,
    initialExpansion: 'closed',
    fileTreeSearchMode: 'hide-non-matches',
    initialVisibleRowCount: 18,
    stickyFolders: true,
    icons: {
      set: 'complete',
      spriteSheet: FILE_TREE_DECORATION_SPRITE_SHEET,
      byFileExtension: {
        md: { name: MARKDOWN_FILE_ICON_ID, viewBox: MARKDOWN_FILE_ICON_VIEWBOX },
        mdx: { name: MARKDOWN_FILE_ICON_ID, viewBox: MARKDOWN_FILE_ICON_VIEWBOX },
      },
    },
    unsafeCSS: FILE_TREE_UNSAFE_CSS,
    composition: {
      contextMenu: {
        enabled: true,
        triggerMode: 'both',
        buttonVisibility: 'when-needed',
      },
    },
    dragAndDrop: {
      canDrag: isAvailable,
      canDrop: isAvailable,
      onDropComplete: (event) => handleDropCompleteRef.current(event),
      onDropError: (message) => {
        toast.error(message);
      },
    },
    renaming: {
      canRename: isAvailable,
      onRename: (event) => handleRenameRef.current(event),
      onError: (message) => handleRenameErrorRef.current(message),
    },
    onSelectionChange: (selectedPaths) => handleSelectionChangeRef.current(selectedPaths),
    renderRowDecoration: ({ item }) => {
      if (item.kind !== 'file') return null;
      const doc = documentsRef.current.find(
        (entry): entry is DocumentEntry =>
          isDocumentEntry(entry) && docNameToTreePath(entry.docName, entry.docExt) === item.path,
      );
      if (doc?.isSymlink) {
        const targetPath = doc.targetPath;
        return {
          icon: LINK_DECORATION_ICON_ID,
          title: targetPath ? t`Symlink to ${targetPath}` : t`Symlink`,
        };
      }
      if (isAgentTreePath(item.path)) {
        return {
          icon: AGENT_DECORATION_ICON_ID,
          title: t`Agent configuration file`,
        };
      }
      return null;
    },
  });

  function normalizeSelectionPath(treePath: string): string {
    const item = model.getItem(treePath) ?? model.getItem(folderPathToTreeDirectoryPath(treePath));
    if (item?.isDirectory()) {
      return folderPathToTreeDirectoryPath(treeDirectoryPathToFolderPath(item.getPath()));
    }
    return treePath;
  }

  const treePaths = documentsToTreePaths(documents);
  const treePathsSignature = treePathSignature(treePaths);
  const treePathsRef = useRef(treePaths);
  const folderTreePaths = collectTreeFolderPathsFromDocuments(documents);
  const folderTreePathsRef = useRef(folderTreePaths);

  const activeAncestorTreePaths = selectedFolderPath
    ? computeTreeAncestorPaths(folderPathToTreeDirectoryPath(selectedFolderPath)).slice(0, -1)
    : computeTreeAncestorPaths(activeTreePath ?? activeNavigationPath);
  const activeAncestorTreePathsSignature = activeAncestorTreePaths.join('\0');

  const collectExpandedFolderTreePaths = () => {
    const expanded = new Set<string>();
    for (const folderPath of folderTreePathsRef.current) {
      const item = asDirectoryHandle(model.getItem(folderPath));
      if (item?.isExpanded()) {
        expanded.add(folderPath);
      }
    }
    return expanded;
  };

  const expandedPathsForReset = (nextDocuments?: readonly FileEntry[]) => {
    const nextFolderPaths = new Set(
      collectTreeFolderPathsFromDocuments(nextDocuments ?? documentsRef.current),
    );
    const expanded = collectExpandedFolderTreePaths();
    for (const ancestor of activeAncestorTreePathsRef.current) {
      expanded.add(ancestor);
    }
    return [...expanded].filter((path) => nextFolderPaths.has(path));
  };

  const resetModelToDocuments = (nextDocuments?: readonly FileEntry[]) => {
    const nextPaths = documentsToTreePaths(nextDocuments ?? documentsRef.current);
    model.resetPaths(nextPaths, {
      initialExpandedPaths: expandedPathsForReset(nextDocuments),
    });
  };

  const reconcileModelAfterChipRename = (
    current: readonly FileEntry[],
    next: readonly FileEntry[],
    renamed: readonly RenamedDocMapping[],
    renamedAssets: readonly RenamedAssetMapping[] = [],
  ): void => {
    let reconciledCount = 0;
    let lastCanonical: string | null = null;
    for (const { fromDocName, toDocName } of renamed) {
      const source = current.find(
        (entry): entry is DocumentEntry => isDocumentEntry(entry) && entry.docName === fromDocName,
      );
      if (source == null) continue;
      if (model.getItem(toDocName) == null) continue;
      const canonicalTreePath = docNameToTreePath(toDocName, source.docExt);
      model.move(toDocName, canonicalTreePath);
      lastCanonical = canonicalTreePath;
      reconciledCount += 1;
    }
    for (const { toPath } of renamedAssets) {
      const ext = getFileExtension(toPath);
      if (ext === '') continue;
      const extensionlessTreePath = toPath.slice(0, -ext.length);
      if (model.getItem(extensionlessTreePath) == null) continue;
      if (model.getItem(toPath) == null) {
        model.move(extensionlessTreePath, toPath);
      }
      lastCanonical = toPath;
      reconciledCount += 1;
    }
    if (reconciledCount === 0) return;
    resetModelToDocuments(next);
    if (lastCanonical != null) {
      model.focusPath(lastCanonical);
    }
  };

  const markNextDocumentsAsApplied = (nextDocuments: readonly FileEntry[]) => {
    skipNextResetSignatureRef.current = documentsTreePathSignature(nextDocuments);
  };

  const isAssetTreePath = (treePath: string) => assetTreePathsRef.current.has(treePath);

  async function handleDuplicateTarget(target: FileTreeTarget) {
    if (target.kind === 'asset') return;
    if (busyPathRef.current !== null) return;
    const clearBusyState = () => {
      setBusyPath(null);
      busyPathRef.current = null;
    };
    busyPathRef.current = target.path;
    setBusyPath(target.path);
    setError(null);

    try {
      const res = await fetch('/api/duplicate-path', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: target.kind, path: target.path }),
      });
      const parsed = await parseServerResponse(res, t`Failed to duplicate path`);

      if (!parsed.ok) {
        toast.error(parsed.title);
        resetModelToDocuments();
        clearBusyState();
        return;
      }

      const success = parseSuccessOrWarn(
        DuplicatePathSuccessSchema,
        parsed.body,
        'duplicate-path',
        null,
      );
      if (success === null) {
        const message = t`Duplicate succeeded but the sidebar may be out of date — refresh to resync`;
        toast.error(message);
        setError(message);
        emitDocumentsChanged(['files', 'backlinks', 'graph']);
        resetModelToDocuments();
        clearBusyState();
        return;
      }

      for (const docName of success.duplicatedDocNames) {
        addPage(docName);
      }
      setDocuments((current) => {
        const next = applyDuplicateToDocuments(current, target, success);
        resetModelToDocuments(next);
        markNextDocumentsAsApplied(next);
        return next;
      });
      emitDocumentsChanged(['files', 'backlinks', 'graph']);

      if (success.path !== target.path) {
        if (success.kind === 'folder') {
          navigateToFolderWithPulse(success.path);
        } else {
          navigateToWithPulse(success.path);
        }
      }
      toast.success(success.kind === 'folder' ? t`Folder duplicated` : t`File duplicated`, {
        description: success.path,
      });
      clearBusyState();
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      console.warn('[FileTree] duplicate failed:', err);
      toast.error(t`Could not duplicate item`, { description: detail });
      resetModelToDocuments();
      clearBusyState();
    }
  }

  const handleDuplicateTargetRef = useRef(handleDuplicateTarget);
  useEffect(() => {
    handleDuplicateTargetRef.current = handleDuplicateTarget;
  });

  function recoverMarkdownRenameConflict(message: string): boolean {
    const bareDestinationPath = parseAlreadyExistsRenamePath(message);
    if (!bareDestinationPath || markdownTreeExtension(bareDestinationPath)) return false;

    const sourceTreePath = model.getFocusedPath() ?? model.getSelectedPaths()[0] ?? null;
    if (!sourceTreePath || sourceTreePath.endsWith('/') || isAssetTreePath(sourceTreePath)) {
      return false;
    }

    const sourceExtension = markdownTreeExtension(sourceTreePath);
    if (!sourceExtension) return false;

    const folderTreePath = folderPathToTreeDirectoryPath(bareDestinationPath);
    if (!folderTreePathsRef.current.includes(folderTreePath)) return false;

    const destinationTreePath = `${bareDestinationPath}${sourceExtension}`;
    if (treePathsRef.current.includes(destinationTreePath)) return false;

    const event = {
      sourcePath: sourceTreePath,
      destinationPath: destinationTreePath,
      isFolder: false,
    } satisfies FileTreeRenameEvent;

    void handleTreeRename(event);
    model.move(sourceTreePath, destinationTreePath);
    return true;
  }

  const clearPendingCreate = (pending?: PendingCreate | null) => {
    const current = pending ?? pendingCreateRef.current;
    if (!current || pendingCreateRef.current !== current) return;
    current.disposeCommitListener();
    pendingCreateRef.current = null;
  };

  async function cleanupPendingCreate(
    pending: PendingCreate,
    options: PendingCreateCleanupOptions = {},
  ) {
    const updateUi = options.updateUi ?? true;
    const restoreLocation = options.restoreLocation ?? updateUi;

    clearPendingCreate(pending);
    if (updateUi) setBusyPath(pending.renamePath);

    try {
      const res = await fetch('/api/delete-path', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: pending.kind, path: pending.createdPath }),
      });
      if (!res.ok && res.status !== 404) {
        const kind = pending.kind;
        const createdPath = pending.createdPath;
        const parsed = await parseServerResponse(res, t`Failed to clean up pending ${kind}`);
        if (parsed.ok) return;
        const detail = parsed.title;
        const message = t`${detail} - ${kind} "${createdPath}" still exists on disk`;
        if (updateUi) {
          toast.error(message);
        } else {
          console.warn(`[FileTree] cleanup pending create failed: ${message}`);
        }
        if (updateUi) {
          setBusyPath(null);
          resetModelToDocuments();
        }
        return;
      }
    } catch (err) {
      console.warn('[FileTree] cleanup pending create failed:', err);
      if (updateUi) {
        const kind = pending.kind;
        const createdPath = pending.createdPath;
        toast.error(t`Network error - ${kind} "${createdPath}" still exists on disk`);
      }
      if (updateUi) {
        setBusyPath(null);
        resetModelToDocuments();
      }
      return;
    }

    if (updateUi) {
      if (pending.kind === 'file') {
        closeDocument(pending.createdPath);
      } else {
        closeTabs([folderTabId(pending.createdPath)], { force: true });
      }
    }
    if (updateUi) {
      setDocuments((current) => {
        const next = applyDeleteToDocuments(
          current,
          pending.kind === 'file' ? [pending.createdPath] : [],
          pending.kind === 'folder' ? pending.createdPath : undefined,
        );
        markNextDocumentsAsApplied(next);
        return next;
      });
    }
    emitDocumentsChanged(['files', 'backlinks', 'graph']);
    if (restoreLocation) window.location.hash = pending.previousHash;
    if (updateUi) setBusyPath(null);
  }

  useEffect(() => {
    return () => {
      const pending = pendingCreateRef.current;
      if (pending) {
        void cleanupPendingCreateRef
          .current(pending, {
            restoreLocation: false,
            updateUi: false,
          })
          .catch((err) => {
            console.warn('[FileTree] unmount cleanup failed:', err);
          });
      }
    };
  }, []);

  useEffect(() => {
    let active = true;
    let refreshController: AbortController | null = null;

    async function refreshDocs() {
      refreshController?.abort();
      const controller = new AbortController();
      refreshController = controller;
      try {
        const showAll = showAllFilesRef.current;
        const url = showAll ? '/api/documents?showAll=true' : '/api/documents';
        const res = await fetch(url, {
          signal: controller.signal,
          headers: showAll ? SHOW_ALL_NDJSON_ACCEPT : undefined,
        });
        if (showAll && isNdjsonResponse(res)) {
          const { entries, truncated } = await consumeShowAllStream(res);
          if (!active) return;
          const bypassClientDotDrop = showHiddenFilesRef.current || showAll;
          const serverEntries = filterVisibleEntries(
            entries as unknown as FileEntry[],
            bypassClientDotDrop,
          );
          const merged = mergeAndPruneRecentLocalAdds(
            serverEntries,
            documentsRef.current,
            recentLocalAddsRef.current,
          );
          setDocuments(merged);
          setError(null);
          setTruncatedShownCount(truncated ? entries.length : null);
        } else {
          const parsed = await parseServerResponse(res, t`Failed to load documents`);
          if (!active) return;
          if (!parsed.ok) {
            setError(parsed.title);
            setTruncatedShownCount(null);
          } else {
            const success = DocumentListSuccessSchema.safeParse(parsed.body);
            if (!success.success) {
              setError(t`Documents response did not match expected shape.`);
              setTruncatedShownCount(null);
            } else {
              const bypassClientDotDrop = showHiddenFilesRef.current || showAll;
              const serverEntries = filterVisibleEntries(
                success.data.documents as unknown as FileEntry[],
                bypassClientDotDrop,
              );
              const merged = mergeAndPruneRecentLocalAdds(
                serverEntries,
                documentsRef.current,
                recentLocalAddsRef.current,
              );
              setDocuments(merged);
              setError(null);
              setTruncatedShownCount(
                showAll && success.data.truncated === true ? success.data.documents.length : null,
              );
            }
          }
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        if (active) setError(t`Could not reach server`);
        console.warn('[FileTree] fetch failed:', err);
      }
      if (active) setLoading(false);
    }

    const scheduler = createRefreshScheduler(refreshDocs, () => refreshController?.abort());
    refreshDocsScheduleRef.current = () => scheduler.request();
    scheduler.request();
    const handleResume = () => {
      if (document.visibilityState === 'visible') {
        scheduler.request();
      }
    };
    window.addEventListener('focus', handleResume);
    window.addEventListener('visibilitychange', handleResume);
    const unsubscribe = subscribeToDocumentsChanged((channels) => {
      if (channels.includes('files')) {
        scheduler.request();
      }
    });
    return () => {
      active = false;
      refreshDocsScheduleRef.current = null;
      scheduler.dispose();
      window.removeEventListener('focus', handleResume);
      window.removeEventListener('visibilitychange', handleResume);
      unsubscribe();
    };
  }, [t]);

  const isFirstShowHiddenFilesEffectRunRef = useRef(true);
  // biome-ignore lint/correctness/useExhaustiveDependencies: showHiddenFiles is a flip-detection trigger, not a read — the effect body reads refs only. Sibling pattern at the treePathsSignature reset effect above.
  useEffect(() => {
    if (isFirstShowHiddenFilesEffectRunRef.current) {
      isFirstShowHiddenFilesEffectRunRef.current = false;
      return;
    }
    refreshDocsScheduleRef.current?.();
  }, [showHiddenFiles]);

  const isFirstShowAllFilesEffectRunRef = useRef(true);
  // biome-ignore lint/correctness/useExhaustiveDependencies: showAllFiles is a flip-detection trigger, not a read — the effect body reads refs only. Sibling pattern at the treePathsSignature reset effect above.
  useEffect(() => {
    if (isFirstShowAllFilesEffectRunRef.current) {
      isFirstShowAllFilesEffectRunRef.current = false;
      return;
    }
    refreshDocsScheduleRef.current?.();
  }, [showAllFiles]);

  useEffect(() => {
    let active = true;
    fetch('/api/workspace')
      .then(async (res) => {
        const data = await res.json();
        if (!active) return;
        if (!res.ok) return;
        const parsed = parseSuccessOrWarn(WorkspaceSuccessSchema, data, 'workspace', null);
        if (!parsed) return;
        setWorkspace({
          contentDir: parsed.contentDir,
          pathSeparator: parsed.pathSeparator,
        });
      })
      .catch((err) => {
        console.warn('[FileTree] /api/workspace fetch failed:', err);
      });
    return () => {
      active = false;
    };
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: expandedPathsForReset reads refs; model + treePathsSignature are the reset triggers.
  useEffect(() => {
    if (skipNextResetSignatureRef.current === treePathsSignature) {
      skipNextResetSignatureRef.current = null;
      return;
    }
    model.resetPaths(treePathsRef.current, {
      initialExpandedPaths: expandedPathsForReset(),
    });
  }, [model, treePathsSignature]);

  useSelectionMirror(
    model,
    activeTreePath,
    activeAncestorTreePathsSignature,
    suppressSelectionRef,
    treePathsSignature,
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: activeAncestorTreePathsSignature + treePathsSignature are re-run triggers — the row's visible index shifts when ancestors expand or the tree repopulates.
  useEffect(() => {
    if (loading || !activeTreePath) return;
    revealActiveRow(fileTreeHostRef.current, model);
  }, [activeTreePath, activeAncestorTreePathsSignature, treePathsSignature, loading, model]);

  useEffect(() => {
    return model.subscribe(() => {
      if (model.isSearchOpen()) return;
      for (const ancestor of activeAncestorTreePathsRef.current) {
        const item = asDirectoryHandle(model.getItem(ancestor));
        if (item && !item.isExpanded()) {
          item.expand();
        }
      }
    });
  }, [model]);

  useEffect(() => {
    return model.onMutation('remove', (event) => {
      const pending = pendingCreateRef.current;
      if (!pending || event.path !== pending.renamePath) return;
      void cleanupPendingCreateRef.current(pending);
    });
  }, [model]);

  const applyRenamedDocuments = async (
    renamed: RenamedDocMapping[],
    renamedFolders: RenamedFolderMapping[] = [],
    renamedAssets: RenamedAssetMapping[] = [],
    activeBeforeRename?: {
      docName: string | null;
      folderPath: string | null;
      assetPath: string | null;
    },
  ) => {
    const currentActiveDocName = activeBeforeRename?.docName ?? activeDocNameRef.current;
    const nextActiveDocName = remapActiveDocName(currentActiveDocName, renamed);
    const currentActiveFolderPath =
      activeBeforeRename?.folderPath ??
      (activeTargetRef.current?.kind === 'folder' ? activeTargetRef.current.folderPath : null);
    const nextActiveFolderPath = currentActiveFolderPath
      ? remapPathForFolderRenames(currentActiveFolderPath, renamedFolders)
      : null;
    const currentActiveAssetPath =
      activeBeforeRename?.assetPath ??
      (activeTargetRef.current?.kind === 'asset' ? activeTargetRef.current.assetPath : null);
    const nextActiveAssetPath = currentActiveAssetPath
      ? (renamedAssets.find((entry) => entry.fromPath === currentActiveAssetPath)?.toPath ??
        remapPathForFolderRenames(currentActiveAssetPath, renamedFolders))
      : null;

    captureRenameSnapshots(renamed);
    const cleanupDocNames = planRenameCleanupCalls(renamed, getPoolActiveDocName(), poolHas);
    await Promise.all(cleanupDocNames.map((docName) => closeAndClearForRename(docName)));
    for (const entry of renamed) {
      addPage(entry.toDocName);
    }
    remapTabsForRename(renamed, renamedFolders, renamedAssets);

    setDocuments((current) => {
      const next = applyRenameToDocuments(current, renamed, renamedFolders, renamedAssets);
      reconcileModelAfterChipRename(current, next, renamed, renamedAssets);
      markNextDocumentsAsApplied(next);
      return next;
    });

    if (
      currentActiveFolderPath &&
      nextActiveFolderPath &&
      nextActiveFolderPath !== currentActiveFolderPath
    ) {
      navigateToFolderWithPulse(nextActiveFolderPath);
    } else if (nextActiveDocName && nextActiveDocName !== currentActiveDocName) {
      window.location.hash = hashFromDocName(nextActiveDocName);
    } else if (
      currentActiveAssetPath &&
      nextActiveAssetPath &&
      nextActiveAssetPath !== currentActiveAssetPath
    ) {
      navigateToAssetWithPulse(nextActiveAssetPath);
    }
    emitDocumentsChanged(['files', 'backlinks', 'graph']);
  };

  async function handleTreeRename(event: FileTreeRenameEvent) {
    const sourceIsAsset = !event.isFolder && isAssetTreePath(event.sourcePath);
    const sourceTreePath = sourceIsAsset
      ? event.sourcePath
      : normalizeTreePathForKind(event.sourcePath, event.isFolder);

    setBusyPath(sourceTreePath);
    setError(null);

    try {
      const validation = validateAndCoerceRenameDestination(
        event.sourcePath,
        event.destinationPath,
        event.isFolder,
        sourceIsAsset,
      );
      if (validation.kind === 'block') {
        toast.error(
          t`File extensions are managed automatically - please rename without changing the extension`,
        );
        queueMicrotask(() => {
          resetModelToDocuments();
        });
        clearPendingCreate();
        setBusyPath(null);
        return;
      }
      const destinationTreePath = sourceIsAsset
        ? validation.destinationPath
        : normalizeTreePathForKind(validation.destinationPath, event.isFolder);

      const payload = event.isFolder
        ? {
            kind: 'folder' as const,
            fromPath: treeDirectoryPathToFolderPath(sourceTreePath),
            toPath: treeDirectoryPathToFolderPath(destinationTreePath),
          }
        : sourceIsAsset
          ? {
              kind: 'asset' as const,
              fromPath: sourceTreePath,
              toPath: destinationTreePath,
            }
          : {
              kind: 'file' as const,
              fromPath: treeFilePathToDocName(sourceTreePath),
              toPath: treeFilePathToDocName(destinationTreePath),
            };
      const activeBeforeRename = {
        docName: activeDocNameRef.current,
        folderPath:
          activeTargetRef.current?.kind === 'folder' ? activeTargetRef.current.folderPath : null,
        assetPath:
          activeTargetRef.current?.kind === 'asset' ? activeTargetRef.current.assetPath : null,
      };

      const res = await fetch('/api/rename-path', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const parsed = await parseServerResponse(res, t`Failed to rename path`);

      if (!parsed.ok) {
        toast.error(parsed.title);
        resetModelToDocuments();
        const pending = pendingCreateRef.current;
        if (pending && pending.renamePath === sourceTreePath) {
          await cleanupPendingCreate(pending);
        } else {
          clearPendingCreate();
        }
        setBusyPath(null);
        return;
      }

      const success = parseSuccessOrWarn(RenamePathSuccessSchema, parsed.body, 'rename-path', {
        renamed: [],
        renamedAssets: [],
      });
      try {
        await applyRenamedDocuments(
          success.renamed,
          event.isFolder
            ? [
                {
                  fromPath: treeDirectoryPathToFolderPath(sourceTreePath),
                  toPath: treeDirectoryPathToFolderPath(destinationTreePath),
                },
              ]
            : [],
          success.renamedAssets,
          activeBeforeRename,
        );
      } catch (reconcileErr) {
        console.warn('[FileTree] post-rename reconciliation failed', {
          err: reconcileErr,
          sourceTreePath,
          destinationTreePath,
          renamedCount: success.renamed.length,
          renamedAssetCount: success.renamedAssets.length,
        });
        toast.error(t`Rename succeeded but the sidebar may be out of date — refresh to resync`);
      }
      clearPendingCreate();
      setBusyPath(null);
    } catch (err) {
      console.warn('[FileTree] rename failed:', err);
      const msg = t`Network error — please try again`;
      toast.error(msg);
      setError(msg);
      resetModelToDocuments();
      const pending = pendingCreateRef.current;
      if (pending && pending.renamePath === sourceTreePath) {
        await cleanupPendingCreate(pending);
      } else {
        clearPendingCreate();
      }
      setBusyPath(null);
    }
  }

  async function handleDropComplete(event: FileTreeDropResult) {
    const operations = event.draggedPaths
      .map((sourcePath) => {
        const destinationTreePath = computeTreeDropDestinationPath(sourcePath, event.target);
        return sourcePath === destinationTreePath ? null : { sourcePath, destinationTreePath };
      })
      .filter((operation) => !!operation);
    if (operations.length === 0) return;

    setBusyPath(operations[0]?.sourcePath ?? null);
    setError(null);

    try {
      let renamed: RenamedDocMapping[] = [];
      let renamedAssets: RenamedAssetMapping[] = [];
      const renamedFolders: RenamedFolderMapping[] = [];
      const activeBeforeRename = {
        docName: activeDocNameRef.current,
        folderPath:
          activeTargetRef.current?.kind === 'folder' ? activeTargetRef.current.folderPath : null,
        assetPath:
          activeTargetRef.current?.kind === 'asset' ? activeTargetRef.current.assetPath : null,
      };
      for (const operation of operations) {
        const isFolder = operation.sourcePath.endsWith('/');
        const sourceIsAsset = !isFolder && isAssetTreePath(operation.sourcePath);
        const payload = isFolder
          ? {
              kind: 'folder' as const,
              fromPath: treeDirectoryPathToFolderPath(operation.sourcePath),
              toPath: treeDirectoryPathToFolderPath(operation.destinationTreePath),
            }
          : sourceIsAsset
            ? {
                kind: 'asset' as const,
                fromPath: operation.sourcePath,
                toPath: operation.destinationTreePath,
              }
            : {
                kind: 'file' as const,
                fromPath: treeFilePathToDocName(operation.sourcePath),
                toPath: treeFilePathToDocName(operation.destinationTreePath),
              };

        const res = await fetch('/api/rename-path', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const parsed = await parseServerResponse(res, t`Failed to move`);

        if (!parsed.ok) {
          toast.error(parsed.title);
          resetModelToDocuments();
          setBusyPath(null);
          return;
        }
        const success = parseSuccessOrWarn(
          RenamePathSuccessSchema,
          parsed.body,
          'rename-path:drop',
          { renamed: [], renamedAssets: [] },
        );
        renamed = renamed.concat(success.renamed);
        renamedAssets = renamedAssets.concat(success.renamedAssets);
        if (isFolder) {
          renamedFolders.push({
            fromPath: treeDirectoryPathToFolderPath(operation.sourcePath),
            toPath: treeDirectoryPathToFolderPath(operation.destinationTreePath),
          });
        }
      }

      try {
        await applyRenamedDocuments(renamed, renamedFolders, renamedAssets, activeBeforeRename);
      } catch (reconcileErr) {
        console.warn('[FileTree] post-move reconciliation failed', {
          err: reconcileErr,
          operationCount: operations.length,
          renamedCount: renamed.length,
          renamedAssetCount: renamedAssets.length,
        });
        toast.error(t`Move succeeded but the sidebar may be out of date — refresh to resync`);
      }
      setBusyPath(null);
    } catch (err) {
      console.warn('[FileTree] move failed:', err);
      toast.error(t`Network error — please try again`);
      resetModelToDocuments();
      setBusyPath(null);
    }
  }

  function startCreatingFromTemplate(parentDir: string) {
    setNewItemRequest({ parentDir });
  }

  async function startCreating(
    kind: 'file' | 'folder',
    parentDir: string,
    options?: { template?: string },
  ) {
    if (busyPathRef.current) return;

    const pendingCreate = pendingCreateRef.current;
    if (pendingCreate) {
      clearPendingCreate(pendingCreate);
    }

    try {
      const placeholder = createTreePlaceholder(kind, parentDir, [
        ...treePaths,
        ...folderTreePathsRef.current,
      ]);
      setBusyPath(placeholder.renamePath);
      busyPathRef.current = placeholder.renamePath;
      const previousHash = window.location.hash;

      let createdPath: string;
      if (kind === 'file') {
        const createPath = createPagePathFromTreeDestination('file', placeholder.addPath);
        const createBody: { path: string; template?: string } = { path: createPath };
        if (options?.template) createBody.template = options.template;
        const res = await fetch('/api/create-page', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(createBody),
        });
        const parsed = await parseServerResponse(res, t`Failed to create file`);

        if (!parsed.ok) {
          toast.error(parsed.title);
          setBusyPath(null);
          busyPathRef.current = null;
          return;
        }

        const fallbackDocName = treeFilePathToDocName(createPath);
        const success = parseSuccessOrWarn(CreatePageSuccessSchema, parsed.body, 'create-page', {
          docName: fallbackDocName,
        });
        const docName = success.docName;
        createdPath = docName;
        const docExt = createPath.toLowerCase().endsWith('.mdx') ? '.mdx' : '.md';
        const newFileEntry: FileEntry = {
          kind: 'document',
          docName,
          docExt,
          modified: new Date().toISOString(),
          size: 0,
        };
        addPage(docName);
        setDocuments((current) => {
          if (current.some((entry) => isDocumentEntry(entry) && entry.docName === docName)) {
            return current;
          }
          const next = [...current, newFileEntry];
          markNextDocumentsAsApplied(next);
          recentLocalAddsRef.current.set(fileEntryToTreePath(newFileEntry), Date.now());
          return next;
        });
        emitDocumentsChanged(['files', 'backlinks', 'graph']);
        navigateToWithPulse(docName);
      } else {
        const folderPath = treeDirectoryPathToFolderPath(placeholder.addPath);
        const res = await fetch('/api/create-folder', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: folderPath }),
        });
        const parsed = await parseServerResponse(res, t`Failed to create folder`);

        if (!parsed.ok) {
          toast.error(parsed.title);
          setBusyPath(null);
          busyPathRef.current = null;
          return;
        }

        const success = parseSuccessOrWarn(
          CreateFolderSuccessSchema,
          parsed.body,
          'create-folder',
          { path: folderPath },
        );
        createdPath = success.path;
        const newFolderEntry: FileEntry = {
          kind: 'folder',
          path: createdPath,
          modified: new Date().toISOString(),
          size: 0,
        };
        setDocuments((current) => {
          if (current.some((entry) => isFolderEntry(entry) && entry.path === createdPath)) {
            return current;
          }
          const next = [...current, newFolderEntry];
          markNextDocumentsAsApplied(next);
          recentLocalAddsRef.current.set(fileEntryToTreePath(newFolderEntry), Date.now());
          return next;
        });
        emitDocumentsChanged(['files']);
        navigateToFolderWithPulse(createdPath);
      }

      let disposed = false;
      const handleCommitKeyDown = (event: KeyboardEvent) => {
        if (event.key !== 'Enter') return;
        const pending = pendingCreateRef.current;
        if (!pending || pending.renamePath !== placeholder.renamePath) return;
        queueMicrotask(() => clearPendingCreate(pending));
      };
      const disposeCommitListener = () => {
        if (disposed) return;
        disposed = true;
        document.removeEventListener('keydown', handleCommitKeyDown, true);
      };
      document.addEventListener('keydown', handleCommitKeyDown, true);
      pendingCreateRef.current = {
        kind,
        renamePath: placeholder.renamePath,
        createdPath,
        previousHash,
        disposeCommitListener,
      };
      setBusyPath(null);
      busyPathRef.current = null;
      model.add(placeholder.addPath);
      model.startRenaming(placeholder.renamePath, { removeIfCanceled: true });
    } catch (err) {
      console.warn('[FileTree] create placeholder failed:', err);
      toast.error(t`Could not start creating a new item`);
      const pending = pendingCreateRef.current;
      if (pending) {
        await cleanupPendingCreate(pending);
      } else {
        clearPendingCreate();
      }
      setBusyPath(null);
      busyPathRef.current = null;
      resetModelToDocuments();
    }
  }

  function expandSubtree(treePath: string) {
    const root = folderPathToTreeDirectoryPath(treePath);
    startTransition(() => {
      for (const folderPath of folderTreePathsRef.current) {
        if (folderPath === root || folderPath.startsWith(root)) {
          const item = asDirectoryHandle(model.getItem(folderPath));
          if (item) {
            item.expand();
          }
        }
      }
    });
  }

  function collapseSubtree(treePath: string) {
    const root = folderPathToTreeDirectoryPath(treePath);
    const activeAncestors = new Set(activeAncestorTreePathsRef.current);
    startTransition(() => {
      for (const folderPath of [...folderTreePathsRef.current].reverse()) {
        if (
          (folderPath === root || folderPath.startsWith(root)) &&
          !activeAncestors.has(folderPath)
        ) {
          const item = asDirectoryHandle(model.getItem(folderPath));
          if (item) {
            item.collapse();
          }
        }
      }
    });
  }

  useLayoutEffect(() => {
    documentsRef.current = documents;
    activeDocNameRef.current = activeDocName;
    activeTargetRef.current = activeTarget;
    assetTreePathsRef.current = assetTreePaths;
    busyPathRef.current = busyPath;
    showHiddenFilesRef.current = showHiddenFiles;
    showAllFilesRef.current = showAllFiles;
    treePathsRef.current = treePaths;
    folderTreePathsRef.current = folderTreePaths;
    activeAncestorTreePathsRef.current = activeAncestorTreePaths;
    cleanupPendingCreateRef.current = cleanupPendingCreate;
    handleSelectionChangeRef.current = (selectedPaths) => {
      if (suppressSelectionRef.current) return;
      if (selectedPaths.length !== 1) return;
      const selected = selectedPaths[0];
      if (selected) activateTreePath(normalizeSelectionPath(selected), documents);
    };
    handleRenameErrorRef.current = (message) => {
      if (recoverMarkdownRenameConflict(message)) return;
      toast.error(message);
    };
    handleRenameRef.current = handleTreeRename;
    handleDropCompleteRef.current = handleDropComplete;
  });

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isPlatformShortcut = (event.metaKey || event.ctrlKey) && !event.altKey;
      const key = event.key.toLowerCase();
      const isSelectAll = isPlatformShortcut && key === 'a';
      const isDuplicate = isPlatformShortcut && !event.shiftKey && key === 'd';
      if (!isSelectAll && !isDuplicate) return;
      if (isEditableKeyboardTarget(event.target)) return;

      const host = fileTreeHostRef.current;
      const target = event.target;
      const activeElement = document.activeElement;
      const eventStartedInTree = target instanceof Node && host?.contains(target);
      const focusIsInTree = activeElement instanceof Node && host?.contains(activeElement);
      if (!eventStartedInTree && !focusIsInTree) return;

      if (isDuplicate) {
        const selectedPath = model.getFocusedPath() ?? model.getSelectedPaths()[0] ?? null;
        if (!selectedPath) return;
        const selectedItem =
          model.getItem(selectedPath) ?? model.getItem(folderPathToTreeDirectoryPath(selectedPath));
        const normalizedPath = selectedItem?.isDirectory()
          ? folderPathToTreeDirectoryPath(treeDirectoryPathToFolderPath(selectedItem.getPath()))
          : selectedPath;
        if (assetTreePathsRef.current.has(normalizedPath)) return;
        void handleDuplicateTargetRef.current(
          treePathToTarget(normalizedPath, documentsRef.current),
        );
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      const selectedPaths = new Set([...folderTreePathsRef.current, ...treePathsRef.current]);
      suppressSelectionRef.current = true;
      for (const treePath of selectedPaths) {
        if (!treePath) continue;
        model.getItem(treePath)?.select();
      }
      queueMicrotask(() => {
        suppressSelectionRef.current = false;
      });
      event.preventDefault();
      event.stopPropagation();
    };

    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [model]);

  useEffect(() => {
    if (loading || documents.length === 0) return;
    const shadow = fileTreeHostRef.current?.querySelector(FILE_TREE_TAG_NAME)?.shadowRoot;
    if (!shadow) return;
    const toTitle = (treePath: string) =>
      treePath.endsWith('/') ? treePath.slice(0, -1) : treePath;
    const stampTitles = () => {
      for (const row of shadow.querySelectorAll<HTMLElement>('[data-item-path]')) {
        const treePath = row.dataset.itemPath;
        if (!treePath) continue;
        const title = toTitle(treePath);
        if (row.title !== title) row.title = title;
      }
      const anchor = shadow.querySelector<HTMLElement>('[data-type="context-menu-anchor"]');
      if (anchor) {
        const hoveredPath = shadow.querySelector<HTMLElement>(
          '[data-item-context-hover="true"][data-item-path]',
        )?.dataset.itemPath;
        const title = hoveredPath ? toTitle(hoveredPath) : '';
        if (anchor.title !== title) anchor.title = title;
      }
    };
    stampTitles();
    const observer = new MutationObserver(stampTitles);
    observer.observe(shadow, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['data-item-path', 'data-item-context-hover'],
    });
    return () => observer.disconnect();
  }, [loading, documents.length]);

  useEffect(() => {
    if (loading || documents.length === 0) return;
    const shadow = fileTreeHostRef.current?.querySelector(FILE_TREE_TAG_NAME)?.shadowRoot;
    if (!shadow) return;
    const apply = () => applyExtensionBadges(shadow);
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(shadow, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['data-item-path'],
    });
    return () => observer.disconnect();
  }, [loading, documents.length]);

  useEffect(() => {
    if (loading || documents.length === 0) return;
    const shadow = fileTreeHostRef.current?.querySelector(FILE_TREE_TAG_NAME)?.shadowRoot;
    if (!shadow) return;
    const apply = () => applyRenameChip(shadow);
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(shadow, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['data-item-path'],
    });
    return () => observer.disconnect();
  }, [loading, documents.length]);

  const folderStateCacheRef = useRef<{ folderCount: number; expandedCount: number }>({
    folderCount: 0,
    expandedCount: 0,
  });

  const startCreatingRef = useRef(startCreating);
  const startCreatingFromTemplateRef = useRef(startCreatingFromTemplate);
  useEffect(() => {
    startCreatingRef.current = startCreating;
    startCreatingFromTemplateRef.current = startCreatingFromTemplate;
  });

  useImperativeHandle(
    ref,
    () => ({
      startCreating(kind, parentDir) {
        void startCreatingRef.current(kind, parentDir);
      },
      startCreatingFromTemplate(parentDir) {
        startCreatingFromTemplateRef.current(parentDir);
      },
      createFromTemplate(parentDir, templateName) {
        void startCreatingRef.current('file', parentDir, { template: templateName });
      },
      expandAll() {
        startTransition(() => {
          for (const folderPath of folderTreePathsRef.current) {
            const item = asDirectoryHandle(model.getItem(folderPath));
            if (item) {
              item.expand();
            }
          }
        });
      },
      collapseAll() {
        const activeAncestors = new Set(activeAncestorTreePathsRef.current);
        startTransition(() => {
          for (const folderPath of [...folderTreePathsRef.current].reverse()) {
            if (activeAncestors.has(folderPath)) continue;
            const item = asDirectoryHandle(model.getItem(folderPath));
            if (item) {
              item.collapse();
            }
          }
        });
      },
      getFolderState() {
        const paths = folderTreePathsRef.current;
        let expandedCount = 0;
        for (const p of paths) {
          if (asDirectoryHandle(model.getItem(p))?.isExpanded()) expandedCount++;
        }
        const folderCount = paths.length;
        const cached = folderStateCacheRef.current;
        if (cached.folderCount === folderCount && cached.expandedCount === expandedCount) {
          return cached;
        }
        const next = { folderCount, expandedCount };
        folderStateCacheRef.current = next;
        return next;
      },
      subscribe(listener: () => void) {
        return model.subscribe(listener);
      },
    }),
    [model],
  );

  async function applyDeleteAftermath(
    successfulTargets: readonly FileTreeTarget[],
    deletedDocNames: readonly string[],
    deletedFolderPaths: readonly string[],
  ) {
    const tabsToClose = collectTabsToCloseForDelete(
      successfulTargets,
      documentsRef.current,
      folderTreePathsRef.current,
    );
    const pendingCreate = pendingCreateRef.current;
    if (
      pendingCreate &&
      successfulTargets.some((target) => deleteTargetCoversPendingCreate(target, pendingCreate))
    ) {
      if (pendingCreate.kind === 'file') {
        tabsToClose.docNames.add(pendingCreate.createdPath);
      } else {
        tabsToClose.folderPaths.add(pendingCreate.createdPath);
      }
      clearPendingCreate(pendingCreate);
    }
    const deleted = new Set([...tabsToClose.docNames, ...deletedDocNames]);
    const deletedFolders = new Set([...tabsToClose.folderPaths, ...deletedFolderPaths]);
    const deletedAssets = new Set([
      ...tabsToClose.assetPaths,
      ...successfulTargets.filter((target) => target.kind === 'asset').map((target) => target.path),
    ]);
    closeTabs(
      [
        ...[...deleted].map((docName) => docTabId(docName)),
        ...[...deletedFolders].map((folderPath) => folderTabId(folderPath)),
        ...[...deletedAssets].map((assetPath) => assetTabId(assetPath)),
      ],
      { force: true },
    );
    await Promise.all([...deleted].map((docName) => closeAndClearForRename(docName)));

    for (const target of successfulTargets) {
      const treePath =
        target.kind === 'folder'
          ? folderPathToTreeDirectoryPath(target.path)
          : target.kind === 'asset'
            ? target.path
            : docNameToTreePath(target.path, target.docExt);
      if (model.getItem(treePath)) {
        model.remove(treePath, target.kind === 'folder' ? { recursive: true } : undefined);
      }
    }
    setDocuments((current) => {
      let next = applyDeleteToDocuments(current, [...deleted], undefined, [...deletedAssets]);
      for (const folderPath of deletedFolders) {
        next = applyDeleteToDocuments(next, [], folderPath);
      }
      markNextDocumentsAsApplied(next);
      return next;
    });
    emitDocumentsChanged(['files', 'backlinks', 'graph']);
  }

  async function hardDeleteTargets(targets: readonly FileTreeTarget[]): Promise<boolean> {
    const deletedDocNames: string[] = [];
    const deletedFolderPaths: string[] = [];
    const successfulTargets: FileTreeTarget[] = [];
    for (const target of targets) {
      const kind = target.kind;
      setBusyPath(target.path);
      const res = await fetch('/api/delete-path', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, path: target.path }),
      });
      const parsed = await parseServerResponse(res, t`Failed to delete path`);
      if (!parsed.ok) {
        if (successfulTargets.length > 0) {
          await applyDeleteAftermath(successfulTargets, deletedDocNames, deletedFolderPaths);
        }
        toast.error(parsed.title);
        return false;
      }
      const success = parseSuccessOrWarn(DeletePathSuccessSchema, parsed.body, 'delete-path', {
        deletedDocNames: [],
      });
      deletedDocNames.push(...success.deletedDocNames);
      if (kind === 'folder') {
        deletedFolderPaths.push(target.path);
      }
      successfulTargets.push(target);
    }
    await applyDeleteAftermath(successfulTargets, deletedDocNames, deletedFolderPaths);
    return true;
  }

  async function trashTargetsViaShell(
    targets: readonly FileTreeTarget[],
    bridge: NonNullable<typeof window.okDesktop>,
    workspaceInfo: WorkspaceInfo,
  ): Promise<{
    trashed: FileTreeTarget[];
    failed: TrashFailedTarget[];
  }> {
    const trashed: FileTreeTarget[] = [];
    const failed: TrashFailedTarget[] = [];
    for (const target of targets) {
      setBusyPath(target.path);
      const absPath = buildTrashAbsPath(target, workspaceInfo);
      const result = await bridge.shell.trashItem(absPath);
      if (result.ok) {
        trashed.push(target);
      } else {
        failed.push({
          kind: target.kind,
          path: target.path,
          name: target.name,
          reason: coerceTrashFailureReason(result.reason),
          detail: result.detail,
        });
      }
    }
    return { trashed, failed };
  }

  async function postTrashCleanup(
    trashed: readonly FileTreeTarget[],
  ): Promise<{ deletedDocNames: string[]; deletedFolderPaths: string[] } | null> {
    const deletedDocNames: string[] = [];
    const deletedFolderPaths: string[] = [];
    const failedCleanups: Array<{ target: FileTreeTarget; reason: string }> = [];
    for (const target of trashed) {
      const kind = target.kind;
      try {
        const res = await fetch('/api/trash/cleanup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ kind, path: target.path }),
        });
        const parsed = await parseServerResponse(res, t`Failed to clean up after trash`);
        if (!parsed.ok) {
          console.warn('[FileTree] trash-cleanup failed', {
            target: `${target.kind}:${target.path}`,
            reason: parsed.title,
          });
          failedCleanups.push({ target, reason: parsed.title });
          continue;
        }
        const success = parseSuccessOrWarn(
          TrashCleanupSuccessSchema,
          parsed.body,
          'trash-cleanup',
          { deletedDocNames: [] },
        );
        deletedDocNames.push(...success.deletedDocNames);
        if (kind === 'folder') {
          deletedFolderPaths.push(target.path);
        }
      } catch (err) {
        console.warn('[FileTree] trash-cleanup threw', {
          target: `${target.kind}:${target.path}`,
          err,
        });
        failedCleanups.push({ target, reason: t`Network error during cleanup` });
      }
    }
    if (failedCleanups.length > 0) {
      const failedCount = failedCleanups.length;
      toast.error(
        t`Server-side cleanup failed for ${plural(failedCount, { one: '# item', other: '# items' })}`,
        {
          description: t`The file is in your Trash; the file-watcher will reconcile.`,
        },
      );
    }
    if (failedCleanups.length === trashed.length && trashed.length > 0) {
      return null;
    }
    return { deletedDocNames, deletedFolderPaths };
  }

  async function handleDeleteTargets(targets: FileTreeTarget[]) {
    const deleteTargets = targets.map((target) =>
      canonicalizeAssetTargetForDelete(target, documentsRef.current),
    );
    const firstTarget = deleteTargets[0];
    if (!firstTarget) return;

    const blockingConflicts = activeConflicts.filter((c) =>
      deleteTargets.some((t) => {
        if (t.kind === 'file') {
          const fileWithExt = `${t.path}${t.docExt ?? '.md'}`;
          return c.file === fileWithExt;
        }
        if (t.kind === 'folder') return c.file.startsWith(`${t.path}/`);
        return false;
      }),
    );
    if (blockingConflicts.length > 0) {
      const sample = blockingConflicts.slice(0, 3).map((c) => c.file);
      const rest =
        blockingConflicts.length > sample.length
          ? `, +${blockingConflicts.length - sample.length} more`
          : '';
      toast.error('Cannot delete files with unresolved conflicts', {
        description: `Resolve the conflict on ${sample.join(', ')}${rest} before deleting.`,
      });
      return;
    }

    setBusyPath(firstTarget.path);
    setDeleteRequest(null);

    const bridge = typeof window !== 'undefined' ? window.okDesktop : undefined;
    try {
      if (bridge && workspace) {
        const { trashed, failed } = await trashTargetsViaShell(deleteTargets, bridge, workspace);
        if (trashed.length > 0) {
          const cleanup = await postTrashCleanup(trashed);
          if (cleanup) {
            await applyDeleteAftermath(
              trashed,
              cleanup.deletedDocNames,
              cleanup.deletedFolderPaths,
            );
          } else {
            const localDocNames = trashed.filter((t) => t.kind === 'file').map((t) => t.path);
            const localFolderPaths = trashed.filter((t) => t.kind === 'folder').map((t) => t.path);
            await applyDeleteAftermath(trashed, localDocNames, localFolderPaths);
          }
        }
        if (failed.length > 0) {
          setTrashFailure({ failed, originalTargets: [...deleteTargets] });
        }
        setBusyPath(null);
      } else {
        const ok = await hardDeleteTargets(deleteTargets);
        setBusyPath(null);
        if (!ok) resetModelToDocuments();
      }
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      console.warn('[FileTree] delete failed:', err);
      toast.error(t`Could not complete delete`, { description: detail });
      setBusyPath(null);
      resetModelToDocuments();
    }
  }

  async function handleTrashFailureDeletePermanently() {
    if (!trashFailure) return;
    const failedSet = new Set(trashFailure.failed.map((t) => `${t.kind}:${t.path}`));
    const targetsToHardDelete = trashFailure.originalTargets.filter((t) =>
      failedSet.has(`${t.kind}:${t.path}`),
    );
    setTrashFailure(null);
    if (targetsToHardDelete.length === 0) return;
    setBusyPath(targetsToHardDelete[0]?.path ?? null);
    try {
      const ok = await hardDeleteTargets(targetsToHardDelete);
      setBusyPath(null);
      if (!ok) resetModelToDocuments();
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      console.warn('[FileTree] hard-delete fallback failed:', err);
      toast.error(t`Could not complete delete`, { description: detail });
      setBusyPath(null);
      resetModelToDocuments();
    }
  }

  async function handleTrashFailureRetry() {
    if (!trashFailure) return;
    const failedSet = new Set(trashFailure.failed.map((f) => `${f.kind}:${f.path}`));
    const originals = trashFailure.originalTargets.filter((t) =>
      failedSet.has(`${t.kind}:${t.path}`),
    );
    setTrashFailure(null);
    await handleDeleteTargets(originals);
  }

  const handleDeleteTargetsRef = useRef(handleDeleteTargets);
  useEffect(() => {
    handleDeleteTargetsRef.current = handleDeleteTargets;
  });

  useEffect(() => {
    return subscribeToFileTreeMenuActionDelete((target) => {
      if (target.kind === 'doc' || target.kind === 'folder-index') {
        const docName = target.docName;
        const docEntry = documentsRef.current.find(
          (entry): entry is DocumentEntry => isDocumentEntry(entry) && entry.docName === docName,
        );
        void handleDeleteTargetsRef.current([
          {
            kind: 'file',
            path: docName,
            name: docName.split('/').pop() ?? docName,
            docExt: docEntry?.docExt,
          },
        ]);
        return;
      }
      if (target.kind === 'folder') {
        void handleDeleteTargetsRef.current([
          {
            kind: 'folder',
            path: target.folderPath,
            name: target.folderPath.split('/').pop() ?? target.folderPath,
          },
        ]);
        return;
      }
      if (target.kind === 'asset') {
        void handleDeleteTargetsRef.current([
          {
            kind: 'asset',
            path: target.assetPath,
            name: target.assetPath.split('/').pop() ?? target.assetPath,
          },
        ]);
        return;
      }
      console.warn(
        JSON.stringify({
          event: 'file-tree-menu-action-delete-unsupported-kind',
          kind: target.kind,
        }),
      );
    });
  }, []);

  useEffect(() => {
    return subscribeToFileTreeMenuActionDuplicate((target: ResolvedNavigationTarget) => {
      if (target.kind === 'doc' || target.kind === 'folder-index') {
        const docName = target.docName;
        const docEntry = documentsRef.current.find(
          (entry): entry is DocumentEntry => isDocumentEntry(entry) && entry.docName === docName,
        );
        void handleDuplicateTargetRef.current({
          kind: 'file',
          path: docName,
          name: docName.split('/').pop() ?? docName,
          docExt: docEntry?.docExt,
        });
        return;
      }
      if (target.kind === 'folder') {
        void handleDuplicateTargetRef.current({
          kind: 'folder',
          path: target.folderPath,
          name: target.folderPath.split('/').pop() ?? target.folderPath,
        });
        return;
      }
      console.warn(
        JSON.stringify({
          event: 'file-tree-menu-action-duplicate-unsupported-kind',
          kind: target.kind,
        }),
      );
    });
  }, []);

  useEffect(() => {
    return subscribeToFileTreeMenuActionRename((target) => {
      if (target.kind === 'doc' || target.kind === 'folder-index') {
        const docName = target.docName;
        const docEntry = documentsRef.current.find(
          (entry): entry is DocumentEntry => isDocumentEntry(entry) && entry.docName === docName,
        );
        const treePath = docNameToTreePath(docName, docEntry?.docExt);
        model.startRenaming(treePath);
        return;
      }
      if (target.kind === 'folder') {
        model.startRenaming(target.folderPath);
        return;
      }
      if (target.kind === 'asset') {
        model.startRenaming(target.assetPath);
        return;
      }
      console.warn(
        JSON.stringify({
          event: 'file-tree-menu-action-rename-unsupported-kind',
          kind: target.kind,
        }),
      );
    });
  }, [model]);

  function cancelCurrentHoverPrewarm() {
    const current = hoveredPrewarmDocRef.current;
    if (current) cancelHoverPrewarm(current);
    hoveredPrewarmDocRef.current = null;
  }

  function handleTreeMouseMove(event: ReactMouseEvent<HTMLElement>) {
    const path = findTreeItemPath(event.nativeEvent);
    if (!path || path.endsWith('/')) {
      cancelCurrentHoverPrewarm();
      return;
    }
    const docName = treeFilePathToDocName(path);
    const entry = documentsRef.current.find((item) => fileEntryToTreePath(item) === path);
    if (entry && isAssetEntry(entry)) {
      cancelCurrentHoverPrewarm();
      return;
    }
    if (entry && isDocumentEntry(entry) && isDocumentOverOpenByteLimit(entry.size)) {
      cancelCurrentHoverPrewarm();
      return;
    }
    if (hoveredPrewarmDocRef.current === docName) return;
    cancelCurrentHoverPrewarm();
    hoveredPrewarmDocRef.current = docName;
    scheduleHoverPrewarm(docName, (nextDocName) => prewarm(nextDocName));
  }

  function handleTreeClickCapture(event: ReactMouseEvent<HTMLElement>) {
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

    const item = findTreeItemElement(event.nativeEvent);
    if (!item || item.getAttribute('aria-selected') !== 'true') return;

    const rawPath = item.dataset.itemPath;
    if (!rawPath) return;

    const path =
      item.dataset.itemType === 'folder' ? folderPathToTreeDirectoryPath(rawPath) : rawPath;
    if (model.getSelectedPaths().length !== 1) return;

    if (item.dataset.itemType === 'folder') {
      const folderPath = treeDirectoryPathToFolderPath(path);
      if (window.location.hash === hashFromFolderPath(folderPath)) return;
      queueMicrotask(() => navigateToFolderWithPulse(folderPath));
      return;
    }

    const docName = treeFilePathToDocName(path);
    if (window.location.hash === hashFromDocName(docName)) return;
    queueMicrotask(() => activateTreePath(path));
  }

  if (loading) {
    return <FileTreeSkeleton />;
  }

  if (documents.length === 0) {
    if (error) {
      return (
        <div className="flex flex-1 items-center justify-center py-8">
          <span className="select-none text-sidebar-foreground/50 text-sm">{error}</span>
        </div>
      );
    }
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 py-8">
        <span className="select-none text-sidebar-foreground/30 text-sm">
          <Trans>No files yet.</Trans>
        </span>
        <Button
          variant="link"
          size="sm"
          className="font-mono uppercase"
          onClick={() => startCreating('file', '')}
        >
          <Trans>Create your first file</Trans>
        </Button>
      </div>
    );
  }

  const anyActionBusy = busyPath !== null;
  const primaryDeleteTarget = deleteRequest?.targets[0] ?? null;
  return (
    <>
      <div ref={fileTreeHostRef} className="flex min-h-0 flex-1 flex-col">
        <PierreFileTree
          header={
            (error || truncatedShownCount !== null) && (
              <>
                {error && (
                  <span role="alert" className="px-3 pb-1 text-destructive text-xs">
                    {error}
                  </span>
                )}
                {truncatedShownCount !== null && (
                  <span role="status" className="px-3 pb-1 text-muted-foreground text-xs">
                    <Trans>
                      Showing first {truncatedShownCount} items — use search to find others
                    </Trans>
                  </span>
                )}
              </>
            )
          }
          model={model}
          style={createFileTreeStyle(resolvedTheme)}
          onClickCapture={handleTreeClickCapture}
          onMouseMove={handleTreeMouseMove}
          onMouseLeave={cancelCurrentHoverPrewarm}
          renderContextMenu={(item, context) => (
            <FileTreeMenu
              item={item}
              context={context}
              anyActionBusy={anyActionBusy}
              workspace={workspace}
              handoff={handoff}
              model={model}
              okignoreBinding={okignoreBinding}
              projectLocalBinding={projectLocalBinding}
              mergedConfig={merged}
              onStartCreating={startCreating}
              onCreateFromTemplate={(parentDir, templateName) =>
                startCreating('file', parentDir, { template: templateName })
              }
              onDuplicate={handleDuplicateTarget}
              onDelete={(targets) => setDeleteRequest({ targets })}
              onExpandSubtree={expandSubtree}
              onCollapseSubtree={collapseSubtree}
              folderTreePaths={folderTreePaths}
              isAsset={assetTreePaths.has(item.path)}
              documents={documents}
            />
          )}
        />
      </div>
      <Dialog
        open={!!deleteRequest}
        onOpenChange={(open) => {
          if (!open && !busyPath) setDeleteRequest(null);
        }}
      >
        {deleteRequest && primaryDeleteTarget && (
          <DeleteConfirmationDialog
            {...(() => {
              const variant: 'electron' | 'web' =
                typeof window !== 'undefined' && window.okDesktop != null ? 'electron' : 'web';
              const copy = selectTrashConfirmCopy(variant, deleteRequest.targets);
              if (copy) {
                return {
                  customTitle: copy.title,
                  customDescription: '',
                  customDetail: copy.detail,
                  customConfirmLabel: copy.confirmLabel,
                  customConfirmLabelBusy: copy.confirmLabelBusy,
                  children: copy.listedTargets ? (
                    <ul className="flex flex-col gap-1 font-mono text-foreground text-xs">
                      {copy.listedTargets.map((target) => (
                        <li key={`${target.kind}:${target.path}`} data-testid="delete-target-row">
                          {trashTargetDisplayName(target)}
                        </li>
                      ))}
                    </ul>
                  ) : null,
                };
              }
              const targetCount = deleteRequest.targets.length;
              const folderName = primaryDeleteTarget.name;
              return {
                itemName:
                  targetCount === 1
                    ? primaryDeleteTarget.kind === 'folder'
                      ? `${primaryDeleteTarget.name}/`
                      : primaryDeleteTarget.kind === 'file'
                        ? `${primaryDeleteTarget.name}${primaryDeleteTarget.docExt ?? '.md'}`
                        : primaryDeleteTarget.name
                    : undefined,
                customTitle: targetCount > 1 ? t`Delete selected items` : undefined,
                customDescription:
                  targetCount > 1
                    ? t`Are you sure you want to delete ${targetCount} selected items? Folders and all files inside them will be deleted. This action cannot be undone.`
                    : primaryDeleteTarget.kind === 'folder'
                      ? t`Are you sure you want to delete ${folderName}/ and all files inside? This action cannot be undone.`
                      : undefined,
              };
            })()}
            isSubmitting={busyPath !== null}
            onDelete={() => handleDeleteTargets(deleteRequest.targets)}
          />
        )}
      </Dialog>
      <Dialog
        open={!!trashFailure}
        onOpenChange={(open) => {
          if (!open && !busyPath) setTrashFailure(null);
        }}
      >
        {trashFailure && (
          <TrashFailureModal
            failedTargets={trashFailure.failed}
            isSubmitting={busyPath !== null}
            onDeletePermanently={handleTrashFailureDeletePermanently}
            onRetry={handleTrashFailureRetry}
            onCancel={() => setTrashFailure(null)}
          />
        )}
      </Dialog>
      <NewItemDialog
        open={newItemRequest !== null}
        onOpenChange={(open) => {
          if (!open) setNewItemRequest(null);
        }}
        kind="file"
        initialDir={newItemRequest?.parentDir ?? ''}
        defaultToTemplate
      />
    </>
  );
}

function findTreeItemPath(event: MouseEvent): string | null {
  return findTreeItemElement(event)?.dataset.itemPath ?? null;
}

function findTreeItemElement(event: MouseEvent): HTMLElement | null {
  for (const entry of event.composedPath()) {
    if (entry instanceof HTMLElement && entry.dataset.itemPath) {
      return entry;
    }
  }
  return null;
}

const FILE_TREE_SKELETON_ROW_WIDTHS = ['w-3/4', 'w-2/3', 'w-4/5', 'w-1/2', 'w-3/5', 'w-2/3'];

function FileTreeSkeleton() {
  const { t } = useLingui();
  return (
    <div
      className="flex flex-1 flex-col gap-1 px-2 py-2"
      role="status"
      aria-busy="true"
      aria-label={t`Loading files`}
    >
      {FILE_TREE_SKELETON_ROW_WIDTHS.map((width, index) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length static decoration list
          key={index}
          className="flex h-6 items-center gap-2"
        >
          <Skeleton className="h-3 w-3 shrink-0 rounded-sm" />
          <Skeleton className={`h-3 ${width}`} />
        </div>
      ))}
    </div>
  );
}
