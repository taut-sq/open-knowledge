
import { composeFilePrompt, type TargetData } from '@inkeep/open-knowledge-core';
import { Trans, useLingui } from '@lingui/react/macro';
import { ExternalLink, Sparkles } from 'lucide-react';
import type { ReactNode } from 'react';
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useIsEmbedded } from '@/hooks/use-is-embedded';
import { useConfigContext } from '@/lib/config-context';
import { VISIBLE_TARGETS } from '@/lib/handoff/targets';
import {
  dispatchClaudeWebFallback,
  OpenInAgentMenuItem,
  successToastForWebFallback,
} from './OpenInAgentMenuItem';
import { type HandoffDispatchInput, useHandoffDispatch } from './useHandoffDispatch';
import { useInstalledAgents } from './useInstalledAgents';

export { successToastForWebFallback };

interface OpenInAgentMenuProps {
  /** Active doc context. When `null`, the trigger renders disabled (nothing
   *  to dispatch). Surfaces own the docContext + projectDir + docPath. */
  readonly input: HandoffDispatchInput | null;
  readonly open?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
}

export function OpenInAgentMenu({ input, open, onOpenChange }: OpenInAgentMenuProps): ReactNode {
  const { t } = useLingui();
  const { states, refresh } = useInstalledAgents();
  const { dispatch } = useHandoffDispatch();
  const { merged } = useConfigContext();
  const autoOpen = merged?.appearance?.preview?.autoOpen ?? true;
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
  const isSelectionScope = Boolean(input?.selection);
  const prompt =
    input !== null && input.docContext !== null
      ? composeFilePrompt(input.docContext.relativePath, autoOpen)
      : '';

  const handleSelect = (target: TargetData): void => {
    if (input === null) return;
    void dispatch(target.id, input);
  };

  const installedTargets = VISIBLE_TARGETS.filter(
    (target) => states[target.id]?.installed === true,
  );
  const probePending = VISIBLE_TARGETS.some((target) => states[target.id]?.installed == null);

  const claudeInstalled = states['claude-code']?.installed === true;

  const handleClaudeWebFallback = (): void => {
    if (input === null) return;
    void dispatchClaudeWebFallback(prompt);
  };

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
      <DropdownMenuContent align="end" className="min-w-[220px]" data-testid="open-in-agent-menu">
        {installedTargets.map((target) => {
          const installState = states[target.id];
          return (
            <OpenInAgentMenuItem
              key={target.id}
              target={target}
              installState={installState}
              isElectronHost={isElectronHost}
              prompt={prompt}
              onSelect={() => handleSelect(target)}
            />
          );
        })}
        {isSelectionScope && installedTargets.length === 0 ? (
          <DropdownMenuItem disabled data-testid="open-in-agent-selection-empty">
            {probePending ? (
              <Trans>Checking for installed agents</Trans>
            ) : (
              <Trans>No installed agents found</Trans>
            )}
          </DropdownMenuItem>
        ) : null}
        {!claudeInstalled && !isSelectionScope ? (
          <DropdownMenuItem
            onSelect={handleClaudeWebFallback}
            disabled={input === null}
            data-testid="open-in-agent-claude-web-fallback"
            aria-label={t`Open in claude.ai, opens in browser with prompt pre-filled`}
          >
            <ExternalLink className="size-4" aria-hidden="true" />
            <span className="flex-1">
              <Trans>Open in claude.ai →</Trans>
            </span>
            <span aria-hidden="true" className="ml-2 text-muted-foreground text-xs">
              <Trans>opens in browser</Trans>
            </span>
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
