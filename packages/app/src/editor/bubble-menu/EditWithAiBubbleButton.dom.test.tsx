
import { afterEach, describe, expect, mock, test } from 'bun:test';
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Schema } from '@tiptap/pm/model';
import type { Editor } from '@tiptap/react';
import type { ReactNode } from 'react';
import { setEditorDocName } from '../extensions/doc-context.ts';

const openRequests: unknown[] = [];
const toastError = mock(() => {});

mock.module('sonner', () => ({ toast: { error: toastError } }));

const { OpenInAgentMenuRequestProvider } = await import(
  '../../components/handoff/OpenInAgentMenuRequestContext'
);
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
  const editor = {
    state: {
      schema,
      selection: { content: () => doc.slice(0, doc.content.size) },
    },
  } as unknown as Editor;
  setEditorDocName(editor, docName);
  return {
    editor,
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
    <OpenInAgentMenuRequestProvider
      value={{
        openSelection(request) {
          openRequests.push(request);
          return true;
        },
      }}
    >
      {before}
      <EditWithAiBubbleButton editor={editor} shortcutEnabled={shortcutEnabled} />
    </OpenInAgentMenuRequestProvider>,
  );
}

afterEach(() => {
  cleanup();
  openRequests.length = 0;
  toastError.mockClear();
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

  test('clicking the trigger requests the header Open with AI menu', async () => {
    setPlatform('MacIntel');
    const user = userEvent.setup();
    const { editor } = makeEditor('specs/foo/SPEC', 'A passage.');
    renderButton({ editor });

    await user.click(screen.getByTestId('edit-with-ai-bubble-button'));

    expect(screen.queryByTestId('edit-with-ai-popover')).toBeNull();
    expect(openRequests).toEqual([
      {
        docName: 'specs/foo/SPEC',
        instruction: '',
        selectionMarkdown: 'A passage.',
      },
    ]);
  });

  test('selection serialization failure shows an error toast without dispatching', async () => {
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

    expect(openRequests).toEqual([]);
    expect(consoleError).toHaveBeenCalledTimes(1);
    expect(toastError).toHaveBeenCalledTimes(1);
    expect(toastError.mock.calls[0]?.[0]).toBe("Couldn't read the selection — please try again.");
  });

  test('Cmd+Shift+I requests the header Open with AI menu', async () => {
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

    expect(screen.queryByTestId('edit-with-ai-popover')).toBeNull();
    expect(openRequests).toEqual([
      {
        docName: 'specs/foo/SPEC',
        instruction: '',
        selectionMarkdown: 'A passage.',
      },
    ]);
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
    expect(openRequests).toEqual([]);
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

    expect(openRequests).toEqual([]);
  });

  test('request carries the editor doc name and serialized selection', async () => {
    setPlatform('MacIntel');
    const user = userEvent.setup();
    const { editor } = makeEditor('specs/foo/SPEC', 'The selected passage.');
    renderButton({ editor });

    await user.click(screen.getByTestId('edit-with-ai-bubble-button'));

    expect(openRequests).toEqual([
      {
        docName: 'specs/foo/SPEC',
        instruction: '',
        selectionMarkdown: 'The selected passage.',
      },
    ]);
  });

  test('a selection change after the request does not alter the dispatched passage', async () => {
    setPlatform('MacIntel');
    const user = userEvent.setup();
    const { editor, setSelectionText } = makeEditor('specs/foo/SPEC', 'Original passage.');
    renderButton({ editor });

    await user.click(screen.getByTestId('edit-with-ai-bubble-button'));
    setSelectionText('A different passage entirely.');

    expect(openRequests).toHaveLength(1);
    expect(openRequests[0]).toMatchObject({ selectionMarkdown: 'Original passage.' });
  });
});
