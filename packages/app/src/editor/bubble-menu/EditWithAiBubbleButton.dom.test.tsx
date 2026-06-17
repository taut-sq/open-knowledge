
import { afterEach, describe, expect, mock, test } from 'bun:test';
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Schema } from '@tiptap/pm/model';
import type { Editor } from '@tiptap/react';
import type { ReactNode } from 'react';
import { setEditorDocName } from '../extensions/doc-context.ts';

type WindowGlobals = {
  MutationObserver?: typeof MutationObserver;
  NodeFilter?: typeof NodeFilter;
};
type GlobalWithDomShims = typeof globalThis &
  WindowGlobals & {
    window?: WindowGlobals;
    ResizeObserver?: unknown;
  };
const globalWithDomShims = globalThis as GlobalWithDomShims;
if (
  globalWithDomShims.MutationObserver === undefined &&
  globalWithDomShims.window?.MutationObserver !== undefined
) {
  globalWithDomShims.MutationObserver = globalWithDomShims.window.MutationObserver;
}
if (
  globalWithDomShims.NodeFilter === undefined &&
  globalWithDomShims.window?.NodeFilter !== undefined
) {
  globalWithDomShims.NodeFilter = globalWithDomShims.window.NodeFilter;
}
if (globalWithDomShims.ResizeObserver === undefined) {
  class NoopResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  globalWithDomShims.ResizeObserver = NoopResizeObserver;
}

const toastError = mock(() => {});
const refreshInstalledAgents = mock(async () => {});
const dispatchCalls: Array<{ target: string; input: unknown }> = [];
const buildArgs: Array<{
  docName: string | null;
  instruction: string;
  selectionMarkdown: string;
}> = [];

mock.module('sonner', () => ({ toast: { error: toastError, success: () => {} } }));

mock.module('@/components/handoff/useInstalledAgents', () => ({
  useInstalledAgents: () => ({
    states: {
      'claude-cowork': { installed: false, lastChecked: 1 },
      'claude-code': { installed: true, lastChecked: 1 },
      codex: { installed: true, lastChecked: 1 },
      cursor: { installed: true, lastChecked: 1 },
    },
    refresh: refreshInstalledAgents,
  }),
}));

