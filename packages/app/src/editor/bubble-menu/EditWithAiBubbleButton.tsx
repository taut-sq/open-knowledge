
import { Trans, useLingui } from '@lingui/react/macro';
import { isMacOS } from '@tiptap/core';
import type { Editor } from '@tiptap/react';
import { Sparkles } from 'lucide-react';
import { type ReactNode, useEffect } from 'react';
import { toast } from 'sonner';
import { useOpenInAgentMenuRequest } from '@/components/handoff/OpenInAgentMenuRequestContext';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { matchesKeyboardShortcut } from '@/lib/keyboard-shortcuts';
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
  const { t } = useLingui();
  const { openSelection } = useOpenInAgentMenuRequest();
  const isMac = isMacOS();

  const openSelectionMenu = (): void => {
    let selectionMarkdown: string;
    try {
      selectionMarkdown = serializeWysiwygSelection(editor);
    } catch (err) {
      console.error('Edit with AI: could not read the selection', err);
      toast.error(t`Couldn't read the selection — please try again.`);
      return;
    }

    openSelection({
      docName: getEditorDocName(editor),
      instruction: '',
      selectionMarkdown,
    });
  };

  useEffect(() => {
    if (!isMac) return;
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (!shortcutEnabled) return;
      if (!matchesKeyboardShortcut(event, 'edit-with-ai')) return;
      if (isNativeTextControl(event.target)) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      openSelectionMenu();
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [
    isMac,
    shortcutEnabled,
    // biome-ignore lint/correctness/useExhaustiveDependencies: openSelectionMenu is render-bound; re-subscribing keeps the handler fresh for the current editor selection.
    openSelectionMenu,
  ]);

  if (!isMac) return null;

  return (
    <>
      <Separator orientation="vertical" className="mx-0.5 h-5 data-vertical:self-center" />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        data-testid="edit-with-ai-bubble-button"
        className="gap-1 px-2 text-sm font-medium text-accent-foreground/80"
        onClick={openSelectionMenu}
      >
        <Sparkles className="size-3.5" aria-hidden="true" />
        <span>
          <Trans>Edit with AI</Trans>
        </span>
      </Button>
    </>
  );
}
