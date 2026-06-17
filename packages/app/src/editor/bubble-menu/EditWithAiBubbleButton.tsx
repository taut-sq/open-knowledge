
import { Trans, useLingui } from '@lingui/react/macro';
import { isMacOS } from '@tiptap/core';
import type { Editor } from '@tiptap/react';
import { Sparkles } from 'lucide-react';
import { type ReactNode, useEffect, useEffectEvent, useState } from 'react';
import { toast } from 'sonner';
import {
  EditWithAiPopover,
  type EditWithAiSelectionSnapshot,
} from '@/components/handoff/EditWithAiPopover';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { useIsEmbedded } from '@/hooks/use-is-embedded';
import { matchesKeyboardShortcut } from '@/lib/keyboard-shortcuts';
import { useWorkspace } from '@/lib/use-workspace';
import { serializeWysiwygSelection } from '../edit-with-ai-selection.ts';
import { getEditorDocName } from '../extensions/doc-context.ts';

function isNativeTextControl(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tagName = target.tagName.toUpperCase();
  return tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT';
}

export function EditWithAiBubbleButton({
  editor,
  shortcutEnabled = false,
}: {
  editor: Editor;
  shortcutEnabled?: boolean;
}): ReactNode {
  const isMac = isMacOS();
  const isEmbedded = useIsEmbedded();
  if (!isMac || isEmbedded) return null;

  return <EditWithAiBubbleMenu editor={editor} shortcutEnabled={shortcutEnabled} />;
}

function EditWithAiBubbleMenu({
  editor,
  shortcutEnabled,
}: {
  editor: Editor;
  shortcutEnabled: boolean;
}): ReactNode {
  const { t } = useLingui();
  const workspace = useWorkspace();
  const [open, setOpen] = useState(false);
  const [snapshot, setSnapshot] = useState<EditWithAiSelectionSnapshot | null>(null);

  const captureSnapshot = (): EditWithAiSelectionSnapshot | null => {
    let selectionMarkdown: string;
    try {
      selectionMarkdown = serializeWysiwygSelection(editor);
    } catch (err) {
      console.error('Edit with AI: could not read the selection', err);
      toast.error(t`Couldn't read the selection — please try again.`);
      return null;
    }
    return { docName: getEditorDocName(editor), workspace, selectionMarkdown };
  };

  const openPopover = (): void => {
    const shot = captureSnapshot();
    if (shot === null) return;
    setSnapshot(shot);
    setOpen(true);
  };

  const handleOpenChange = (next: boolean): void => {
    if (next) {
      openPopover();
      return;
    }
    setOpen(false);
    setSnapshot(null);
  };

  const openPopoverEvent = useEffectEvent(() => {
    openPopover();
  });

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (!shortcutEnabled) return;
      if (!matchesKeyboardShortcut(event, 'edit-with-ai')) return;
      if (isNativeTextControl(event.target)) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      openPopoverEvent();
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [shortcutEnabled]);

  return (
    <>
      <Separator orientation="vertical" className="mx-0.5 h-5 data-vertical:self-center" />
      <EditWithAiPopover open={open} onOpenChange={handleOpenChange} snapshot={snapshot}>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          data-testid="edit-with-ai-bubble-button"
          className="gap-1 px-2 text-sm font-medium text-accent-foreground/80"
        >
          <Sparkles className="size-3.5" aria-hidden="true" />
          <span>
            <Trans>Edit with AI</Trans>
          </span>
        </Button>
      </EditWithAiPopover>
    </>
  );
}
