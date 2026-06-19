import {
  type CreateScenario,
  composeCreatePrompt,
  composeEmptySpacePrompt,
  composeFilePrompt,
  composeFolderPrompt,
  composeSelectionPrompt,
  type DocContext,
  type HandoffOutcome,
  type HandoffPayload,
  type HandoffScope,
  type HandoffTarget,
  type TargetData,
} from '@inkeep/open-knowledge-core';
import { toast as sonnerToast } from 'sonner';
import { useConfigContext } from '@/lib/config-context';
import {
  type EnsureCoworkSkillOutcome,
  ensureCoworkSkillInstalledWithDefaults,
  reinstallCoworkSkill,
} from '@/lib/handoff/cowork-skill-install';
import { dispatchHandoff as defaultDispatchHandoff } from '@/lib/handoff/dispatch';
import { openExternal as defaultOpenExternal } from '@/lib/handoff/open-external';
import { KNOWN_TARGETS } from '@/lib/handoff/targets';
import {
  recordHandoff as defaultRecordHandoff,
  type HandoffHost,
  type HandoffStatsLine,
} from '@/lib/handoff/telemetry';
import { docNameToRelativePath, joinWorkspacePath, type Workspace } from '@/lib/workspace-paths';
import '@/lib/desktop-bridge-types';

interface SelectionContext {
  readonly relativePath: string;
  readonly instruction: string;
  readonly selectionMarkdown: string;
}

export interface HandoffDispatchInput {
  readonly docContext: DocContext | null;
  /** Folder's path relative to `workspace.contentDir`, forward-slash
   *  normalized, no trailing slash. Set by `buildFolderHandoffInput`; absent
   *  for file + project scope. The dispatch hook reads this to select between
   *  the folder and empty-space prompt templates when `docContext` is null. */
  readonly folderRelativePath?: string;
  /** Selection-scope payload — the markdown-serialized passage plus the doc
   *  it lives in and the user's instruction. Set for selection scope only;
   *  absent for file / folder / project scope. */
  readonly selection?: SelectionContext;
  /** Create-scope brief — the user's free-form description of the knowledge
   *  base they want to scaffold, typed into the empty-state "Create with
   *  <agent>" composer. Set by `buildCreateHandoffInput`; absent for every
   *  other scope. When present (even as the empty string), `selectScopedPrompt`
   *  composes via `composeCreatePrompt` instead of the bare project directive. */
  readonly createDescription?: string;
  /** Create-scope surface — `new-project` (onboarding) vs `existing-repo`
   *  (post-init). Selects the `composeCreatePrompt` framing so an existing
   *  project isn't described as a brand-new one. Set alongside
   *  `createDescription`; defaults to `new-project` if absent. */
  readonly createScenario?: CreateScenario;
  /** Optional free-text instruction the user typed in the toolbar "Open with
   *  AI" popover. Orthogonal to scope: it applies to file / folder / project
   *  (empty-space) dispatch — the three directive composers append it as a
   *  quoted `Instruction:` block. Unset for the right-click submenus and
   *  CommandPalette (which dispatch instantly with no prompt box), and for
   *  selection / create scope (which carry their own free-text via
   *  `selection.instruction` / `createDescription`). Set at the popover call
   *  site, not by the shared `build*HandoffInput` helpers. */
  readonly instruction?: string;
  readonly projectDir: string;
  readonly docPath: string;
}

export function buildHandoffInput(args: {
  readonly docName: string | null;
  readonly workspace: Workspace | null;
}): HandoffDispatchInput | null {
  if (!args.docName || !args.workspace) return null;
  const relativePath = docNameToRelativePath(args.docName);
  const { contentDir, pathSeparator } = args.workspace;
  return {
    docContext: { relativePath },
    projectDir: contentDir,
    docPath: joinWorkspacePath(contentDir, relativePath, pathSeparator),
  };
}

export function buildProjectScopedHandoffInput(args: {
  readonly workspace: Workspace | null;
}): HandoffDispatchInput | null {
  if (!args.workspace?.contentDir) return null;
  return {
    docContext: null,
    projectDir: args.workspace.contentDir,
    docPath: '',
  };
}