mock.module('@/components/handoff/useHandoffDispatch', () => ({
  useHandoffDispatch: () => ({
    dispatch: (target: string, input: unknown) => {
      dispatchCalls.push({ target, input });
      return Promise.resolve({ ok: true });
    },
    reinstallCoworkSkill: () => Promise.resolve({ kind: 'already-installed' }),
  }),
  buildSelectionOrDocHandoffInput: (args: {
    docName: string | null;
    instruction: string;
    selectionMarkdown: string;
  }) => {
    buildArgs.push(args);
    return args.selectionMarkdown === '' ? null : { __built: true };
  },
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

const instructionInput = () => screen.queryByTestId('edit-with-ai-instruction');

afterEach(() => {
  cleanup();
  toastError.mockClear();
  refreshInstalledAgents.mockClear();
  dispatchCalls.length = 0;
  buildArgs.length = 0;
  setUserAgent(PLAIN_UA);
});

describe('EditWithAiBubbleButton', () => {
  test('renders the Edit with AI trigger on a macOS host with the popover closed', () => {
    setPlatform('MacIntel');
    const { editor } = makeEditor('specs/foo/SPEC', 'A passage.');
    renderButton({ editor });

    expect(screen.getByTestId('edit-with-ai-bubble-button')).toBeTruthy();
    expect(instructionInput()).toBeNull();
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
      dispatchEditWithAiShortcut(window);
    });

    expect(instructionInput()).toBeNull();
  });

  test('clicking the trigger opens the popover and refreshes install state', async () => {
    setPlatform('MacIntel');
    const user = userEvent.setup();
    const { editor } = makeEditor('specs/foo/SPEC', 'A passage.');
    renderButton({ editor });

    await user.click(screen.getByTestId('edit-with-ai-bubble-button'));

    expect(instructionInput()).toBeTruthy();
    expect(refreshInstalledAgents).toHaveBeenCalled();
  });

  test('Cmd+Shift+I opens the popover', async () => {
    setPlatform('MacIntel');
    const { editor } = makeEditor('specs/foo/SPEC', 'A passage.');
    renderButton({ editor });

    await act(async () => {
      dispatchEditWithAiShortcut(window);
    });

    expect(instructionInput()).toBeTruthy();
  });

  test('Cmd+Shift+I ignores inactive mounted editors', async () => {
    setPlatform('MacIntel');
    const { editor } = makeEditor('specs/foo/SPEC', 'A passage.');
    renderButton({ editor, shortcutEnabled: false });

    await act(async () => {
      dispatchEditWithAiShortcut(window);
    });

    expect(instructionInput()).toBeNull();
  });

  test('Cmd+Shift+I ignores native text inputs', async () => {
    setPlatform('MacIntel');
    const { editor } = makeEditor('specs/foo/SPEC', 'A passage.');
    renderButton({ editor, before: <input data-testid="native-input" /> });

    await act(async () => {
      dispatchEditWithAiShortcut(screen.getByTestId('native-input'));
    });

    expect(instructionInput()).toBeNull();
  });

  test('typing an instruction and picking an agent dispatches the selection with the instruction', async () => {
    setPlatform('MacIntel');
    const user = userEvent.setup();
    const { editor } = makeEditor('specs/foo/SPEC', 'The selected passage.');
    renderButton({ editor });

    await user.click(screen.getByTestId('edit-with-ai-bubble-button'));
    await user.type(screen.getByTestId('edit-with-ai-instruction'), 'tighten the prose');
    await user.click(screen.getByTestId('edit-with-ai-target-claude-code'));

    expect(buildArgs).toEqual([
      {
        docName: 'specs/foo/SPEC',
        workspace: { contentDir: '/tmp/project', pathSeparator: '/' },
        instruction: 'tighten the prose',
        selectionMarkdown: 'The selected passage.',
      },
    ]);
    expect(dispatchCalls).toEqual([{ target: 'claude-code', input: { __built: true } }]);
  });

  test('picking an agent with no instruction still dispatches the selection', async () => {
    setPlatform('MacIntel');
    const user = userEvent.setup();
    const { editor } = makeEditor('specs/foo/SPEC', 'A passage.');
    renderButton({ editor });

    await user.click(screen.getByTestId('edit-with-ai-bubble-button'));
    await user.click(screen.getByTestId('edit-with-ai-target-codex'));

    expect(buildArgs[0]?.instruction).toBe('');
    expect(dispatchCalls).toEqual([{ target: 'codex', input: { __built: true } }]);
  });

  test('a selection change after the popover opens does not alter the dispatched passage', async () => {
    setPlatform('MacIntel');
    const user = userEvent.setup();
    const { editor, setSelectionText } = makeEditor('specs/foo/SPEC', 'Original passage.');
    renderButton({ editor });

    await user.click(screen.getByTestId('edit-with-ai-bubble-button'));
    setSelectionText('A different passage entirely.');
    await user.click(screen.getByTestId('edit-with-ai-target-claude-code'));

    expect(buildArgs[0]?.selectionMarkdown).toBe('Original passage.');
  });

  test('selection serialization failure shows an error toast without opening the popover', async () => {
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

    expect(instructionInput()).toBeNull();
    expect(consoleError).toHaveBeenCalledTimes(1);
    expect(toastError).toHaveBeenCalledTimes(1);
    expect(toastError.mock.calls[0]?.[0]).toBe("Couldn't read the selection — please try again.");
  });

  test('keyboard selection serialization failure shows an error toast without opening the popover', async () => {
    setPlatform('MacIntel');
    const editor = makeThrowingEditor('specs/foo/SPEC');
    const originalConsoleError = console.error;
    const consoleError = mock(() => {});
    renderButton({ editor });

    console.error = consoleError as typeof console.error;
    try {
      await act(async () => {
        dispatchEditWithAiShortcut(window);
      });
    } finally {
      console.error = originalConsoleError;
    }

    expect(instructionInput()).toBeNull();
    expect(consoleError).toHaveBeenCalledTimes(1);
    expect(toastError).toHaveBeenCalledTimes(1);
    expect(toastError.mock.calls[0]?.[0]).toBe("Couldn't read the selection — please try again.");
  });
});
