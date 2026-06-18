import type {
  HandoffOutcome,
  HandoffTarget,
  InstallState,
  TargetData,
} from '@inkeep/open-knowledge-core';
import { Trans, useLingui } from '@lingui/react/macro';
import { Sparkles, SquareTerminal } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useIsEmbedded } from '@/hooks/use-is-embedded';
import { VISIBLE_TARGETS } from '@/lib/handoff/targets';
import { OpenInAgentMenuItem } from './OpenInAgentMenuItem';
import { useTerminalLaunch } from './TerminalLaunchContext';
import { type HandoffDispatchInput, useHandoffDispatch } from './useHandoffDispatch';
import { useInstalledAgents } from './useInstalledAgents';

interface OpenInAgentMenuProps {
  /** Active doc context. When `null`, the trigger renders disabled (nothing
   *  to dispatch). Surfaces own the docContext + projectDir + docPath. */
  readonly input: HandoffDispatchInput | null;
  readonly open?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
}

interface OpenInAgentMenuContentProps {
  readonly input: HandoffDispatchInput | null;
  readonly states: Record<HandoffTarget, InstallState>;
  readonly dispatch: (
    target: HandoffTarget,
    input: HandoffDispatchInput,
  ) => Promise<HandoffOutcome>;
  readonly isElectronHost: boolean;
  readonly align?: ComponentProps<typeof DropdownMenuContent>['align'];
  readonly className?: string;
}

function OpenInAgentMenuContent({
  input,
  states,
  dispatch,
  isElectronHost,
  align = 'end',
  className = 'min-w-[220px]',
}: OpenInAgentMenuContentProps): ReactNode {
  const { t } = useLingui();
  const terminalLaunch = useTerminalLaunch();

  const handleSelect = (target: TargetData): void => {
    if (input === null) return;
    void dispatch(target.id, input);
  };

  const installedTargets = VISIBLE_TARGETS.filter(
    (target) => states[target.id]?.installed === true,
  );
  const probePending = VISIBLE_TARGETS.some((target) => states[target.id]?.installed == null);

  const showEmptyHint = installedTargets.length === 0 && terminalLaunch === null;

  return (
    <DropdownMenuContent align={align} className={className} data-testid="open-in-agent-menu">
      {installedTargets.map((target) => {
        const installState = states[target.id];
        return (
          <OpenInAgentMenuItem
            key={target.id}
            target={target}
            installState={installState}
            isElectronHost={isElectronHost}
            onSelect={() => handleSelect(target)}
          />
        );
      })}
      {showEmptyHint ? (
        <DropdownMenuItem disabled data-testid="open-in-agent-empty">
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
            disabled={input === null}
            data-testid="open-in-agent-terminal"
            aria-label={t`Claude CLI`}
          >
            <SquareTerminal className="size-4" aria-hidden="true" />
            <span className="flex-1">
              <Trans>Claude CLI</Trans>
            </span>
          </DropdownMenuItem>
        </>
      ) : null}
    </DropdownMenuContent>
  );
}

export function OpenInAgentMenu({ input, open, onOpenChange }: OpenInAgentMenuProps): ReactNode {
  const { states, refresh } = useInstalledAgents();
  const { dispatch } = useHandoffDispatch();
  const [internalOpen, setInternalOpen] = useState(false);
  const sawPointerDownRef = useRef(false);
  const isEmbedded = useIsEmbedded();
  if (isEmbedded) return null;

  const isElectronHost = typeof window !== 'undefined' && window.okDesktop != null;
  const menuOpen = open ?? internalOpen;

  const handleOpenChange = (next: boolean): void => {
    if (open === undefined) setInternalOpen(next);
    onOpenChange?.(next);
    if (next) void refresh();
  };

  const triggerDisabled = input === null;

  return (
    <DropdownMenu open={menuOpen} onOpenChange={handleOpenChange} modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          disabled={triggerDisabled}
          className="gap-1.5 text-muted-foreground px-1.5"
          data-testid="open-in-agent-trigger"
          onPointerDown={
            isElectronHost
              ? () => {
                  sawPointerDownRef.current = true;
                }
              : undefined
          }
          onClick={
            isElectronHost
              ? () => {
                  if (sawPointerDownRef.current) {
                    sawPointerDownRef.current = false;
                    return;
                  }
                  handleOpenChange(true);
                }
              : undefined
          }
        >
          <Sparkles className="size-3.5" aria-hidden="true" />
          <Trans>Open with AI</Trans>
        </Button>
      </DropdownMenuTrigger>
      <OpenInAgentMenuContent
        input={input}
        states={states}
        dispatch={dispatch}
        isElectronHost={isElectronHost}
      />
    </DropdownMenu>
  );
}
