import { Trans, useLingui } from '@lingui/react/macro';
import { PlusIcon, XIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export interface TerminalTabDescriptor {
  readonly id: string;
  readonly label: string;
}

interface TerminalTabStripProps {
  readonly sessions: readonly TerminalTabDescriptor[];
  readonly activeSessionId: string;
  readonly onSelect: (id: string) => void;
  readonly onTabActivate?: (id: string) => void;
  readonly onNew: () => void;
  readonly onClose: (id: string) => void;
  readonly children?: ReactNode;
  readonly className?: string;
}

export function TerminalTabStrip({
  sessions,
  activeSessionId,
  onSelect,
  onTabActivate,
  onNew,
  onClose,
  children,
  className,
}: TerminalTabStripProps) {
  const { t } = useLingui();
  return (
    <Tabs
      value={activeSessionId}
      onValueChange={onSelect}
      className={cn('flex min-h-0 min-w-0 flex-1 flex-col', className)}
    >
      <div className="flex shrink-0 flex-row items-center gap-1 px-1.5 py-1">
        <TabsList
          variant="line"
          aria-label={t`Terminal sessions`}
          className="flex h-auto min-w-0 flex-1 items-center justify-start gap-0.5 overflow-x-auto bg-transparent p-0 [scrollbar-width:none] scroll-fade-mask-x"
        >
          {sessions.map((session) => {
            const isActive = session.id === activeSessionId;
            return (
              <div
                key={session.id}
                className={cn(
                  'group flex shrink-0 items-center rounded-md pr-0.5 transition-colors',
                  isActive ? 'bg-muted' : 'hover:bg-muted/50',
                )}
              >
                <TabsTrigger
                  value={session.id}
                  onClick={() => onTabActivate?.(session.id)}
                  className="h-7 flex-none rounded-md px-2 text-xs"
                >
                  <span className="max-w-40 truncate">{session.label}</span>
                </TabsTrigger>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label={t`Close ${session.label}`}
                  tabIndex={isActive ? 0 : -1}
                  className={cn(
                    'text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100 group-focus-within:opacity-100',
                    isActive && 'opacity-100',
                  )}
                  onClick={(event) => {
                    event.stopPropagation();
                    onClose(session.id);
                  }}
                >
                  <XIcon aria-hidden="true" />
                </Button>
              </div>
            );
          })}
        </TabsList>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label={t`New terminal`}
              className="shrink-0 text-muted-foreground hover:text-foreground"
              onClick={onNew}
            >
              <PlusIcon aria-hidden="true" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={8}>
            <Trans>New terminal</Trans>
          </TooltipContent>
        </Tooltip>
      </div>
      {children}
    </Tabs>
  );
}
