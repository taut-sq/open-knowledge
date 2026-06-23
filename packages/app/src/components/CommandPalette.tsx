// biome-ignore-all lint/plugin/no-raw-html-interactive-element: pre-rule backlog — file uses raw <button>/<input>/<textarea> awaiting shadcn migration; tracked at https://github.com/inkeep/open-knowledge/blob/main/biome-plugins/README.md#no-raw-html-interactive-elementgrit

import { SHOW_INSTALL_SKILL } from '@inkeep/open-knowledge-core';
import { Plural, Trans, useLingui } from '@lingui/react/macro';
import {
  Box,
  Download,
  FilePlus2,
  FileText,
  FolderOpen,
  FolderPlus,
  Hash,
  LayoutGrid,
  Loader2,
  Network,
  Package,
  Plus,
  Settings,
  Sparkles,
} from 'lucide-react';
import {
  type Dispatch,
  type KeyboardEvent as ReactKeyboardEvent,
  type SetStateAction,
  useDeferredValue,
  useEffect,
  useRef,
  useState,
} from 'react';
import { CreateProjectDialog } from '@/components/CreateProjectDialog';
import {
  filterOmnibarRecents,
  loadOmnibarRecents,
  makeOmnibarRecentKey,
  type OmnibarRecentEntry,
  rememberOmnibarRecent,
  saveOmnibarRecents,
} from '@/components/command-palette-recents';
import {
  buildWorkspaceEntries,
  classifyOmnibarSearchHint,
  fetchWorkspaceSearchEntries,
  matchesCommandQuery,
  SEMANTIC_RESULT_LIMIT,
  searchWorkspaceEntries,
  splitTextByQueryMatches,
  type WorkspaceEntry,
  type WorkspaceSearchEntry,
} from '@/components/command-palette-search';
import { computeSemanticModeView } from '@/components/command-palette-semantic';
import {
  fetchDocsForTag,
  fetchTagsList,
  filterTagList,
  parseTagPaletteQuery,
  TAG_QUERY_PREFIX,
  type TagDocEntry,
} from '@/components/command-palette-tag-search';
import { requestDocPanelTab } from '@/components/doc-panel-events';
import { defaultInitialDir } from '@/components/file-tree-utils';
import { NewItemDialog } from '@/components/NewItemDialog';
import { usePageList } from '@/components/PageListContext';
import { SeedDialog } from '@/components/SeedDialog';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from '@/components/ui/command';
import { useDocumentContext } from '@/editor/DocumentContext';
import type { TagSummaryEntry } from '@/editor/extensions/tag-suggestion';
import { useIsEmbedded } from '@/hooks/use-is-embedded';
import { useSemanticSearchStatus } from '@/hooks/use-semantic-search-status';
import type { OkDesktopBridge, RecentProjectEntry } from '@/lib/desktop-bridge-types';
import { hashFromDocName } from '@/lib/doc-hash';
import { runWithToast as runWithToastBase } from '@/lib/error-state';
import { VISIBLE_TARGETS } from '@/lib/handoff/targets';
import { formatShortcut, matchesKeyboardShortcut } from '@/lib/keyboard-shortcuts';
import { useSingleFileMode } from '@/lib/single-file-mode';
import { SETTINGS_OPEN_HASH } from '@/lib/use-settings-route';
import { useWorkspace } from '@/lib/use-workspace';
import { cn } from '@/lib/utils.ts';
import { buildHandoffInput, useHandoffDispatch } from './handoff/useHandoffDispatch';
import { useInstalledAgents } from './handoff/useInstalledAgents';

const COMMAND_PALETTE_SEARCH_TIMEOUT_MS = 3000;

export const runWithToast = (
  fn: () => Promise<void>,
  fallback: string,
  toastApi?: { error(msg: string): void },
): Promise<void> => runWithToastBase(fn, fallback, toastApi, 'CommandPalette');

interface CommandPaletteProps {
  bridge?: OkDesktopBridge | null;
  open: boolean;
  onOpenChange: Dispatch<SetStateAction<boolean>>;
}

function navigateToDocHash(docName: string): void {
  window.location.assign(hashFromDocName(docName));
}

function resolveCreateInitialDir(
  activeTarget: ReturnType<typeof useDocumentContext>['activeTarget'],
  activeDocName: string | null,
): string {
  if (activeTarget?.kind === 'folder' || activeTarget?.kind === 'folder-index') {
    return activeTarget.folderPath;
  }
  return defaultInitialDir(activeDocName);
}

export function NavigationItem({
  entry,
  query = '',
  onSelect,
  disabled = false,
}: {
  entry: WorkspaceEntry | WorkspaceSearchEntry | OmnibarRecentEntry;
  query?: string;
  onSelect: () => void;
  disabled?: boolean;
}) {
  const Icon = entry.kind === 'folder' ? FolderOpen : FileText;
  const title =
    'title' in entry && entry.title ? entry.title : (entry.path.split('/').pop() ?? entry.path);
  const snippet = 'snippet' in entry ? entry.snippet : undefined;

  return (
    <CommandItem
      value={`${entry.kind} ${entry.path}`}
      onSelect={onSelect}
      disabled={disabled}
      data-testid={`command-palette-nav-${entry.kind}-${entry.path}`}
      className="items-start"
    >
      <Icon className="mt-0.5" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="truncate font-medium">
          <HighlightedText query={query} text={title} />
        </span>
        <span className="truncate text-muted-foreground text-xs">
          <HighlightedText query={query} text={entry.path} />
        </span>
        {snippet ? (
          <span className="max-h-10 overflow-hidden text-muted-foreground text-xs leading-relaxed">
            <HighlightedText query={query} text={snippet} />
          </span>
        ) : null}
      </div>
    </CommandItem>
  );
}

