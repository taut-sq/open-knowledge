import { t } from '@lingui/core/macro';
import { Trans, useLingui } from '@lingui/react/macro';
import { Clock, Link2, ListTree, Network } from 'lucide-react';
import { lazy, Suspense, useState } from 'react';
import type { DiffLayout } from '@/components/DiffView';
import { LinksPanel } from '@/components/LinksPanel';
import { OutlinePanel } from '@/components/OutlinePanel';
import { TimelineContent } from '@/components/TimelinePanel';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useSingleFileMode } from '@/lib/single-file-mode';

export type PanelTab = 'outline' | 'links' | 'graph' | 'timeline';

export const TABS: { id: PanelTab; icon: typeof ListTree }[] = [
  { id: 'outline', icon: ListTree },
  { id: 'links', icon: Link2 },
  { id: 'graph', icon: Network },
  { id: 'timeline', icon: Clock },
];

function tabLabel(id: PanelTab): string {
  if (id === 'outline') return t`Outline`;
  if (id === 'links') return t`Links`;
  if (id === 'graph') return t`Graph`;
  return t`Timeline`;
}

type DocPanelMode = 'doc' | 'agent';

function loadGraphPanelModule() {
  return import('@/components/GraphPanel');
}

const LazyGraphPanel = lazy(async () => {
  const mod = await loadGraphPanelModule();
  return { default: mod.GraphPanel };
});

const LazyActivityModeContent = lazy(async () => {
  const mod = await import('@/components/ActivityModeContent');
  return { default: mod.ActivityModeContent };
});

interface DocPanelProps {
  docName: string;
  isSourceMode: boolean;
  activeTab: PanelTab;
  onActiveTabChange: (tab: PanelTab) => void;
  mode: DocPanelMode;
  /** Checkpoint trigger + in-flight flag for the timeline tab's Save-version
   *  control (moved here from EditorHeader). */
  onSaveVersion: () => void;
  saving: boolean;
}

export function DocPanel({
  docName,
  isSourceMode,
  activeTab,
  onActiveTabChange,
  mode,
  onSaveVersion,
  saving,
}: DocPanelProps) {
  const { t } = useLingui();
  const [diffLayout, setDiffLayout] = useState<DiffLayout>('unified');
  const singleFile = useSingleFileMode();
  const tabs = singleFile ? TABS.filter((tab) => tab.id === 'outline') : TABS;
  const effectiveTab: PanelTab = tabs.some((tab) => tab.id === activeTab) ? activeTab : 'outline';
  const showTabStrip = mode === 'doc' && tabs.length > 1;
  return (
    <>
      {/* In `'doc'` mode: the info sub-tabs render as the panel header.
          In `'agent'` mode: no header row — `ActivityModeContent` owns its
          own header (avatar + back-arrow), which eliminates the empty-row
          footprint the standalone back-arrow used to have. */}
      {showTabStrip ? (
        <div className="flex flex-row items-center justify-center gap-3 p-2">
          <ToggleGroup
            type="single"
            variant="outline"
            value={effectiveTab}
            onValueChange={(value: PanelTab) => {
              if (value) onActiveTabChange(value);
            }}
            aria-label={t`Document panels`}
          >
            {tabs.map(({ id, icon: Icon }) => {
              const label = tabLabel(id);
              return (
                <Tooltip key={id}>
                  <ToggleGroupItem
                    value={id}
                    role="tab"
                    id={`tab-${id}`}
                    aria-controls={`panel-${id}`}
                    aria-label={label}
                    asChild
                  >
                    <TooltipTrigger>
                      <Icon />
                    </TooltipTrigger>
                  </ToggleGroupItem>
                  <TooltipContent side="bottom">{label}</TooltipContent>
                </Tooltip>
              );
            })}
          </ToggleGroup>
        </div>
      ) : null}

      {mode === 'doc' ? (
        <div
          {...(showTabStrip
            ? {
                role: 'tabpanel' as const,
                id: `panel-${effectiveTab}`,
                'aria-labelledby': `tab-${effectiveTab}`,
              }
            : {})}
          className="min-h-0 flex-1"
        >
          {effectiveTab === 'outline' && (
            <OutlinePanel docName={docName} isSourceMode={isSourceMode} />
          )}
          {effectiveTab === 'links' && <LinksPanel docName={docName} />}
          {effectiveTab === 'graph' && (
            <Suspense
              fallback={
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  <Trans>Loading graph</Trans>
                </div>
              }
            >
              <LazyGraphPanel activeDocName={docName} />
            </Suspense>
          )}
          {effectiveTab === 'timeline' && (
            <TimelineContent
              docName={docName}
              diffLayout={diffLayout}
              onDiffLayoutChange={setDiffLayout}
              onSaveVersion={onSaveVersion}
              saving={saving}
            />
          )}
        </div>
      ) : (
        <div className="min-h-0 flex-1">
          <Suspense
            fallback={
              <div
                role="status"
                aria-busy="true"
                className="flex h-full items-center justify-center text-sm text-muted-foreground"
              >
                <Trans>Loading agent activity</Trans>
              </div>
            }
          >
            <LazyActivityModeContent />
          </Suspense>
        </div>
      )}
    </>
  );
}
