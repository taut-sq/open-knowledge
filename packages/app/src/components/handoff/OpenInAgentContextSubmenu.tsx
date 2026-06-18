import type { HandoffOutcome, HandoffTarget, InstallState } from '@inkeep/open-knowledge-core';
import { t } from '@lingui/core/macro';
import { Trans, useLingui } from '@lingui/react/macro';
import { Sparkles, SquareTerminal } from 'lucide-react';
import type { ReactNode } from 'react';
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@/components/ui/dropdown-menu.tsx';
import { useIsEmbedded } from '@/hooks/use-is-embedded';
import { VISIBLE_TARGETS } from '@/lib/handoff/targets';
import { TargetIcon } from './OpenInAgentMenuItem';
import { useTerminalLaunch } from './TerminalLaunchContext';
import type { HandoffDispatchInput } from './useHandoffDispatch';

export function contextRowHint(inputMissing: boolean): string | null {
  if (inputMissing) return t`No workspace`;
  return null;
}

interface OpenInAgentContextSubmenuProps {
  /** Handoff input for the right-clicked node. `null` means the row's dispatch
   *  is not actionable (no workspace metadata yet). Every row still renders
   *  disabled with a "No workspace" hint so the UX doesn't flicker. */
  readonly input: HandoffDispatchInput | null;
  /** Install state per target. Supplied by `FileTree`'s top-level
   *  `useInstalledAgents()` call so every file row shares one coordinator. */
  readonly installStates: Record<HandoffTarget, InstallState>;
  /** Host classifier — left in the prop signature for consumers that already
   *  thread it; uninstalled rows aren't rendered so it isn't read here.
   *  Web-host Cursor uses the same probe + filter as every other target now
   *  that `cursor-two-step.ts` has a `/api/spawn-cursor` fetch fallback. */
  readonly isElectronHost: boolean;
  readonly dispatch: (
    target: HandoffTarget,
    input: HandoffDispatchInput,
  ) => Promise<HandoffOutcome>;
}

export function OpenInAgentContextSubmenu(props: OpenInAgentContextSubmenuProps): ReactNode {
  const { t } = useLingui();
  const isEmbedded = useIsEmbedded();
  const terminalLaunch = useTerminalLaunch();
  if (isEmbedded) return null;
  const { input, installStates, dispatch } = props;
  const inputMissing = input === null;
  const hint = contextRowHint(inputMissing);

  const installedTargets = VISIBLE_TARGETS.filter(
    (target) => installStates[target.id]?.installed === true,
  );
  const probePending = VISIBLE_TARGETS.some(
    (target) => installStates[target.id]?.installed == null,
  );

  const showEmptyHint = installedTargets.length === 0 && terminalLaunch === null;

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <Sparkles aria-hidden="true" />
        <Trans>Open with AI</Trans>
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent>
        {installedTargets.map((target) => {
          const enabled = !inputMissing;
          const { displayName } = target;
          const accessibleLabel = hint
            ? t`Open with AI ${displayName}, ${hint}`
            : t`Open with AI ${displayName}`;
          return (
            <DropdownMenuItem
              key={target.id}
              disabled={!enabled}
              onSelect={() => {
                if (!input) return;
                void dispatch(target.id, input);
              }}
              data-testid={`file-tree-open-in-${target.id}`}
              aria-label={accessibleLabel}
            >
              <TargetIcon id={target.id} aria-hidden="true" />
              <span className="flex-1">{target.displayName}</span>
              {hint ? (
                <span aria-hidden="true" className="ml-2 text-muted-foreground text-xs">
                  {hint}
                </span>
              ) : null}
            </DropdownMenuItem>
          );
        })}
        {showEmptyHint ? (
          <DropdownMenuItem disabled data-testid="file-tree-open-in-empty">
            {probePending ? (
              <Trans>Checking for installed agents</Trans>
            ) : (
              <Trans>No installed agents found</Trans>
            )}
          </DropdownMenuItem>
        ) : null}
        {terminalLaunch !== null ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => {
                if (input === null) return;
                terminalLaunch.launchInTerminal(input);
              }}
              disabled={inputMissing}
              data-testid="file-tree-open-in-terminal"
              aria-label={hint ? t`Claude CLI, ${hint}` : t`Claude CLI`}
            >
              <SquareTerminal className="size-4" aria-hidden="true" />
              <span className="flex-1">
                <Trans>Claude CLI</Trans>
              </span>
              {hint ? (
                <span aria-hidden="true" className="ml-2 text-muted-foreground text-xs">
                  {hint}
                </span>
              ) : null}
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}
