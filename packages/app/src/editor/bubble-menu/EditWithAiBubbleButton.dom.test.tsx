
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Schema } from '@tiptap/pm/model';
import type { Editor } from '@tiptap/react';
import type { ReactNode } from 'react';
import { subscribeToOpenAskAiComposer } from '@/components/ask-ai-composer-events';
import { subscribeToActiveTerminalInput } from '@/components/handoff/terminal-input-events';
import { setEditorDocName } from '../extensions/doc-context.ts';

mock.module('sonner', () => ({ toast: { error: () => {}, success: () => {} } }));

if (typeof globalThis.requestAnimationFrame === 'undefined') {
  globalThis.requestAnimationFrame = ((callback) => {
    queueMicrotask(() => callback(0));
    return 0;
  }) as typeof globalThis.requestAnimationFrame;
}

const { EditWithAiBubbleButton } = await import('./EditWithAiBubbleButton');

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { group: 'block', content: 'text*', toDOM: () => ['p', 0] },
    text: { group: 'inline' },
  },
});

/** A minimal fake TipTap editor. The click handler serializes the selection to
 *  markdown via `serializeWysiwygSelection` (which reads `selection.content()`);
 *  `collapsed` yields an empty selection so the caret-only → composer fallback
 *  can be exercised. A `null` docName leaves the editor with no registered doc
 *  name (`setEditorDocName` deletes the entry), exercising the ungrounded path. */
function makeEditor(docName: string | null, text: string, collapsed = false): Editor {
  const doc = schema.node('doc', null, [schema.node('paragraph', null, [schema.text(text)])]);
  const from = 1;
  const to = collapsed ? 1 : 1 + text.length;
  const editor = {
    state: {
      schema,
      doc,
      selection: { from, to, content: () => doc.slice(from, to) },
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

let openRequests = 0;
let unsubscribe: (() => void) | null = null;
let terminalInputs: string[] = [];
let unsubscribeTerminal: (() => void) | null = null;

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
    <>
      {before}
      <EditWithAiBubbleButton editor={editor} shortcutEnabled={shortcutEnabled} />
    </>,
  );
}

function dispatchEditWithAiShortcut(target: EventTarget): void {
  target.dispatchEvent(
    new KeyboardEvent('keydown', {
      key: 'I',
      code: 'KeyI',
      metaKey: true,
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    }),
  );
}

beforeEach(() => {
  openRequests = 0;
  terminalInputs = [];
  unsubscribe = subscribeToOpenAskAiComposer(() => {
    openRequests += 1;
  });
  unsubscribeTerminal = subscribeToActiveTerminalInput((text) => {
    terminalInputs.push(text);
  });
});

afterEach(() => {
  unsubscribe?.();
  unsubscribe = null;
  unsubscribeTerminal?.();
  unsubscribeTerminal = null;
  cleanup();
  setUserAgent(PLAIN_UA);
});

describe('EditWithAiBubbleButton', () => {
  test('renders the Ask AI trigger on a macOS host', () => {
    setPlatform('MacIntel');
    const editor = makeEditor('specs/foo/SPEC', 'A passage.');
    renderButton({ editor });

    const button = screen.getByTestId('edit-with-ai-bubble-button');
    expect(button).toBeTruthy();
    expect(button.textContent).toContain('Ask AI');
  });

  test('does not render anything on a non-macOS host', () => {
    setPlatform('Linux x86_64');
    const editor = makeEditor('specs/foo/SPEC', 'A passage.');
    const { container } = renderButton({ editor });

    expect(screen.queryByTestId('edit-with-ai-bubble-button')).toBeNull();
    expect(container.firstChild).toBeNull();
  });

  test('does not render anything when embedded inside an agent host', () => {
    setPlatform('MacIntel');
    setUserAgent(EMBEDDED_UA);
    const editor = makeEditor('specs/foo/SPEC', 'A passage.');
    const { container } = renderButton({ editor });

    expect(screen.queryByTestId('edit-with-ai-bubble-button')).toBeNull();
    expect(container.firstChild).toBeNull();
  });

  test('clicking the trigger sends a GROUNDED selection prompt to the active terminal', async () => {
    setPlatform('MacIntel');
    const user = userEvent.setup();
    const editor = makeEditor('specs/foo/SPEC', 'A passage.');
    renderButton({ editor });

    await user.click(screen.getByTestId('edit-with-ai-bubble-button'));

    await waitFor(() => expect(terminalInputs).toHaveLength(1));
    const [prompt] = terminalInputs;
    expect(prompt).toContain('@specs/foo/SPEC.md');
    expect(prompt).toContain('A passage.');
    expect(prompt).not.toBe('A passage.');
    expect(openRequests).toBe(0);
  });

  test('clicking with an empty selection opens the Ask AI composer instead', async () => {
    setPlatform('MacIntel');
    const user = userEvent.setup();
    const editor = makeEditor('specs/foo/SPEC', 'A passage.', /* collapsed */ true);
    renderButton({ editor });

    await user.click(screen.getByTestId('edit-with-ai-bubble-button'));

    await waitFor(() => expect(openRequests).toBe(1));
    expect(terminalInputs).toEqual([]);
  });

  test('clicking with no registered doc name opens the composer instead', async () => {
    setPlatform('MacIntel');
    const user = userEvent.setup();
    const editor = makeEditor(null, 'A passage.');
    renderButton({ editor });

    await user.click(screen.getByTestId('edit-with-ai-bubble-button'));

    await waitFor(() => expect(openRequests).toBe(1));
    expect(terminalInputs).toEqual([]);
  });

  test('Cmd+Shift+I requests the Ask AI composer open+focus', async () => {
    setPlatform('MacIntel');
    const editor = makeEditor('specs/foo/SPEC', 'A passage.');
    renderButton({ editor });

    await act(async () => {
      dispatchEditWithAiShortcut(window);
    });

    expect(openRequests).toBe(1);
  });

  test('Cmd+Shift+I does nothing when embedded inside an agent host', async () => {
    setPlatform('MacIntel');
    setUserAgent(EMBEDDED_UA);
    const editor = makeEditor('specs/foo/SPEC', 'A passage.');
    renderButton({ editor });

    await act(async () => {
      dispatchEditWithAiShortcut(window);
    });

    expect(openRequests).toBe(0);
  });

  test('Cmd+Shift+I ignores inactive mounted editors', async () => {
    setPlatform('MacIntel');
    const editor = makeEditor('specs/foo/SPEC', 'A passage.');
    renderButton({ editor, shortcutEnabled: false });

    await act(async () => {
      dispatchEditWithAiShortcut(window);
    });

    expect(openRequests).toBe(0);
  });

  test('Cmd+Shift+I ignores native text inputs', async () => {
    setPlatform('MacIntel');
    const editor = makeEditor('specs/foo/SPEC', 'A passage.');
    renderButton({ editor, before: <input data-testid="native-input" /> });

    await act(async () => {
      dispatchEditWithAiShortcut(screen.getByTestId('native-input'));
    });

    expect(openRequests).toBe(0);
  });
});
