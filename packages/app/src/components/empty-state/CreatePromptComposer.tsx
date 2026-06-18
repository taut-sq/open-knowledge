import type { HandoffTarget } from '@inkeep/open-knowledge-core';
import { Trans, useLingui } from '@lingui/react/macro';
import { ArrowUpRight, Check, ChevronDown, Sparkles } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import {
  type CreateScenario,
  useCreateSuggestions,
} from '@/components/empty-state/use-create-suggestions';
import { TargetIcon } from '@/components/handoff/OpenInAgentMenuItem';
import {
  buildCreateHandoffInput,
  getDisplayNameDefault,
  openInstallUrl,
  useHandoffDispatch,
} from '@/components/handoff/useHandoffDispatch';
import { useInstalledAgents } from '@/components/handoff/useInstalledAgents';
import { Button } from '@/components/ui/button';
import { ButtonGroup } from '@/components/ui/button-group';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Textarea } from '@/components/ui/textarea';
import { VISIBLE_TARGETS } from '@/lib/handoff/targets';
import {
  readPreferredAgent,
  resolvePreferredAgent,
  writePreferredAgent,
} from '@/lib/preferred-agent-store';
import { useWorkspace } from '@/lib/use-workspace';
import { cn } from '@/lib/utils';

interface CreatePromptComposerProps {
  readonly scenario: CreateScenario;
  readonly className?: string;
}

export function CreatePromptComposer({ scenario, className }: CreatePromptComposerProps) {
  const { t } = useLingui();
  const { states, refresh } = useInstalledAgents();
  const { dispatch } = useHandoffDispatch();
  const workspace = useWorkspace();

  const [description, setDescription] = useState('');
  const [selectedAgentId, setSelectedAgentId] = useState<HandoffTarget | null>(() =>
    readPreferredAgent(),
  );
  const userPickedRef = useRef(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const suggestions = useCreateSuggestions(scenario);

  const selectableTargets = VISIBLE_TARGETS.filter(
    (target) => states[target.id]?.installed === true,
  );
  const probeSettled = VISIBLE_TARGETS.every((target) => states[target.id]?.installed != null);
  const noAgentsInstalled = probeSettled && selectableTargets.length === 0;

  useEffect(() => {
    if (!probeSettled || userPickedRef.current) return;
    const resolved = resolvePreferredAgent({ lastUsed: readPreferredAgent(), states });
    setSelectedAgentId((current) => (resolved === current ? current : resolved));
  }, [probeSettled, states]);

  function chooseAgent(targetId: HandoffTarget) {
    userPickedRef.current = true;
    setSelectedAgentId(targetId);
    writePreferredAgent(targetId);
  }

  function handleCreate(targetId: HandoffTarget) {
    const desc = description.trim();
    writePreferredAgent(targetId);
    const input = buildCreateHandoffInput({ workspace, description: desc, scenario });
    if (input === null) return; // Workspace not resolved yet — disabled-trigger contract.
    void dispatch(targetId, input);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      if (selectedAgentId !== null) handleCreate(selectedAgentId);
    }
  }

  function applySuggestion(prompt: string) {
    setDescription(prompt);
    textareaRef.current?.focus();
  }

  if (noAgentsInstalled) {
    return (
      <div
        className={cn(
          'flex w-full flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/60 bg-card px-4 py-3',
          className,
        )}
        data-testid="create-no-agents"
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <Sparkles aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
          <span className="text-1sm text-muted-foreground">
            <Trans>Install an AI agent to create with AI</Trans>
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {VISIBLE_TARGETS.map((target) => (
            <Button
              key={target.id}
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void openInstallUrl(target)}
              className="gap-1.5"
              data-testid={`install-agent-${target.id}`}
            >
              <TargetIcon id={target.id} aria-hidden="true" className="size-3.5" />
              {target.displayName}
              <ArrowUpRight aria-hidden="true" className="size-3" />
            </Button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex w-full flex-col rounded-2xl border border-border/60 bg-card shadow-sm transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50',
        className,
      )}
    >
      {/* The card owns the border + focus ring; the textarea drops its own
          (border-0 + ring-0) so the whole card lights up on focus instead of
          nesting a second outline. */}
      <Textarea
        ref={textareaRef}
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        onKeyDown={handleKeyDown}
        rows={4}
        placeholder={t`A team knowledge base, a personal wiki, project docs...`}
        aria-label={t`Describe the project you want to create`}
        className="min-h-[112px] resize-none rounded-2xl border-0 bg-transparent dark:bg-transparent px-4 py-3.5 text-sm leading-relaxed shadow-none focus-visible:border-0 focus-visible:ring-0"
      />
      {/* Footer row: starter-brief chips (prefill the field, no auto-create) on
          the left, the Create split button pinned right. Chips wrap among
          themselves on narrow widths while the button stays put. */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 pb-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {suggestions.map((suggestion) => {
            const Icon = suggestion.icon;
            return (
              <Button
                key={suggestion.id}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => applySuggestion(suggestion.prompt)}
                className="gap-1.5 rounded-md font-normal text-muted-foreground hover:text-foreground"
                data-testid={`create-suggestion-${suggestion.id}`}
              >
                <Icon className="size-3.5" aria-hidden="true" />
                {suggestion.label}
              </Button>
            );
          })}
        </div>
        {selectedAgentId === null ? (
          <Button
            type="button"
            variant="outline"
            disabled
            className="gap-1.5"
            data-testid="create-with-agent"
          >
            <Trans>Create</Trans>
          </Button>
        ) : (
          <ButtonGroup>
            <Button
              type="button"
              onClick={() => handleCreate(selectedAgentId)}
              variant="outline"
              className="gap-1.5"
              data-testid="create-with-agent"
            >
              <TargetIcon id={selectedAgentId} aria-hidden="true" className="size-3.5" />
              <Trans>Create with {getDisplayNameDefault(selectedAgentId)}</Trans>
            </Button>
            <DropdownMenu
              onOpenChange={(open) => {
                if (open) void refresh();
              }}
            >
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  aria-label={t`Choose agent`}
                  size="icon"
                  variant="outline"
                  data-testid="create-with-agent-menu"
                >
                  <ChevronDown aria-hidden="true" className="size-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[200px]">
                {selectableTargets.map((target) => (
                  <DropdownMenuItem
                    key={target.id}
                    onSelect={() => chooseAgent(target.id)}
                    data-testid={`create-agent-option-${target.id}`}
                  >
                    <TargetIcon id={target.id} aria-hidden="true" className="size-4" />
                    <span className="flex-1">{target.displayName}</span>
                    {target.id === selectedAgentId ? (
                      <Check aria-hidden="true" className="size-4 text-muted-foreground" />
                    ) : null}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </ButtonGroup>
        )}
      </div>
    </div>
  );
}
