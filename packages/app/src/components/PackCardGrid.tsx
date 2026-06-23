// biome-ignore-all lint/plugin/no-raw-html-interactive-element: pre-rule backlog — file uses raw <button>/<input>/<textarea> awaiting shadcn migration; tracked at https://github.com/inkeep/open-knowledge/blob/main/biome-plugins/README.md#no-raw-html-interactive-elementgrit
import { Trans, useLingui } from '@lingui/react/macro';
import {
  ArrowRight,
  Compass,
  FileCheck,
  GitBranch,
  Library,
  Loader2,
  Network,
  PenLine,
  StickyNote,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import type { OkPackId, OkSeedPackInfo } from '@/lib/desktop-bridge-types';
import { seedClient } from '@/lib/seed-client';
import { cn } from '@/lib/utils';

const PACK_ICONS: Record<OkPackId, React.ComponentType<{ className?: string }>> = {
  'knowledge-base': Library,
  'software-lifecycle': GitBranch,
  'plain-notes': StickyNote,
  worldbuilding: Compass,
  'writing-pipeline': PenLine,
  'entity-vault': Network,
  okf: FileCheck,
};

function iconForPack(id: string): React.ComponentType<{ className?: string }> {
  return (PACK_ICONS as Record<string, React.ComponentType<{ className?: string }>>)[id] ?? Library;
}

interface PackCardGridProps {
  onPackSelect: (packId: OkPackId) => void;
  onCreateBlankFile?: () => void;
  className?: string;
  packs?: OkSeedPackInfo[] | null;
}

export function PackCardGrid({
  onPackSelect,
  onCreateBlankFile,
  className,
  packs: externalPacks,
}: PackCardGridProps) {
  const { t } = useLingui();
  const [internalPacks, setInternalPacks] = useState<OkSeedPackInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const useInternalFetch = externalPacks === undefined;

  useEffect(() => {
    if (!useInternalFetch) return;
    let cancelled = false;
    void (async () => {
      try {
        const result = await seedClient().listPacks();
        if (cancelled) return;
        if (result.ok) {
          setInternalPacks(result.packs);
        } else {
          setError(result.error.message);
        }
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [useInternalFetch]);

  const packs = useInternalFetch ? internalPacks : externalPacks;

  if (error !== null) {
    return (
      <div
        role="alert"
        className={cn('rounded-md bg-destructive/10 p-4 text-sm text-destructive', className)}
      >
        <Trans>Couldn't load starter packs: {error}</Trans>
      </div>
    );
  }

  if (packs === null) {
    return (
      <div
        role="status"
        className={cn('grid w-full max-w-5xl gap-4 sm:grid-cols-2 lg:grid-cols-3', className)}
        aria-busy="true"
        aria-label={t`Loading starter packs`}
      >
        {Array.from({ length: Object.keys(PACK_ICONS).length }, (_, i) => i).map((i) => (
          <PackCardSkeleton key={`skeleton-${i}`} />
        ))}
      </div>
    );
  }

  if (packs.length === 0) {
    return (
      <div
        role="status"
        className={cn(
          'flex w-full max-w-5xl items-center justify-center rounded-2xl border border-dashed border-border/60 bg-muted/20 p-8 text-sm text-muted-foreground',
          className,
        )}
      >
        <Trans>No starter packs available.</Trans>
      </div>
    );
  }

  return (
    <div className={cn('grid w-full max-w-5xl gap-4 sm:grid-cols-2 lg:grid-cols-3', className)}>
      {packs.map((pack) => (
        <PackCard key={pack.id} pack={pack} onSelect={() => onPackSelect(pack.id)} />
      ))}
      {onCreateBlankFile ? <BlankFileCard onSelect={onCreateBlankFile} /> : null}
    </div>
  );
}

function BlankFileCard({ onSelect }: { onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="group flex h-full min-h-22 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border/60 bg-card p-5 text-center text-sm transition-[border-color,box-shadow,transform] hover:border-border hover:shadow-sm focus-visible:border-ring focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:translate-y-px text-muted-foreground"
    >
      <span className="flex items-center gap-1.5">
        <Trans>
          or create a new file <ArrowRight aria-hidden="true" className="size-3.5" />
        </Trans>
      </span>
    </button>
  );
}

interface PackCardProps {
  pack: OkSeedPackInfo;
  onSelect: () => void;
}

function PackCard({ pack, onSelect }: PackCardProps) {
  const Icon = iconForPack(pack.id);
  return (
    <button
      type="button"
      onClick={onSelect}
      className="group flex h-full flex-col items-start gap-4 rounded-2xl border border-border/60 bg-card p-5 text-left transition-[border-color,box-shadow,transform] hover:border-border hover:shadow-sm focus-visible:border-ring focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:translate-y-px"
    >
      <div className="flex flex-col gap-2">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
          <span aria-hidden="true" className="text-muted-foreground">
            <Icon className="size-3.5" />
          </span>
          <h3 className="text-sm font-medium leading-tight">{pack.name}</h3>
        </div>

        <p className="text-1sm leading-relaxed text-muted-foreground">{pack.description}</p>
      </div>
    </button>
  );
}

function PackCardSkeleton() {
  return (
    <div className="flex h-full min-h-[200px] flex-col items-start gap-4 rounded-xl border border-border/60 bg-card p-6">
      <span className="size-10 animate-pulse rounded-lg bg-muted" aria-hidden="true">
        <Loader2 className="size-5 animate-spin text-muted-foreground opacity-0" />
      </span>
      <div className="flex w-full flex-col gap-2">
        <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
        <div className="h-3 w-full animate-pulse rounded bg-muted" />
        <div className="h-3 w-4/5 animate-pulse rounded bg-muted" />
      </div>
      <div className="mt-auto h-3 w-20 animate-pulse rounded bg-muted" />
    </div>
  );
}