function SearchHint({
  mode,
  inExclusiveMode,
  paletteModeKind,
}: {
  mode: ReturnType<typeof classifyOmnibarSearchHint>;
  inExclusiveMode: boolean;
  paletteModeKind: 'normal' | 'tag-list' | 'tag-docs';
}) {
  if (inExclusiveMode) return null;
  if (paletteModeKind !== 'normal') return null;
  if (mode === 'idle' || mode === 'content') return null;
  return (
    <div
      aria-live="polite"
      data-testid={`command-palette-search-hint-${mode}`}
      className="border-t px-3 py-2 text-muted-foreground text-xs"
    >
      {mode === 'name-only' ? (
        <Trans>
          Search matches file names, paths, and folders. Open a file to search its body (⌘F).
        </Trans>
      ) : mode === 'truncated' ? (
        <Trans>
          Results capped — this workspace has more files than search can index. A missing file may
          be a cap artifact, not a typo.
        </Trans>
      ) : (
        <Trans>No matches. Some files are excluded from search (hidden or ignored files).</Trans>
      )}
    </div>
  );
}

function HighlightedText({ text, query }: { text: string; query: string }) {
  const segments = splitTextByQueryMatches(text, query);
  return (
    <>
      {segments.map((segment) => {
        const key = `${segment.start}:${segment.match ? 'match' : 'plain'}`;
        return segment.match ? (
          <mark key={key} className="rounded-sm bg-primary/10 px-0.5 font-semibold text-primary">
            {segment.text}
          </mark>
        ) : (
          <span key={key}>{segment.text}</span>
        );
      })}
    </>
  );
}

export function computeVisibleSearchResults({
  searchResults,
  fallbackSearchResults,
  searchStatus,
}: {
  searchResults: readonly WorkspaceSearchEntry[];
  fallbackSearchResults: readonly WorkspaceEntry[];
  searchStatus: 'idle' | 'loading' | 'success' | 'error';
}): readonly (WorkspaceEntry | WorkspaceSearchEntry)[] {
  if (searchResults.length > 0) return searchResults;
  if (searchStatus === 'success') return [];
  return fallbackSearchResults;
}

