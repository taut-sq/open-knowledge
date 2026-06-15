import { afterEach, describe, expect, mock, test } from 'bun:test';
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Schema } from '@tiptap/pm/model';
import type { Editor } from '@tiptap/react';
import type { ReactNode } from 'react';
import { DropdownMenuContent } from '@/components/ui/dropdown-menu';
import { ConfigContext, type ConfigContextValue } from '@/lib/config-context';
import type { HandoffDispatchInput } from '../../components/handoff/useHandoffDispatch';
import { setEditorDocName } from '../extensions/doc-context.ts';

const toastError = mock(() => {});
const refreshInstalledAgents = mock(async () => {});
let latestMenuInput: HandoffDispatchInput | null | undefined;
let lastNonNullMenuInput: HandoffDispatchInput | null | undefined;

mock.module('sonner', () => ({ toast: { error: toastError } }));

mock.module('@/components/handoff/OpenInAgentMenu', () => ({
  OpenInAgentMenuContent: ({ input }: { input: HandoffDispatchInput | null }) => {
    latestMenuInput = input;
    if (input !== null) lastNonNullMenuInput = input;
    if (input === null) return null;
    return (
      <DropdownMenuContent data-testid="edit-with-ai-popover">
        {input.selection?.selectionMarkdown ?? 'file scope'}
      </DropdownMenuContent>
    );
  },
}));

mock.module('@/components/handoff/useInstalledAgents', () => ({
  useInstalledAgents: () => ({
    states: {
      'claude-code': { installed: true, lastChecked: 1 },
      codex: { installed: true, lastChecked: 1 },
      cursor: { installed: true, lastChecked: 1 },
    },
    refresh: refreshInstalledAgents,
  }),
}));

mock.module('@/lib/use-workspace', () => ({
  useWorkspace: () => ({ contentDir: '/tmp/project', pathSeparator: '/' }),
}));

const { EditWithAiBubbleButton } = await import('./EditWithAiBubbleButton');

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { group: 'block', content: 'text*', toDOM: () => ['p', 0] },
    text: { group: 'inline' },
  },
});

function makeEditor(docName: string, text: string) {
  let doc = schema.node('doc', null, [schema.node('paragraph', null, [schema.text(text)])]);
  const selectionContent = mock(() => doc.slice(0, doc.content.size));
  const editor = {
    state: {
      schema,
      selection: { content: selectionContent },
    },
  } as unknown as Editor;
  setEditorDocName(editor, docName);
  return {
    editor,
    selectionContent,
    setSelectionText(next: string) {
      doc = schema.node('doc', null, [schema.node('paragraph', null, [schema.text(next)])]);
    },
  };
}

function makeThrowingEditor(docName: string): Editor {
  const editor = {
    state: {
      schema,
      selection: {
        content: () => {
          throw new Error('selection serialization failed');
        },
      },
    },
  } as unknown as Editor;
  setEditorDocName(editor, docName);
  return editor;
}

function setPlatform(platform: string): void {
  Object.defineProperty(globalThis.navigator, 'platform', {
    value: platform,
    configurable: true,
  });
}

function setUserAgent(userAgent: string): void {
  Object.defineProperty(globalThis.navigator, 'userAgent', {
    value: userAgent,
    configurable: true,
  });
}

const PLAIN_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/120 Safari/537.36';
const EMBEDDED_UA = `${PLAIN_UA} Cursor/1.2.3`;
const configContextValue = {
  userBinding: null,
  userSynced: false,
  projectBinding: null,
  projectLocalBinding: null,
  okignoreBinding: null,
  okignoreSynced: false,
  userConfig: null,
  projectConfig: null,
  projectLocalConfig: null,
  projectLocalSynced: false,
  merged: { appearance: { preview: { autoOpen: true } } },
} as ConfigContextValue;

function renderButton({
  editor,
  shortcutEnabled = true,
  before,
}: {
  editor: Editor;
  shortcutEnabled?: boolean;
  before?: ReactNode;
}) {
  return render(
    <ConfigContext value={configContextValue}>
      {before}
      <EditWithAiBubbleButton editor={editor} shortcutEnabled={shortcutEnabled} />
    </ConfigContext>,
  );
}

afterEach(() => {
  cleanup();
  latestMenuInput = undefined;
  lastNonNullMenuInput = undefined;
  toastError.mockClear();
  refreshInstalledAgents.mockClear();
  setUserAgent(PLAIN_UA);
});