export function buildCreateHandoffInput(args: {
  readonly workspace: Workspace | null;
  readonly description: string;
  readonly scenario: CreateScenario;
}): HandoffDispatchInput | null {
  if (!args.workspace?.contentDir) return null;
  return {
    docContext: null,
    createDescription: args.description,
    createScenario: args.scenario,
    projectDir: args.workspace.contentDir,
    docPath: '',
  };
}

export function openInstallUrl(target: TargetData): Promise<void> {
  return defaultOpenExternal(target.installUrl).then(() => undefined);
}

export function buildFolderHandoffInput(args: {
  readonly folderRelativePath: string;
  readonly workspace: Workspace | null;
}): HandoffDispatchInput | null {
  if (!args.workspace?.contentDir) return null;
  if (!args.folderRelativePath) return null;
  return {
    docContext: null,
    folderRelativePath: args.folderRelativePath,
    projectDir: args.workspace.contentDir,
    docPath: '',
  };
}

export function buildSelectionHandoffInput(args: {
  readonly docName: string | null;
  readonly workspace: Workspace | null;
  readonly instruction: string;
  readonly selectionMarkdown: string;
}): HandoffDispatchInput | null {
  if (!args.docName || !args.workspace) return null;
  if (!args.selectionMarkdown) return null;
  const relativePath = docNameToRelativePath(args.docName);
  const { contentDir, pathSeparator } = args.workspace;
  return {
    docContext: null,
    selection: {
      relativePath,
      instruction: args.instruction,
      selectionMarkdown: args.selectionMarkdown,
    },
    projectDir: contentDir,
    docPath: joinWorkspacePath(contentDir, relativePath, pathSeparator),
  };
}

export function buildSelectionOrDocHandoffInput(args: {
  readonly docName: string | null;
  readonly workspace: Workspace | null;
  readonly instruction: string;
  readonly selectionMarkdown: string;
}): HandoffDispatchInput | null {
  return buildSelectionHandoffInput(args) ?? buildHandoffInput(args);
}

export interface ToastAction {
  readonly label: string;
  readonly onClick: () => void;
}

export interface ToastSurface {
  success(message: string): void;
  error(message: string, options?: { action?: ToastAction }): void;
}

export interface HandoffDispatchDeps {
  readonly dispatchHandoff: (payload: HandoffPayload) => Promise<HandoffOutcome>;
  readonly recordHandoff: (line: HandoffStatsLine) => Promise<void>;
  readonly toast: ToastSurface;
  readonly now: () => Date;
  readonly isElectronHost: () => boolean;
  readonly getDisplayName: (target: HandoffTarget) => string;
  readonly ensureCoworkSkillInstalled: () => Promise<EnsureCoworkSkillOutcome>;
  readonly autoOpen: boolean;
}

export const MAX_DISPATCH_ATTEMPTS = 3;

export function successToastMessage(displayName: string): string {
  return `Opened in ${displayName}.`;
}

export function errorToastMessage(displayName: string, attempt = 1): string {
  if (attempt >= MAX_DISPATCH_ATTEMPTS) {
    return `Couldn't reach ${displayName} — please try again later.`;
  }
  if (attempt === MAX_DISPATCH_ATTEMPTS - 1) {
    return `Still couldn't reach ${displayName} — try one more time?`;
  }
  return `Couldn't reach ${displayName} — try again?`;
}

export function retryActionLabel(attempt: number): string | null {
  if (attempt >= MAX_DISPATCH_ATTEMPTS) return null;
  return attempt === MAX_DISPATCH_ATTEMPTS - 1 ? 'Try one more time' : 'Retry';
}

function buildStatsLine(
  target: HandoffTarget,
  outcome: HandoffOutcome,
  host: HandoffHost,
  ts: string,
  scope: HandoffScope | undefined,
): HandoffStatsLine {
  const scopeField = scope === undefined ? {} : { scope };
  if (outcome.ok) {
    return { target, host, outcome: 'ok', ts, ...scopeField };
  }
  return { target, host, outcome: 'error', ts, reason: outcome.reason, ...scopeField };
}

export function selectScopedPrompt(
  input: HandoffDispatchInput,
  target: HandoffTarget,
  autoOpen: boolean,
): string {
  if (input.selection) {
    return composeSelectionPrompt({ ...input.selection, target });
  }
  if (input.docContext !== null) {
    return composeFilePrompt(input.docContext.relativePath, autoOpen, input.instruction);
  }
  if (input.folderRelativePath) {
    return composeFolderPrompt(input.folderRelativePath, autoOpen, input.instruction);
  }
  if (input.createDescription !== undefined) {
    return composeCreatePrompt(
      input.createDescription,
      autoOpen,
      input.createScenario ?? 'new-project',
    );
  }
  return composeEmptySpacePrompt(autoOpen, input.instruction);
}