export function CommandPalette({ bridge = null, open, onOpenChange }: CommandPaletteProps) {
  const { t } = useLingui();
  const singleFile = useSingleFileMode();
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const trimmedDeferredQuery = deferredQuery.trim();
  const [searchResults, setSearchResults] = useState<WorkspaceSearchEntry[]>([]);
  const [searchStatus, setSearchStatus] = useState<'idle' | 'loading' | 'success' | 'error'>(
    'idle',
  );
  const [searchTruncated, setSearchTruncated] = useState(false);
  const [isSemanticMode, setIsSemanticMode] = useState(false);
  const [semanticResults, setSemanticResults] = useState<WorkspaceSearchEntry[]>([]);
  const [semanticFiredQuery, setSemanticFiredQuery] = useState<string | null>(null);
  const [semanticStatus, setSemanticStatus] = useState<'idle' | 'loading' | 'success' | 'error'>(
    'idle',
  );
  const [projectRecents, setProjectRecents] = useState<RecentProjectEntry[]>([]);
  const [recentNavigation, setRecentNavigation] = useState<OmnibarRecentEntry[]>([]);
  const [createDialogKind, setCreateDialogKind] = useState<'file' | 'folder' | null>(null);
  const [seedDialogOpen, setSeedDialogOpen] = useState(false);
  const [createProjectOpen, setCreateProjectOpen] = useState(false);
  const [tagsList, setTagsList] = useState<TagSummaryEntry[]>([]);
  const [tagsListStatus, setTagsListStatus] = useState<'idle' | 'loading' | 'success' | 'error'>(
    'idle',
  );
  const [tagDocs, setTagDocs] = useState<TagDocEntry[]>([]);
  const [tagDocsStatus, setTagDocsStatus] = useState<'idle' | 'loading' | 'success' | 'error'>(
    'idle',
  );
  const tagsListFetchedRef = useRef(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const semanticAbortRef = useRef<AbortController | null>(null);
  const semanticTimerRef = useRef<number | null>(null);
  const { activeDocName, activeTarget } = useDocumentContext();
  const {
    pages,
    pageTitles,
    pageMeta,
    folderPaths,
    filePaths,
    loading: pagesLoading,
  } = usePageList();
  const workspace = useWorkspace();
  const { states: installStates, refresh: refreshInstallStates } = useInstalledAgents();
  const { dispatch: dispatchHandoff } = useHandoffDispatch();
  const { status: semanticCapability, refresh: refreshSemanticStatus } = useSemanticSearchStatus({
    enabled: open,
  });
  const semanticCapable =
    (semanticCapability?.enabled ?? false) && (semanticCapability?.keyPresent ?? false);
  const semanticIndexedCount = semanticCapability?.embedded ?? 0;
  const semanticTotalCount = semanticCapability?.total ?? 0;
  const semanticIndexing =
    semanticCapable && semanticTotalCount > 0 && semanticIndexedCount < semanticTotalCount;
  // biome-ignore lint/correctness/useExhaustiveDependencies: refreshSemanticStatus is behaviorally stable; re-arm only on the gating booleans.
  useEffect(() => {
    if (!open || !isSemanticMode || !semanticIndexing) return;
    const id = window.setInterval(() => refreshSemanticStatus(), 2500);
    return () => window.clearInterval(id);
  }, [open, isSemanticMode, semanticIndexing]);
  const handoffInput = buildHandoffInput({ docName: activeDocName, workspace });

  const workspaceEntries = buildWorkspaceEntries(
    pages,
    folderPaths,
    pageTitles,
    pageMeta,
    filePaths,
  );
  const validRecentKeys = new Set(
    workspaceEntries.map((entry) => makeOmnibarRecentKey(entry.kind, entry.path)),
  );
  const visibleRecents = filterOmnibarRecents(recentNavigation, validRecentKeys);
  const currentPath = bridge?.config.projectPath ?? null;
  const switchableProjects = bridge ? projectRecents.filter((row) => row.path !== currentPath) : [];
  const initialCreateDir = resolveCreateInitialDir(activeTarget, activeDocName);
  const fallbackSearchResults =
    trimmedDeferredQuery === ''
      ? []
      : searchWorkspaceEntries(workspaceEntries, trimmedDeferredQuery, 8);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const isTrigger = matchesKeyboardShortcut(e, 'command-palette');
      if (!isTrigger) return;
      e.preventDefault();
      onOpenChange(!open);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onOpenChange, open]);

  useEffect(() => {
    if (open) {
      setRecentNavigation(loadOmnibarRecents());
      void refreshInstallStates();
      if (bridge) {
        let cancelled = false;
        void runWithToast(async () => {
          const result = await bridge.project.listRecent();
          if (!cancelled) setProjectRecents(result);
        }, t`Failed to load recent projects.`);
        return () => {
          cancelled = true;
        };
      }
      return;
    }
    setQuery('');
    setTagsList([]);
    setTagsListStatus('idle');
    tagsListFetchedRef.current = false;
    setTagDocs([]);
    setTagDocsStatus('idle');
    setIsSemanticMode(false);
    semanticAbortRef.current?.abort();
    semanticAbortRef.current = null;
    if (semanticTimerRef.current !== null) {
      window.clearTimeout(semanticTimerRef.current);
      semanticTimerRef.current = null;
    }
    setSemanticResults([]);
    setSemanticFiredQuery(null);
    setSemanticStatus('idle');
  }, [open, bridge, refreshInstallStates, t]);

  useEffect(() => {
    void query;
    if (listRef.current) listRef.current.scrollTop = 0;
  }, [query]);

  const knownTagNames = new Set(tagsList.map((tag) => tag.name));
  const paletteMode = isSemanticMode
    ? ({ kind: 'normal', query: deferredQuery } as const)
    : parseTagPaletteQuery(deferredQuery, knownTagNames);
  const isTagMode = paletteMode.kind !== 'normal';
  const inExclusiveMode = isTagMode || isSemanticMode;
  const tagListQuery = paletteMode.kind === 'tag-list' ? paletteMode.query : '';
  const tagDocsName = paletteMode.kind === 'tag-docs' ? paletteMode.tagName : '';
  const semanticQueryText = query.trim();
  const semanticView = isSemanticMode
    ? computeSemanticModeView({
        query: semanticQueryText,
        firedQuery: semanticFiredQuery,
        status: semanticStatus,
        resultCount: semanticResults.length,
      })
    : null;
  const semanticSubmitQuery = semanticView?.submit?.query ?? '';
  const semanticResultsLabel = semanticView?.results.forQuery ?? '';

  useEffect(() => {
    if (!open || !isTagMode) return;
    if (tagsListFetchedRef.current) return;
    tagsListFetchedRef.current = true;
    setTagsListStatus('loading');
    let cancelled = false;
    void fetchTagsList()
      .then((tags) => {
        if (cancelled) return;
        setTagsList(tags);
        setTagsListStatus('success');
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        console.error('[command-palette-tag] fetch tags failed', err);
        setTagsList([]);
        setTagsListStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [open, isTagMode]);

  const tagDocsTarget = paletteMode.kind === 'tag-docs' ? paletteMode.tagName : null;
  useEffect(() => {
    if (!open || tagDocsTarget === null) {
      setTagDocs([]);
      setTagDocsStatus('idle');
      return;
    }
    setTagDocsStatus('loading');
    setTagDocs([]);
    let cancelled = false;
    void fetchDocsForTag(tagDocsTarget)
      .then((docs) => {
        if (cancelled) return;
        setTagDocs(docs);
        setTagDocsStatus('success');
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        console.error('[command-palette-tag] fetch tag docs failed', err);
        setTagDocs([]);
        setTagDocsStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [open, tagDocsTarget]);

  useEffect(() => {
    if (!open || !trimmedDeferredQuery || inExclusiveMode || pagesLoading) {
      setSearchResults([]);
      setSearchStatus('idle');
      setSearchTruncated(false);
      return;
    }

    const controller = new AbortController();
    setSearchStatus('loading');
    let timedOut = false;
    const timeout = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
      setSearchResults([]);
      setSearchStatus('error');
      setSearchTruncated(false);
    }, COMMAND_PALETTE_SEARCH_TIMEOUT_MS);

    void fetchWorkspaceSearchEntries(trimmedDeferredQuery, { signal: controller.signal })
      .then(({ entries, truncated }) => {
        window.clearTimeout(timeout);
        setSearchResults(entries);
        setSearchTruncated(truncated);
        setSearchStatus('success');
      })
      .catch((error: unknown) => {
        window.clearTimeout(timeout);
        if (error instanceof Error && error.name === 'AbortError' && !timedOut) return;
        setSearchResults([]);
        setSearchStatus('error');
        setSearchTruncated(false);
      });

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [open, trimmedDeferredQuery, inExclusiveMode, pagesLoading]);

  const runAction = (fn: () => Promise<void> | void, fallback = t`Command failed.`) => {
    onOpenChange(false);
    void runWithToast(async () => {
      await fn();
    }, fallback);
  };

  function rememberNavigation(entry: WorkspaceEntry | OmnibarRecentEntry) {
    const nextEntry = {
      kind: entry.kind,
      path: entry.path,
      lastOpenedAt: new Date().toISOString(),
    } satisfies OmnibarRecentEntry;
    const nextRecents = rememberOmnibarRecent(loadOmnibarRecents(), nextEntry);
    saveOmnibarRecents(nextRecents);
    setRecentNavigation(nextRecents);
  }

  function navigateToEntry(entry: WorkspaceEntry | OmnibarRecentEntry) {
    onOpenChange(false);
    rememberNavigation(entry);
    navigateToDocHash(entry.path);
  }

  const showRecentNavigation =
    !inExclusiveMode && trimmedDeferredQuery === '' && visibleRecents.length > 0;
  const visibleSearchResults = computeVisibleSearchResults({
    searchResults,
    fallbackSearchResults,
    searchStatus,
  });
  const showNavigation = !inExclusiveMode && visibleSearchResults.length > 0;
  const showSearchLoading =
    !inExclusiveMode &&
    trimmedDeferredQuery !== '' &&
    searchStatus === 'loading' &&
    !showNavigation;
  const showSearchPreparing =
    !inExclusiveMode && trimmedDeferredQuery !== '' && pagesLoading && !showNavigation;
  const showCreateFile =
    !inExclusiveMode && matchesCommandQuery(t`New file`, deferredQuery, ['create file']);
  const showCreateFolder =
    !inExclusiveMode && matchesCommandQuery(t`New folder`, deferredQuery, ['create folder']);
  const showGraphCommand =
    !inExclusiveMode &&
    activeDocName !== null &&
    matchesCommandQuery(t`Open graph`, deferredQuery, ['graph panel network']);
  const showInitializeStarterPack =
    !inExclusiveMode &&
    matchesCommandQuery(t`Initialize starter pack`, deferredQuery, [
      'scaffold',
      'seed',
      'pack',
      'starter',
    ]);
  const showCreateProject =
    !inExclusiveMode &&
    bridge !== null &&
    matchesCommandQuery(t`New project`, deferredQuery, ['create new project scaffold']);
  const showProjectOpenFolder =
    !inExclusiveMode &&
    bridge !== null &&
    matchesCommandQuery(t`Open folder on disk`, deferredQuery, ['project']);
  const showProjectSwitch =
    !inExclusiveMode &&
    !singleFile &&
    bridge !== null &&
    matchesCommandQuery(t`Switch project`, deferredQuery, ['switch project navigator projects']);
  const showSettings =
    !inExclusiveMode &&
    !singleFile &&
    matchesCommandQuery(t`Settings`, deferredQuery, ['preferences config']);
  const showInstallClaudeDesktop =
    SHOW_INSTALL_SKILL &&
    !inExclusiveMode &&
    matchesCommandQuery(t`Install for Claude Chat & Cowork (Desktop App)`, deferredQuery, [
      'claude desktop install cowork',
    ]);
  const showProjectRecents =
    !inExclusiveMode &&
    bridge !== null &&
    switchableProjects.length > 0 &&
    (trimmedDeferredQuery === '' ||
      switchableProjects.some((row) =>
        matchesCommandQuery(`${row.name} ${row.path}`, deferredQuery, ['open recent project']),
      ));
  const isEmbedded = useIsEmbedded();
  const showAgentGroup =
    !inExclusiveMode &&
    !isEmbedded &&
    handoffInput !== null &&
    (trimmedDeferredQuery === '' ||
      VISIBLE_TARGETS.some((target) => {
        const displayName = target.displayName;
        return matchesCommandQuery(t`Open with AI ${displayName}`, deferredQuery, [
          target.id,
          'agent handoff',
          'open in',
        ]);
      }));
  const tagListItems =
    paletteMode.kind === 'tag-list' ? filterTagList(tagsList, paletteMode.query) : [];
  const showTagListEmpty =
    paletteMode.kind === 'tag-list' && tagsListStatus !== 'loading' && tagListItems.length === 0;
  const showTagDocsEmpty =
    paletteMode.kind === 'tag-docs' && tagDocsStatus === 'success' && tagDocs.length === 0;

  const hasAnyResults =
    inExclusiveMode ||
    showRecentNavigation ||
    showNavigation ||
    showSearchLoading ||
    showSearchPreparing ||
    showCreateFile ||
    showCreateFolder ||
    showGraphCommand ||
    showInitializeStarterPack ||
    showCreateProject ||
    showProjectOpenFolder ||
    showProjectSwitch ||
    showSettings ||
    showInstallClaudeDesktop ||
    showProjectRecents ||
    showAgentGroup;

  function navigateToTagDocs(tagName: string) {
    setQuery(`${TAG_QUERY_PREFIX}${tagName}`);
  }

  function resetSemanticState() {
    semanticAbortRef.current?.abort();
    semanticAbortRef.current = null;
    if (semanticTimerRef.current !== null) {
      window.clearTimeout(semanticTimerRef.current);
      semanticTimerRef.current = null;
    }
    setSemanticResults([]);
    setSemanticFiredQuery(null);
    setSemanticStatus('idle');
  }

  function enterSemanticMode() {
    setIsSemanticMode(true);
    if (query.startsWith(TAG_QUERY_PREFIX)) setQuery(query.slice(TAG_QUERY_PREFIX.length));
    resetSemanticState();
    inputRef.current?.focus();
  }

  function exitSemanticMode() {
    setIsSemanticMode(false);
    setQuery('');
    resetSemanticState();
    inputRef.current?.focus();
  }

  function fireSemanticSearch(raw: string) {
    const q = raw.trim();
    if (!q) return;
    if (pagesLoading) return;
    semanticAbortRef.current?.abort();
    if (semanticTimerRef.current !== null) window.clearTimeout(semanticTimerRef.current);
    const controller = new AbortController();
    semanticAbortRef.current = controller;
    setSemanticStatus('loading');
    let timedOut = false;
    const timeout = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
      setSemanticStatus('error');
    }, COMMAND_PALETTE_SEARCH_TIMEOUT_MS);
    semanticTimerRef.current = timeout;
    void fetchWorkspaceSearchEntries(q, {
      signal: controller.signal,
      semantic: true,
      limit: SEMANTIC_RESULT_LIMIT,
    })
      .then(({ entries }) => {
        clearThisFire(timeout, controller);
        setSemanticResults(entries);
        setSemanticFiredQuery(q);
        setSemanticStatus('success');
      })
      .catch((error: unknown) => {
        clearThisFire(timeout, controller);
        if (error instanceof Error && error.name === 'AbortError' && !timedOut) return;
        console.debug('[semantic-search] fire failed', { timedOut, error });
        setSemanticStatus('error');
      });
  }

  function clearThisFire(timeout: number, controller: AbortController) {
    window.clearTimeout(timeout);
    if (semanticTimerRef.current === timeout) semanticTimerRef.current = null;
    if (semanticAbortRef.current === controller) semanticAbortRef.current = null;
  }

  function onSemanticInputKeyDown(e: ReactKeyboardEvent<HTMLInputElement>) {
    if (!isSemanticMode || e.key !== 'Enter') return;
    if (semanticView?.submit) {
      e.preventDefault();
      e.stopPropagation();
      fireSemanticSearch(semanticView.submit.query);
    } else if (semanticStatus === 'loading') {
      e.preventDefault();
      e.stopPropagation();
    }
  }

  function onPaletteEscapeKeyDown(e: KeyboardEvent) {
    if (!isSemanticMode) return;
    e.preventDefault();
    exitSemanticMode();
  }

  return (
    <>
      <CommandDialog
        open={open}
        onOpenChange={onOpenChange}
        title={t`Workspace Command Palette`}
        description={t`Search files, folders, and commands for the current workspace.`}
        className="sm:max-w-2xl"
        commandProps={{
          shouldFilter: false,
          className:
            '[&_[cmdk-input-wrapper]_svg]:h-4 [&_[cmdk-input-wrapper]_svg]:w-4 [&_[cmdk-item]_svg]:h-4 [&_[cmdk-item]_svg]:w-4',
        }}
        onEscapeKeyDown={onPaletteEscapeKeyDown}
      >
        <CommandInput
          ref={inputRef}
          value={query}
          onValueChange={setQuery}
          onKeyDown={onSemanticInputKeyDown}
          placeholder={
            isSemanticMode ? t`Search by meaning` : t`Search files, folders, or commands`
          }
        />
        {/* Filter-pills row — Slack-style. Always visible so the
            available filters are discoverable without typing a magic
            prefix. Active pills highlight when their filter is in
            effect; clicking a highlighted pill exits the filter. */}
        <div className="flex flex-wrap gap-1.5 border-b px-3 py-2">
          <button
            type="button"
            onClick={() => {
              if (isSemanticMode) {
                setIsSemanticMode(false);
                resetSemanticState();
              }
              setQuery(isTagMode ? '' : TAG_QUERY_PREFIX);
              inputRef.current?.focus();
            }}
            data-testid="command-palette-filter-tag"
            data-active={isTagMode}
            aria-pressed={isTagMode}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
              isTagMode
                ? 'border-primary/30 bg-primary/10 text-primary'
                : 'border-border bg-transparent text-muted-foreground hover:bg-accent hover:text-accent-foreground',
            )}
          >
            <Hash className="size-3.5" />
            <span>
              <Trans>By tag</Trans>
            </span>
          </button>
          {/* Shown only when semantic search is set up for this project (enabled
              + key). Enters an exclusive "by meaning" mode — a deliberate-submit
              vector search, distinct from the per-keystroke lexical filters. */}
          {semanticCapable ? (
            <button
              type="button"
              onClick={() => (isSemanticMode ? exitSemanticMode() : enterSemanticMode())}
              data-testid="command-palette-filter-semantic"
              data-active={isSemanticMode}
              aria-pressed={isSemanticMode}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                isSemanticMode
                  ? 'border-primary/30 bg-primary/10 text-primary'
                  : 'border-border bg-transparent text-muted-foreground hover:bg-accent hover:text-accent-foreground',
              )}
            >
              <Sparkles className="size-3.5" />
              <span>
                <Trans>By meaning</Trans>
              </span>
            </button>
          ) : null}
        </div>
        <CommandList ref={listRef} className="subtle-scrollbar">
          {isSemanticMode && semanticView ? (
            <>
              {/* Coverage banner — the first by-meaning search lazily kicks off the
                  background embed, so the corpus may be partly (or not yet) indexed.
                  Surface it so the user knows results may be incomplete; the count
                  ticks up via the poll above. */}
              {semanticIndexing ? (
                <div
                  className="flex items-center gap-2 px-3 py-2 text-muted-foreground text-xs"
                  role="status"
                  aria-live="polite"
                  data-testid="command-palette-semantic-indexing"
                >
                  <Loader2 className="size-3.5 animate-spin" />
                  <Trans>
                    Indexing your pages — {semanticIndexedCount} of {semanticTotalCount} ready.
                    Results may be incomplete.
                  </Trans>
                </div>
              ) : null}

              {/* Submit / retry row — the action ↵ performs while the query is
                  dirty or after an error. Rendered first so it is the default
                  highlight; the input's keydown makes ↵ deterministic regardless. */}
              {semanticView.submit ? (
                <CommandGroup>
                  <CommandItem
                    value="semantic-submit"
                    onSelect={() => fireSemanticSearch(semanticSubmitQuery)}
                    data-testid="command-palette-semantic-submit"
                  >
                    {semanticView.submit.kind === 'retry' ? (
                      <span className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
                        <Sparkles />
                        <Trans>Couldn't reach the embeddings provider — press ↵ to retry</Trans>
                      </span>
                    ) : (
                      <>
                        <Sparkles />
                        <span className="min-w-0 flex-1 truncate">
                          <Trans>Search "{semanticSubmitQuery}" by meaning</Trans>
                        </span>
                        <CommandShortcut>↵</CommandShortcut>
                      </>
                    )}
                  </CommandItem>
                </CommandGroup>
              ) : null}

              {semanticView.notice === 'empty' ? (
                <CommandEmpty data-testid="command-palette-semantic-empty">
                  <Trans>Type a query, then press ↵ to search your pages by meaning.</Trans>
                </CommandEmpty>
              ) : null}
              {semanticView.notice === 'searching' ? (
                <div
                  className="flex items-center justify-center gap-2 py-6 text-muted-foreground text-sm"
                  role="status"
                  aria-live="polite"
                  data-testid="command-palette-semantic-searching"
                >
                  <Loader2 className="size-4 animate-spin" />
                  <Trans>Searching by meaning</Trans>
                </div>
              ) : null}
              {semanticView.notice === 'no-results' ? (
                <CommandEmpty data-testid="command-palette-semantic-no-results">
                  <Trans>No pages matched "{semanticQueryText}" by meaning.</Trans>
                </CommandEmpty>
              ) : null}

              {/* Held (sticky) results in the server's fusion order — no omnibar
                  fuzzy/recency re-ranking. Dimmed + labeled with the query they
                  were fetched for while the typed query has moved past them. */}
              {semanticView.results.show ? (
                <CommandGroup
                  heading={
                    semanticView.results.dimmed
                      ? t`Showing results for "${semanticResultsLabel}"`
                      : t`By meaning`
                  }
                >
                  <div
                    data-testid="command-palette-semantic-results"
                    data-dimmed={semanticView.results.dimmed}
                  >
                    {semanticResults.map((entry) => (
                      <NavigationItem
                        key={makeOmnibarRecentKey(entry.kind, entry.path)}
                        entry={entry}
                        disabled={semanticView.results.dimmed}
                        onSelect={() => navigateToEntry(entry)}
                      />
                    ))}
                  </div>
                </CommandGroup>
              ) : null}
            </>
          ) : null}
          {showSearchPreparing ? (
            <div
              className="flex items-center justify-center gap-2 py-6 text-muted-foreground text-sm"
              role="status"
              aria-live="polite"
              data-testid="command-palette-search-preparing"
            >
              <Loader2 className="size-4 animate-spin" />
              <Trans>Preparing search</Trans>
            </div>
          ) : null}
          {showSearchLoading && !showNavigation ? (
            <CommandEmpty>
              <Trans>Searching</Trans>
            </CommandEmpty>
          ) : null}
          {!hasAnyResults ? (
            <CommandEmpty>
              {searchStatus === 'error' ? (
                <Trans>Search failed.</Trans>
              ) : (
                <Trans>No matching commands.</Trans>
              )}
            </CommandEmpty>
          ) : null}

          {paletteMode.kind === 'tag-list' ? (
            <CommandGroup
              heading={paletteMode.query ? t`Tags matching "${tagListQuery}"` : t`All tags`}
            >
              {tagsListStatus === 'loading' ? (
                <CommandEmpty>
                  <Trans>Loading tags</Trans>
                </CommandEmpty>
              ) : null}
              {tagsListStatus === 'error' ? (
                <CommandEmpty>
                  <Trans>Failed to load tags. Press Escape and re-open to retry.</Trans>
                </CommandEmpty>
              ) : null}
              {showTagListEmpty ? (
                <CommandEmpty>
                  {paletteMode.query
                    ? t`No tags match "${tagListQuery}".`
                    : t`No tags yet — author \`#tagname\` in any doc to populate the index.`}
                </CommandEmpty>
              ) : null}
              {tagListItems.map((tag) => (
                <CommandItem
                  key={`tag:${tag.name}`}
                  value={`tag ${tag.name}`}
                  onSelect={() => navigateToTagDocs(tag.name)}
                  data-testid={`command-palette-tag-${tag.name}`}
                >
                  <Hash />
                  <span className="min-w-0 flex-1 truncate font-medium">{tag.name}</span>
                  <span className="ml-auto shrink-0 text-[11px] text-muted-foreground tabular-nums">
                    <Plural value={tag.count} one="# doc" other="# docs" />
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          ) : null}

          {paletteMode.kind === 'tag-docs' ? (
            <CommandGroup heading={t`Docs tagged #${tagDocsName}`}>
              {tagDocsStatus === 'loading' ? (
                <CommandEmpty>
                  <Trans>Loading docs</Trans>
                </CommandEmpty>
              ) : null}
              {tagDocsStatus === 'error' ? (
                <CommandEmpty>
                  <Trans>Failed to load docs. Press Escape and re-open to retry.</Trans>
                </CommandEmpty>
              ) : null}
              {showTagDocsEmpty ? (
                <CommandEmpty>{t`No docs registered under #${tagDocsName}.`}</CommandEmpty>
              ) : null}
              {tagDocs.map((doc) => {
                const title = doc.title || doc.docName.split('/').pop() || doc.docName;
                const viaTags = doc.matchingTags
                  .filter((tag) => tag !== paletteMode.tagName)
                  .map((tag) => `#${tag}`)
                  .join(', ');
                return (
                  <CommandItem
                    key={`tag-doc:${doc.docName}`}
                    value={`tag-doc ${doc.docName}`}
                    onSelect={() => {
                      onOpenChange(false);
                      navigateToDocHash(doc.docName);
                    }}
                    data-testid={`command-palette-tag-doc-${doc.docName}`}
                    className="items-start"
                  >
                    <FileText className="mt-0.5" />
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="truncate font-medium">{title}</span>
                      <span className="truncate text-muted-foreground text-xs">{doc.docName}</span>
                      {doc.matchingTags.length > 0 &&
                      doc.matchingTags.some((tag) => tag !== paletteMode.tagName) ? (
                        <span className="truncate text-muted-foreground text-[11px]">
                          <Trans>via {viaTags}</Trans>
                        </span>
                      ) : null}
                    </div>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          ) : null}

          {showRecentNavigation ? (
            <CommandGroup heading={t`Recently opened`}>
              {visibleRecents.map((entry) => (
                <NavigationItem
                  key={makeOmnibarRecentKey(entry.kind, entry.path)}
                  entry={entry}
                  onSelect={() => navigateToEntry(entry)}
                />
              ))}
            </CommandGroup>
          ) : null}

          {showCreateFile || showCreateFolder || showGraphCommand || showInitializeStarterPack ? (
            <CommandGroup heading={t`Commands`}>
              {showCreateFile ? (
                <CommandItem
                  value="new file create file"
                  onSelect={() => {
                    onOpenChange(false);
                    setCreateDialogKind('file');
                  }}
                  data-testid="command-palette-new-file"
                >
                  <FilePlus2 />
                  <span>
                    <Trans>New file</Trans>
                  </span>
                </CommandItem>
              ) : null}
              {showCreateFolder ? (
                <CommandItem
                  value="new folder create folder"
                  onSelect={() => {
                    onOpenChange(false);
                    setCreateDialogKind('folder');
                  }}
                  data-testid="command-palette-new-folder"
                >
                  <FolderPlus />
                  <span>
                    <Trans>New folder</Trans>
                  </span>
                </CommandItem>
              ) : null}
              {showGraphCommand ? (
                <CommandItem
                  value="open graph graph panel network"
                  onSelect={() => {
                    if (!activeDocName) return;
                    onOpenChange(false);
                    requestDocPanelTab('graph');
                  }}
                  data-testid="command-palette-open-graph"
                >
                  <Network />
                  <span>
                    <Trans>Open graph</Trans>
                  </span>
                </CommandItem>
              ) : null}
              {showInitializeStarterPack ? (
                <CommandItem
                  value="initialize starter pack scaffold seed"
                  onSelect={() => {
                    onOpenChange(false);
                    setSeedDialogOpen(true);
                  }}
                  data-testid="command-palette-initialize-starter-pack"
                >
                  <Package />
                  <span>
                    <Trans>Initialize starter pack</Trans>
                  </span>
                </CommandItem>
              ) : null}
            </CommandGroup>
          ) : null}

          {showAgentGroup ? (
            <CommandGroup heading={t`Open with AI`}>
              {VISIBLE_TARGETS.filter((target) => {
                const displayName = target.displayName;
                return matchesCommandQuery(t`Open with AI ${displayName}`, deferredQuery, [
                  target.id,
                  'agent handoff',
                  'open in',
                ]);
              }).map((target) => {
                const installState = installStates[target.id];
                const enabled = installState.installed === true && handoffInput !== null;
                const displayName = target.displayName;
                const hint =
                  installState.installed === null
                    ? t`Detecting`
                    : installState.installed === false
                      ? t`Not installed`
                      : null;
                const accessibleLabel = hint
                  ? t`Open with AI ${displayName}, ${hint}`
                  : t`Open with AI ${displayName}`;

                return (
                  <CommandItem
                    key={target.id}
                    value={`send to ai ${target.displayName} ${target.id} agent open in`}
                    disabled={!enabled}
                    onSelect={() => {
                      if (!enabled || !handoffInput) return;
                      onOpenChange(false);
                      void dispatchHandoff(target.id, handoffInput);
                    }}
                    data-testid={`command-palette-open-in-${target.id}`}
                    aria-label={accessibleLabel}
                  >
                    <span className="flex-1">
                      <Trans>Open with AI {displayName}</Trans>
                    </span>
                    {hint ? (
                      <span aria-hidden="true" className="ml-auto text-muted-foreground text-xs">
                        {hint}
                      </span>
                    ) : null}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          ) : null}

          {showCreateProject ||
          showProjectOpenFolder ||
          showProjectSwitch ||
          showSettings ||
          showInstallClaudeDesktop ? (
            <CommandGroup heading={t`Project`}>
              {showCreateProject && bridge ? (
                <CommandItem
                  value="new project create scaffold"
                  onSelect={() => {
                    onOpenChange(false);
                    setCreateProjectOpen(true);
                  }}
                  data-testid="command-palette-new-project"
                >
                  <Plus />
                  <span>
                    <Trans>New project</Trans>
                  </span>
                </CommandItem>
              ) : null}
              {showProjectOpenFolder && bridge ? (
                <CommandItem
                  value="open folder on disk project"
                  onSelect={() =>
                    runAction(async () => {
                      const path = await bridge.dialog.openFolder();
                      if (!path) return;
                      await bridge.project.open({
                        path,
                        target: 'new-window',
                        entryPoint: 'pick-existing',
                      });
                    })
                  }
                  data-testid="command-palette-open-folder"
                >
                  <FolderOpen />
                  <span>
                    <Trans>Open folder on disk</Trans>
                  </span>
                  <CommandShortcut>{formatShortcut('open-folder')}</CommandShortcut>
                </CommandItem>
              ) : null}
              {showProjectSwitch && bridge ? (
                <CommandItem
                  value="switch-project navigator projects"
                  onSelect={() =>
                    runAction(() => bridge.navigator.open(), t`Failed to open Project Navigator.`)
                  }
                  data-testid="command-palette-switch-project"
                >
                  <LayoutGrid />
                  <span>
                    <Trans>Switch project</Trans>
                  </span>
                  <CommandShortcut>{formatShortcut('switch-project')}</CommandShortcut>
                </CommandItem>
              ) : null}
              {showSettings ? (
                <CommandItem
                  value="settings preferences config"
                  onSelect={() => {
                    onOpenChange(false);
                    if (window.location.hash !== SETTINGS_OPEN_HASH) {
                      window.location.hash = SETTINGS_OPEN_HASH;
                    }
                  }}
                  data-testid="command-palette-settings"
                >
                  <Settings />
                  <span>
                    <Trans>Settings</Trans>
                  </span>
                  <CommandShortcut>{formatShortcut('settings')}</CommandShortcut>
                </CommandItem>
              ) : null}
              {showInstallClaudeDesktop ? (
                <CommandItem
                  value="install claude desktop cowork app"
                  onSelect={() => {
                    onOpenChange(false);
                    window.location.hash = '#install-claude-desktop';
                  }}
                  data-testid="command-palette-install-claude-desktop"
                >
                  <Download />
                  <span>
                    <Trans>Install for Claude Chat & Cowork (Desktop App)</Trans>
                  </span>
                </CommandItem>
              ) : null}
            </CommandGroup>
          ) : null}

          {showProjectRecents && bridge ? (
            <CommandGroup heading={t`Open recent project`}>
              {switchableProjects
                .filter((row) =>
                  matchesCommandQuery(`${row.name} ${row.path}`, deferredQuery, [
                    'open recent project',
                  ]),
                )
                .slice(0, 10)
                .map((row) => (
                  <CommandItem
                    key={row.path}
                    value={`${row.name} ${row.path} recent project`}
                    disabled={row.missing}
                    onSelect={() =>
                      runAction(
                        () =>
                          bridge.project.open({
                            path: row.path,
                            target: 'new-window',
                            entryPoint: 'recents',
                          }),
                        t`Failed to open project.`,
                      )
                    }
                    data-testid={`command-palette-recent-${row.path}`}
                    className="items-start"
                  >
                    <Box className="mt-0.5" />
                    <div className="flex min-w-0 flex-col gap-1">
                      <span className="truncate font-medium">{row.name}</span>
                      <span className="truncate text-muted-foreground text-xs">
                        {row.path}
                        {row.missing ? (
                          <>
                            {'  '}
                            <Trans>(missing)</Trans>
                          </>
                        ) : null}
                      </span>
                    </div>
                  </CommandItem>
                ))}
            </CommandGroup>
          ) : null}

          {showNavigation ? (
            <CommandGroup heading={t`Search`}>
              {visibleSearchResults.map((entry) => (
                <NavigationItem
                  key={makeOmnibarRecentKey(entry.kind, entry.path)}
                  entry={entry}
                  query={trimmedDeferredQuery}
                  onSelect={() => navigateToEntry(entry)}
                />
              ))}
            </CommandGroup>
          ) : null}
        </CommandList>

        {/* Search-hint affordance, rendered OUTSIDE `<CommandList>` (which
            cmdk gives `role="listbox"`; only option/group children are
            valid there) but still INSIDE `CommandDialog` so it shares the
            dialog's framing. Absent when at least one server hit carries a
            body snippet. The empty-query branch (`'idle'`) renders nothing
            so the Recents view is unaffected. */}
        <SearchHint
          mode={classifyOmnibarSearchHint(trimmedDeferredQuery, visibleSearchResults, {
            truncated: searchTruncated,
          })}
          inExclusiveMode={inExclusiveMode}
          paletteModeKind={paletteMode.kind}
        />
      </CommandDialog>

      <NewItemDialog
        open={createDialogKind === 'file'}
        onOpenChange={(next) => {
          if (!next) setCreateDialogKind(null);
        }}
        kind="file"
        initialDir={initialCreateDir}
      />
      <NewItemDialog
        open={createDialogKind === 'folder'}
        onOpenChange={(next) => {
          if (!next) setCreateDialogKind(null);
        }}
        kind="folder"
        initialDir={initialCreateDir}
      />
      <SeedDialog open={seedDialogOpen} onOpenChange={setSeedDialogOpen} />
      {/* Desktop-only — `showCreateProject` gates the launching command on
          `bridge !== null`, so the dialog only mounts when the bridge exists. */}
      {bridge ? (
        <CreateProjectDialog
          open={createProjectOpen}
          onOpenChange={setCreateProjectOpen}
          bridge={bridge}
        />
      ) : null}
    </>
  );
}
