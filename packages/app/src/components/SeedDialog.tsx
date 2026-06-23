import { plural } from '@lingui/core/macro';
import { Trans, useLingui } from '@lingui/react/macro';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { CreatedItemsList } from '@/components/CreatedItemsList';
import { PackCardGrid } from '@/components/PackCardGrid';
import { Button } from '@/components/ui/button';
import {
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  Dialog as DialogRoot,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  FieldTitle,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import type { OkPackId, OkScaffoldPlan, OkSeedPackInfo } from '@/lib/desktop-bridge-types';
import { seedClient } from '@/lib/seed-client';

const DEFAULT_PACK_ID: OkPackId = 'knowledge-base';

interface SeedDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Fired after a successful apply — used by the empty state to trigger the
      OkBlob celebration burst. The dialog still owns the toast + dismissal. */
  onSeedApplied?: () => void;
  initialPackId?: OkPackId;
}

type DialogPhase =
  | { kind: 'loading' }
  | { kind: 'plan'; plan: OkScaffoldPlan }
  | { kind: 'already-seeded'; plan: OkScaffoldPlan }
  | { kind: 'error'; message: string }
  | { kind: 'applying'; plan: OkScaffoldPlan };

type RootChoice = 'project-root' | 'subfolder';
type DialogStep = 'pick' | 'configure';