export function composeTerminalLaunchPrompt(input: HandoffDispatchInput): string {
  return selectScopedPrompt(input, 'claude-code', false);
}

export async function runHandoffDispatch(
  target: HandoffTarget,
  input: HandoffDispatchInput,
  deps: HandoffDispatchDeps,
  attempt = 1,
): Promise<HandoffOutcome> {
  if (target === 'claude-cowork' && attempt === 1) {
    let installOutcome: EnsureCoworkSkillOutcome;
    try {
      installOutcome = await deps.ensureCoworkSkillInstalled();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      deps.toast.error(`Couldn't install Open Knowledge skill — ${message}`);
      return { ok: false, reason: 'dispatch-error', detail: `install-error: ${message}` };
    }
    if (installOutcome.kind === 'installed-now') {
      deps.toast.success(
        'Open Knowledge skill saved. Upload it in Claude Desktop, then click Cowork again.',
      );
      return { ok: true };
    }
    if (installOutcome.kind === 'install-failed') {
      const detail = installOutcome.message ?? installOutcome.reason;
      deps.toast.error(`Couldn't install Open Knowledge skill — ${detail}`);
      return { ok: false, reason: 'dispatch-error', detail: `install-failed: ${detail}` };
    }
  }

  const payload: HandoffPayload = {
    target,
    projectDir: input.projectDir,
    docPath: input.docPath,
    prompt: selectScopedPrompt(input, target, deps.autoOpen),
  };

  const outcome = await deps.dispatchHandoff(payload);

  const host: HandoffHost = deps.isElectronHost() ? 'electron' : 'web';
  const ts = deps.now().toISOString();
  const line = buildStatsLine(target, outcome, host, ts, input.selection ? 'selection' : undefined);
  await deps.recordHandoff(line);

  const displayName = deps.getDisplayName(target);
  if (outcome.ok) {
    deps.toast.success(successToastMessage(displayName));
  } else {
    const label = retryActionLabel(attempt);
    const message = errorToastMessage(displayName, attempt);
    if (label !== null) {
      deps.toast.error(message, {
        action: {
          label,
          onClick: () => {
            void runHandoffDispatch(target, input, deps, attempt + 1);
          },
        },
      });
    } else {
      deps.toast.error(message);
    }
  }

  return outcome;
}

export function getDisplayNameDefault(target: HandoffTarget): string {
  const entry = KNOWN_TARGETS.find((t) => t.id === target);
  return entry?.displayName ?? target;
}

export function isElectronHostDefault(
  windowLike: { okDesktop?: unknown } | undefined = typeof window !== 'undefined'
    ? window
    : undefined,
): boolean {
  return windowLike?.okDesktop != null;
}

export function defaultHandoffDispatchDeps(): HandoffDispatchDeps {
  return {
    dispatchHandoff: defaultDispatchHandoff,
    recordHandoff: defaultRecordHandoff,
    toast: {
      success: (message: string) => {
        sonnerToast.success(message);
      },
      error: (message: string, options?: { action?: ToastAction }) => {
        sonnerToast.error(message, options ? { action: options.action } : undefined);
      },
    },
    now: () => new Date(),
    isElectronHost: () => isElectronHostDefault(),
    getDisplayName: getDisplayNameDefault,
    ensureCoworkSkillInstalled: ensureCoworkSkillInstalledWithDefaults,
    autoOpen: true,
  };
}

interface UseHandoffDispatchResult {
  dispatch: (target: HandoffTarget, input: HandoffDispatchInput) => Promise<HandoffOutcome>;
  reinstallCoworkSkill: () => Promise<EnsureCoworkSkillOutcome>;
}

export function useHandoffDispatch(): UseHandoffDispatchResult {
  const { merged } = useConfigContext();
  const autoOpen = merged?.appearance?.preview?.autoOpen ?? true;
  return {
    dispatch: (target, input) =>
      runHandoffDispatch(target, input, { ...defaultHandoffDispatchDeps(), autoOpen }),
    reinstallCoworkSkill,
  };
}
