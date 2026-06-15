import { Trans, useLingui } from '@lingui/react/macro';
import { isMacOS } from '@tiptap/core';
import type { Editor } from '@tiptap/react';
import { Sparkles } from 'lucide-react';
import {
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from 'react';
import { toast } from 'sonner';
import { OpenInAgentMenuContent } from '@/components/handoff/OpenInAgentMenu';
import {
  buildSelectionOrDocHandoffInput,
  type HandoffDispatchInput,
  useHandoffDispatch,
} from '@/components/handoff/useHandoffDispatch';
import { useInstalledAgents } from '@/components/handoff/useInstalledAgents';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Separator } from '@/components/ui/separator';
import { useIsEmbedded } from '@/hooks/use-is-embedded';
import { useConfigContext } from '@/lib/config-context';
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
  const { states, refresh } = useInstalledAgents();
  const { dispatch } = useHandoffDispatch();
  const { merged } = useConfigContext();
  const workspace = useWorkspace();
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuInput, setMenuInput] = useState<HandoffDispatchInput | null>(null);
  const menuInputRef = useRef<HandoffDispatchInput | null>(null);
  const suppressNextClickRef = useRef(false);
  const autoOpen = merged?.appearance?.preview?.autoOpen ?? true;
  const isElectronHost = typeof window !== 'undefined' && window.okDesktop != null;
  const selectionErrorMessage = t`Couldn't read the selection — please try again.`;

  const captureSelectionInput = (): HandoffDispatchInput | null => {
    let selectionMarkdown: string;
    try {
      selectionMarkdown = serializeWysiwygSelection(editor);
    } catch (err) {
      console.error('Edit with AI: could not read the selection', err);
      toast.error(selectionErrorMessage);
      return null;
    }

    const docName = getEditorDocName(editor);
    const input = buildSelectionOrDocHandoffInput({
      docName,
      workspace,
      instruction: '',
      selectionMarkdown,
    });
    if (input === null) {
      toast.error(selectionErrorMessage);
      return null;
    }
    return input;
  };

  const primeSelectionMenu = (): boolean => {
    const input = captureSelectionInput();
    if (input === null) return false;
    menuInputRef.current = input;
    setMenuInput(input);
    return true;
  };

  const openSelectionMenu = (): void => {
    if (!primeSelectionMenu()) return;
    setMenuOpen(true);
    void refresh();
  };

  const handleOpenChange = (open: boolean): void => {
    setMenuOpen(open);
    if (!open) {
      menuInputRef.current = null;
      setMenuInput(null);
      return;
    }
    void refresh();
  };

  const handleTriggerPointerDownCapture = (event: ReactPointerEvent<HTMLButtonElement>): void => {
    if (menuInputRef.current !== null) {
      suppressNextClickRef.current = true;
      return;
    }
    if (event.button !== 0) return;
    suppressNextClickRef.current = true;
    if (primeSelectionMenu()) return;
    event.preventDefault();
    event.stopPropagation();
  };

  const handleTriggerKeyDownCapture = (event: ReactKeyboardEvent<HTMLButtonElement>): void => {
    if (menuInputRef.current !== null) {
      suppressNextClickRef.current = true;
      return;
    }
    if (event.key !== 'Enter' && event.key !== ' ') return;
    suppressNextClickRef.current = true;
    if (primeSelectionMenu()) return;
    event.preventDefault();
    event.stopPropagation();
  };

  const handleTriggerClick = (): void => {
    if (suppressNextClickRef.current) {
      suppressNextClickRef.current = false;
      return;
    }
    if (menuInputRef.current !== null) return;
    openSelectionMenu();
  };

  const openSelectionMenuEvent = useEffectEvent(() => {
    openSelectionMenu();
  });

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (!shortcutEnabled) return;
      if (!matchesKeyboardShortcut(event, 'edit-with-ai')) return;
      if (isNativeTextControl(event.target)) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      openSelectionMenuEvent();
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [shortcutEnabled]);

  return (
    <>
      <Separator orientation="vertical" className="mx-0.5 h-5 data-vertical:self-center" />
      <DropdownMenu open={menuOpen} onOpenChange={handleOpenChange} modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            data-testid="edit-with-ai-bubble-button"
            className="gap-1 px-2 text-sm font-medium text-accent-foreground/80"
            onPointerDownCapture={handleTriggerPointerDownCapture}
            onKeyDownCapture={handleTriggerKeyDownCapture}
            onClick={handleTriggerClick}
          >
            <Sparkles className="size-3.5" aria-hidden="true" />
            <span>
              <Trans>Edit with AI</Trans>
            </span>
          </Button>
        </DropdownMenuTrigger>
        <OpenInAgentMenuContent
          input={menuInput}
          states={states}
          dispatch={dispatch}
          isElectronHost={isElectronHost}
          autoOpen={autoOpen}
        />
      </DropdownMenu>
    </>
  );
}
