
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { codeLanguageForExtension } from '@inkeep/open-knowledge-core';
import { Trans, useLingui } from '@lingui/react/macro';
import { basicDarkInit, basicLightInit } from '@uiw/codemirror-theme-basic';
import { basicSetup } from 'codemirror';
import { useTheme } from 'next-themes';
import { useEffect, useRef, useState } from 'react';
import { loadCodeMirrorLanguageForExtension } from './text-viewer-languages';

const darkTheme = basicDarkInit({
  settings: {
    background: 'var(--background)',
    gutterBackground: 'var(--muted)',
  },
});

const lightTheme = basicLightInit({
  settings: {
    background: 'var(--background)',
    gutterBackground: 'var(--muted)',
  },
});

interface TextViewerProps {
  src: string;
  fileName: string;
  extension: string;
}

type FetchState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'loaded'; content: string };

function useAssetText(src: string): FetchState {
  const { t } = useLingui();
  const [state, setState] = useState<FetchState>({ status: 'loading' });
  useEffect(() => {
    let cancelled = false;
    const ctrl = new AbortController();
    setState({ status: 'loading' });
    fetch(src, { credentials: 'same-origin', signal: ctrl.signal })
      .then(async (resp) => {
        if (!resp.ok) {
          const status = resp.status;
          if (status === 413) {
            throw new Error(
              t`This file is too large to open in the built-in text editor (1 MB limit). Use Open file below to open it in another app.`,
            );
          }
          if (status === 404) {
            throw new Error(t`This file could not be found.`);
          }
          if (status === 400) {
            throw new Error(t`This file can't be opened in the text editor.`);
          }
          throw new Error(t`Something went wrong opening this file (HTTP ${status}).`);
        }
        return resp.text();
      })
      .then((content) => {
        if (cancelled) return;
        setState({ status: 'loaded', content });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof Error && err.name === 'AbortError') return;
        const message = err instanceof Error ? err.message : t`Failed to load file`;
        setState({ status: 'error', message });
      });
    return () => {
      cancelled = true;
      ctrl.abort();
    };
  }, [src, t]);
  return state;
}

export function TextViewer({ src, fileName, extension }: TextViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const { resolvedTheme } = useTheme();
  const fetchState = useAssetText(src);
  const loadedContent = fetchState.status === 'loaded' ? fetchState.content : null;

  useEffect(() => {
    if (!containerRef.current) return;
    if (loadedContent === null) return;

    const normalized = extension.toLowerCase();
    const canonical = codeLanguageForExtension(normalized);
    const theme = resolvedTheme === 'dark' ? darkTheme : lightTheme;
    let aborted = false;
    let view: EditorView | null = null;
    void loadCodeMirrorLanguageForExtension(normalized, canonical).then((language) => {
      if (aborted) return;
      if (!containerRef.current) return;
      const extensions = [
        basicSetup,
        ...(language ? [language] : []),
        EditorView.editable.of(true),
        EditorState.readOnly.of(true),
        EditorView.lineWrapping,
        theme,
      ];
      view = new EditorView({
        state: EditorState.create({ doc: loadedContent, extensions }),
        parent: containerRef.current,
      });
      viewRef.current = view;
    });

    return () => {
      aborted = true;
      view?.destroy();
      viewRef.current = null;
    };
  }, [loadedContent, extension, resolvedTheme]);

  if (fetchState.status === 'loading') {
    return (
      <main
        className="flex h-full min-h-0 flex-col items-center justify-center bg-background text-muted-foreground text-sm"
        aria-label={fileName}
        data-text-viewer=""
        data-text-viewer-state="loading"
        data-text-viewer-extension={extension}
      >
        <span>
          <Trans>Loading {fileName}</Trans>
        </span>
      </main>
    );
  }

  if (fetchState.status === 'error') {
    return (
      <main
        className="flex h-full min-h-0 flex-col items-center justify-center gap-2 bg-background p-4 text-center"
        aria-label={fileName}
        data-text-viewer=""
        data-text-viewer-state="error"
        data-text-viewer-extension={extension}
      >
        <div className="font-medium text-sm">
          <Trans>Couldn't load {fileName}</Trans>
        </div>
        <div className="text-muted-foreground text-xs">{fetchState.message}</div>
        <a
          href={src}
          className="mt-2 rounded-md border px-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
        >
          <Trans>Open file</Trans>
        </a>
      </main>
    );
  }

  return (
    <main
      className="flex h-full min-h-0 flex-col bg-background"
      aria-label={fileName}
      data-text-viewer=""
      data-text-viewer-state="loaded"
      data-text-viewer-extension={extension}
    >
      <div ref={containerRef} className="min-h-0 flex-1 overflow-auto" />
    </main>
  );
}