describe('EditWithAiBubbleButton', () => {
  test('renders the Edit with AI trigger on a macOS host', () => {
    setPlatform('MacIntel');
    const { editor } = makeEditor('specs/foo/SPEC', 'A passage.');
    renderButton({ editor });

    expect(screen.getByTestId('edit-with-ai-bubble-button')).toBeTruthy();
    expect(screen.queryByTestId('edit-with-ai-popover')).toBeNull();
  });

  test('does not render anything on a non-macOS host', () => {
    setPlatform('Linux x86_64');
    const { editor } = makeEditor('specs/foo/SPEC', 'A passage.');
    const { container } = renderButton({ editor });

    expect(screen.queryByTestId('edit-with-ai-bubble-button')).toBeNull();
    expect(container.firstChild).toBeNull();
  });

  test('does not render anything when embedded inside an agent host', () => {
    setPlatform('MacIntel');
    setUserAgent(EMBEDDED_UA);
    const { editor } = makeEditor('specs/foo/SPEC', 'A passage.');
    const { container } = renderButton({ editor });

    expect(screen.queryByTestId('edit-with-ai-bubble-button')).toBeNull();
    expect(container.firstChild).toBeNull();
  });

  test('Cmd+Shift+I does nothing when embedded inside an agent host', async () => {
    setPlatform('MacIntel');
    setUserAgent(EMBEDDED_UA);
    const { editor } = makeEditor('specs/foo/SPEC', 'A passage.');
    renderButton({ editor });

    await act(async () => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'I',
          code: 'KeyI',
          metaKey: true,
          shiftKey: true,
          bubbles: true,
          cancelable: true,
        }),
      );
    });

    expect(screen.queryByTestId('edit-with-ai-popover')).toBeNull();
    expect(latestMenuInput).toBeUndefined();
  });

  test('clicking the trigger opens the local Open with AI menu', async () => {
    setPlatform('MacIntel');
    const user = userEvent.setup();
    const { editor } = makeEditor('specs/foo/SPEC', 'A passage.');
    renderButton({ editor });

    await user.click(screen.getByTestId('edit-with-ai-bubble-button'));

    expect(screen.getByTestId('edit-with-ai-popover')).toBeTruthy();
    expect(latestMenuInput?.selection).toEqual({
      relativePath: 'specs/foo/SPEC.md',
      instruction: '',
      selectionMarkdown: 'A passage.',
    });
    expect(refreshInstalledAgents).toHaveBeenCalled();
  });

  test('pressing Enter on the trigger opens the local Open with AI menu', async () => {
    setPlatform('MacIntel');
    const user = userEvent.setup();
    const { editor } = makeEditor('specs/foo/SPEC', 'A passage.');
    renderButton({ editor });

    screen.getByTestId('edit-with-ai-bubble-button').focus();
    await user.keyboard('{Enter}');

    expect(screen.getByTestId('edit-with-ai-popover')).toBeTruthy();
    expect(latestMenuInput?.selection?.selectionMarkdown).toBe('A passage.');
  });

  test('pressing Space on the trigger opens the local Open with AI menu', async () => {
    setPlatform('MacIntel');
    const { editor } = makeEditor('specs/foo/SPEC', 'A passage.');
    renderButton({ editor });

    await act(async () => {
      screen.getByTestId('edit-with-ai-bubble-button').dispatchEvent(
        new KeyboardEvent('keydown', {
          key: ' ',
          code: 'Space',
          bubbles: true,
          cancelable: true,
        }),
      );
    });

    expect(screen.getByTestId('edit-with-ai-popover')).toBeTruthy();
    expect(latestMenuInput?.selection?.selectionMarkdown).toBe('A passage.');
  });

  test('synthetic click activation opens the local Open with AI menu', async () => {
    setPlatform('MacIntel');
    const { editor } = makeEditor('specs/foo/SPEC', 'A passage.');
    renderButton({ editor });

    await act(async () => {
      screen.getByTestId('edit-with-ai-bubble-button').click();
    });

    expect(screen.getByTestId('edit-with-ai-popover')).toBeTruthy();
    expect(latestMenuInput?.selection).toMatchObject({
      selectionMarkdown: 'A passage.',
    });
  });

  test('clicking an already-open trigger does not replace the captured selection', async () => {
    setPlatform('MacIntel');
    const user = userEvent.setup();
    const { editor, setSelectionText } = makeEditor('specs/foo/SPEC', 'Original passage.');
    renderButton({ editor });

    await user.click(screen.getByTestId('edit-with-ai-bubble-button'));
    expect(latestMenuInput?.selection?.selectionMarkdown).toBe('Original passage.');

    setSelectionText('Changed after open.');
    await user.click(screen.getByTestId('edit-with-ai-bubble-button'));

    expect(lastNonNullMenuInput?.selection?.selectionMarkdown).toBe('Original passage.');
  });

  test('closing and reopening the trigger captures the current selection', async () => {
    setPlatform('MacIntel');
    const user = userEvent.setup();
    const { editor, setSelectionText } = makeEditor('specs/foo/SPEC', 'Original passage.');
    renderButton({ editor });

    await user.click(screen.getByTestId('edit-with-ai-bubble-button'));
    expect(latestMenuInput?.selection?.selectionMarkdown).toBe('Original passage.');

    await user.keyboard('{Escape}');
    expect(screen.queryByTestId('edit-with-ai-popover')).toBeNull();
    expect(latestMenuInput).toBeNull();

    setSelectionText('Changed after close.');
    await user.click(screen.getByTestId('edit-with-ai-bubble-button'));

    expect(screen.getByTestId('edit-with-ai-popover')).toBeTruthy();
    expect(latestMenuInput?.selection?.selectionMarkdown).toBe('Changed after close.');
  });

  test('selection serialization failure shows an error toast without opening the menu', async () => {
    setPlatform('MacIntel');
    const user = userEvent.setup();
    const editor = makeThrowingEditor('specs/foo/SPEC');
    const originalConsoleError = console.error;
    const consoleError = mock(() => {});
    renderButton({ editor });

    console.error = consoleError as typeof console.error;
    try {
      await user.click(screen.getByTestId('edit-with-ai-bubble-button'));
    } finally {
      console.error = originalConsoleError;
    }

    expect(screen.queryByTestId('edit-with-ai-popover')).toBeNull();
    expect(latestMenuInput).toBeNull();
    expect(consoleError).toHaveBeenCalledTimes(1);
    expect(toastError).toHaveBeenCalledTimes(1);
    expect(toastError.mock.calls[0]?.[0]).toBe("Couldn't read the selection — please try again.");
  });

  test('keyboard selection serialization failure shows an error toast without opening the menu', async () => {
    setPlatform('MacIntel');
    const user = userEvent.setup();
    const editor = makeThrowingEditor('specs/foo/SPEC');
    const originalConsoleError = console.error;
    const consoleError = mock(() => {});
    renderButton({ editor });

    console.error = consoleError as typeof console.error;
    try {
      screen.getByTestId('edit-with-ai-bubble-button').focus();
      await user.keyboard('{Enter}');
    } finally {
      console.error = originalConsoleError;
    }

    expect(screen.queryByTestId('edit-with-ai-popover')).toBeNull();
    expect(latestMenuInput).toBeNull();
    expect(consoleError).toHaveBeenCalledTimes(1);
    expect(toastError).toHaveBeenCalledTimes(1);
    expect(toastError.mock.calls[0]?.[0]).toBe("Couldn't read the selection — please try again.");
  });

  test('Cmd+Shift+I opens the local Open with AI menu', async () => {
    setPlatform('MacIntel');
    const { editor } = makeEditor('specs/foo/SPEC', 'A passage.');
    renderButton({ editor });

    await act(async () => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'I',
          code: 'KeyI',
          metaKey: true,
          shiftKey: true,
          bubbles: true,
          cancelable: true,
        }),
      );
    });

    expect(screen.getByTestId('edit-with-ai-popover')).toBeTruthy();
    expect(latestMenuInput?.selection).toEqual({
      relativePath: 'specs/foo/SPEC.md',
      instruction: '',
      selectionMarkdown: 'A passage.',
    });
  });

  test('Cmd+Shift+I ignores inactive mounted editors', async () => {
    setPlatform('MacIntel');
    const { editor } = makeEditor('specs/foo/SPEC', 'A passage.');
    renderButton({ editor, shortcutEnabled: false });

    await act(async () => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'I',
          code: 'KeyI',
          metaKey: true,
          shiftKey: true,
          bubbles: true,
          cancelable: true,
        }),
      );
    });

    expect(screen.queryByTestId('edit-with-ai-popover')).toBeNull();
    expect(latestMenuInput).toBeNull();
  });

  test('Cmd+Shift+I ignores native text inputs', async () => {
    setPlatform('MacIntel');
    const { editor } = makeEditor('specs/foo/SPEC', 'A passage.');
    renderButton({ editor, before: <input data-testid="native-input" /> });

    await act(async () => {
      screen.getByTestId('native-input').dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'I',
          code: 'KeyI',
          metaKey: true,
          shiftKey: true,
          bubbles: true,
          cancelable: true,
        }),
      );
    });

    expect(screen.queryByTestId('edit-with-ai-popover')).toBeNull();
    expect(latestMenuInput).toBeNull();
  });

  test('request carries the editor doc name and serialized selection', async () => {
    setPlatform('MacIntel');
    const user = userEvent.setup();
    const { editor } = makeEditor('specs/foo/SPEC', 'The selected passage.');
    renderButton({ editor });

    await user.click(screen.getByTestId('edit-with-ai-bubble-button'));

    expect(latestMenuInput?.selection).toEqual({
      relativePath: 'specs/foo/SPEC.md',
      instruction: '',
      selectionMarkdown: 'The selected passage.',
    });
  });

  test('a selection change after the request does not alter the dispatched passage', async () => {
    setPlatform('MacIntel');
    const user = userEvent.setup();
    const { editor, setSelectionText } = makeEditor('specs/foo/SPEC', 'Original passage.');
    renderButton({ editor });

    await user.click(screen.getByTestId('edit-with-ai-bubble-button'));
    setSelectionText('A different passage entirely.');

    expect(latestMenuInput?.selection).toMatchObject({
      selectionMarkdown: 'Original passage.',
    });
  });
});