export function SeedDialog({ open, onOpenChange, onSeedApplied, initialPackId }: SeedDialogProps) {
  const { t } = useLingui();
  const [phase, setPhase] = useState<DialogPhase>({ kind: 'loading' });
  const [packs, setPacks] = useState<OkSeedPackInfo[] | null>(null);
  const [selectedPackId, setSelectedPackId] = useState<OkPackId>(initialPackId ?? DEFAULT_PACK_ID);
  const [rootChoice, setRootChoice] = useState<RootChoice>('project-root');
  const [subfolder, setSubfolder] = useState<string>('');
  const [step, setStep] = useState<DialogStep>(initialPackId !== undefined ? 'configure' : 'pick');
  const isFirstLoadRef = useRef(true);

  const selectedPack = packs?.find((p) => p.id === selectedPackId);

  useEffect(() => {
    if (!open || packs !== null) return;
    let cancelled = false;
    void (async () => {
      try {
        const result = await seedClient().listPacks();
        if (cancelled) return;
        if (result.ok) {
          setPacks(result.packs);
        } else {
          setPacks([]); // empty list short-circuits the planning loading state
          setPhase({ kind: 'error', message: result.error.message });
        }
      } catch (err) {
        if (cancelled) return;
        setPacks([]);
        setPhase({
          kind: 'error',
          message: err instanceof Error ? err.message : String(err),
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, packs]);

  useEffect(() => {
    if (open) {
      setSelectedPackId(initialPackId ?? DEFAULT_PACK_ID);
      setRootChoice('project-root');
      setSubfolder('');
      setStep(initialPackId !== undefined ? 'configure' : 'pick');
      setPhase({ kind: 'loading' });
      isFirstLoadRef.current = true;
    }
  }, [open, initialPackId]);

  useEffect(() => {
    if (!selectedPack) return;
    setSubfolder(selectedPack.defaultSubfolder ?? '');
  }, [selectedPack]);

  const trimmedSubfolder = subfolder.trim();
  const subfolderInvalid = rootChoice === 'subfolder' && trimmedSubfolder === '';

  useEffect(() => {
    if (!open) return;
    if (step !== 'configure') return;
    if (packs === null) return; // wait for pack list before planning

    if (subfolderInvalid) {
      setPhase({ kind: 'error', message: t`Enter a folder name (e.g. brain).` });
      return;
    }

    const effectiveRoot = rootChoice === 'project-root' ? undefined : trimmedSubfolder;
    const delay = isFirstLoadRef.current ? 0 : 200;
    isFirstLoadRef.current = false;

    let cancelled = false;
    const timer = setTimeout(() => {
      if (cancelled) return;
      setPhase((prev) =>
        prev.kind === 'plan' || prev.kind === 'already-seeded' ? prev : { kind: 'loading' },
      );
      seedClient()
        .plan({
          rootDir: effectiveRoot,
          packId: selectedPackId,
        })
        .then((result) => {
          if (cancelled) return;
          if (!result.ok) {
            setPhase({ kind: 'error', message: result.error.message });
            return;
          }
          const hasWork = result.plan.created.length > 0;
          setPhase(
            hasWork
              ? { kind: 'plan', plan: result.plan }
              : { kind: 'already-seeded', plan: result.plan },
          );
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          setPhase({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
        });
    }, delay);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, step, packs, selectedPackId, rootChoice, trimmedSubfolder, subfolderInvalid, t]);

  async function handleApply() {
    if (phase.kind !== 'plan') return;
    const planAtClick = phase.plan;
    setPhase({ kind: 'applying', plan: planAtClick });
    let result: Awaited<ReturnType<ReturnType<typeof seedClient>['apply']>>;
    try {
      result = await seedClient().apply(planAtClick, { packId: selectedPackId });
    } catch (err) {
      const errorDetail = err instanceof Error ? err.message : String(err);
      toast.error(t`Initialize failed: ${errorDetail}`);
      setPhase({ kind: 'plan', plan: planAtClick });
      return;
    }
    if (result.ok) {
      const packName = selectedPack?.name ?? t`starter pack`;
      const projectEntries = result.result.applied;
      const message =
        projectEntries === 0
          ? t`${packName} was already set up. Nothing to do.`
          : t`${packName} initialized (${plural(projectEntries, { one: '# entry', other: '# entries' })})`;
      toast.success(message);
      onSeedApplied?.();
      onOpenChange(false);
    } else {
      const errorDetail = result.error.message;
      toast.error(t`Initialize failed: ${errorDetail}`);
      setPhase({ kind: 'plan', plan: planAtClick });
    }
  }

  const packLocked = initialPackId !== undefined;
  const selectedPackName = selectedPack?.name;
  const title =
    step === 'configure' && selectedPack
      ? t`Initialize ${selectedPackName}`
      : t`Initialize a starter pack`;
  const description =
    step === 'configure' && selectedPack
      ? selectedPack.description
      : t`Pick a layout that matches what you're building. Each pack ships with folders, templates, and agent-readable descriptions. You can mix and match later.`;

  function handlePackSelect(id: OkPackId) {
    setSelectedPackId(id);
    setStep('configure');
    isFirstLoadRef.current = true;
  }

  function handleBack() {
    setStep('pick');
    setPhase({ kind: 'loading' });
    isFirstLoadRef.current = true;
  }

  return (
    <DialogRoot open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl" data-ok-layer-spawned="">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {step === 'pick' ? (
          <DialogBody>
            <PackCardGrid packs={packs} onPackSelect={handlePackSelect} />
          </DialogBody>
        ) : (
          <DialogBody className="space-y-6">
            <RootPicker
              choice={rootChoice}
              subfolder={subfolder}
              placeholder={selectedPack?.defaultSubfolder ?? 'subfolder'}
              onChoiceChange={setRootChoice}
              onSubfolderChange={setSubfolder}
            />
            <SeedDialogBody phase={phase} selectedPack={selectedPack} />
          </DialogBody>
        )}

        <DialogFooter>
          {step === 'configure' && !packLocked ? (
            <Button className="mr-auto uppercase font-mono" variant="ghost" onClick={handleBack}>
              <ArrowLeft aria-hidden="true" className="h-4 w-4" />
              <Trans>Back</Trans>
            </Button>
          ) : null}
          <Button
            className="uppercase font-mono"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            {phase.kind === 'already-seeded' || phase.kind === 'error' ? (
              <Trans>Close</Trans>
            ) : (
              <Trans>Cancel</Trans>
            )}
          </Button>
          {step === 'configure' && phase.kind === 'plan' ? (
            <Button onClick={handleApply} disabled={subfolderInvalid}>
              <Trans>Initialize</Trans>
            </Button>
          ) : step === 'configure' && phase.kind === 'applying' ? (
            <Button disabled>
              <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
              <Trans>Setting up</Trans>
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </DialogRoot>
  );
}

function RootPicker({
  choice,
  subfolder,
  placeholder,
  onChoiceChange,
  onSubfolderChange,
}: {
  choice: RootChoice;
  subfolder: string;
  placeholder: string;
  onChoiceChange: (next: RootChoice) => void;
  onSubfolderChange: (next: string) => void;
}) {
  return (
    <div className="space-y-2 py-1">
      <p className="text-sm font-medium">
        <Trans>Where should it live?</Trans>
      </p>
      <RadioGroup
        className="sm:flex"
        value={choice}
        onValueChange={(next) => onChoiceChange(next as RootChoice)}
      >
        <FieldLabel htmlFor="seed-root-project-root">
          <Field orientation="horizontal">
            <FieldContent>
              <FieldTitle>
                <Trans>Project root</Trans>
              </FieldTitle>
              <FieldDescription className="text-1sm">
                <Trans>Scaffold directly under this project.</Trans>
              </FieldDescription>
            </FieldContent>
            <RadioGroupItem value="project-root" id="seed-root-project-root" />
          </Field>
        </FieldLabel>
        <FieldLabel htmlFor="seed-root-subfolder">
          <Field orientation="horizontal">
            <FieldContent>
              <FieldTitle>
                <Trans>In a subfolder</Trans>
              </FieldTitle>
              <FieldDescription className="nth-last-2:mt-0 text-1sm">
                <Trans>Created if missing; reused if it exists.</Trans>
              </FieldDescription>
              {choice === 'subfolder' && (
                <Input
                  value={subfolder}
                  onChange={(e) => onSubfolderChange(e.target.value)}
                  placeholder={placeholder}
                  spellCheck={false}
                  autoCapitalize="off"
                  autoCorrect="off"
                  className="mt-1.5 font-mono text-xs bg-background"
                />
              )}
            </FieldContent>
            <RadioGroupItem value="subfolder" id="seed-root-subfolder" />
          </Field>
        </FieldLabel>
      </RadioGroup>
    </div>
  );
}

function SeedDialogBody({
  phase,
  selectedPack,
}: {
  phase: DialogPhase;
  selectedPack: OkSeedPackInfo | undefined;
}) {
  if (phase.kind === 'loading') {
    return (
      <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
        <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
        <Trans>Computing scaffold plan</Trans>
      </div>
    );
  }

  if (phase.kind === 'error') {
    return (
      <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
        {phase.message}
      </div>
    );
  }

  if (phase.kind === 'already-seeded') {
    return (
      <div className="py-2 text-sm">
        <p className="font-medium">
          <Trans>This pack is already set up here.</Trans>
        </p>
        <p className="text-muted-foreground">
          <Trans>The folders and templates are in place; there's nothing left to scaffold.</Trans>
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 py-1 text-sm">
      <CreatedItemsList plan={phase.plan} selectedPack={selectedPack} />
      {phase.plan.warnings.length > 0 ? (
        <div className="rounded-md bg-warning/10 p-3 text-xs text-warning-foreground">
          {phase.plan.warnings.map((w) => (
            <p key={w}>{w}</p>
          ))}
        </div>
      ) : null}
    </div>
  );
}
