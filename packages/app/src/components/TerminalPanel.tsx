import '@xterm/xterm/css/xterm.css';

import { buildClaudeLaunchCommand } from '@inkeep/open-knowledge-core';
import { useLingui } from '@lingui/react/macro';
import { FitAddon } from '@xterm/addon-fit';
import { Unicode11Addon } from '@xterm/addon-unicode11';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { WebglAddon } from '@xterm/addon-webgl';
import { Terminal } from '@xterm/xterm';
import { Trash2 } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import type { ClaudeReadiness, OkDesktopBridge } from '@/lib/desktop-bridge-types';
import { cn } from '@/lib/utils';
import { ClaudeReadinessBanner } from './ClaudeReadinessBanner';
import type { TerminalLaunchIntent } from './EditorPane';
import { type TerminalExitInfo, TerminalExitNotice } from './TerminalExitNotice';
import { TerminalRefusalNotice } from './TerminalRefusalNotice';
import { xtermThemeForMode } from './terminal-theme';

interface TerminalPanelProps {
  /** Desktop bridge — the panel is rendered only on the Electron host, where
   *  `window.okDesktop` is present. */
  readonly bridge: OkDesktopBridge;
  readonly className?: string;
  readonly onClose?: () => void;
  readonly onKill?: () => void;
  readonly onExit?: (info: { readonly exitCode: number; readonly signal: number | null }) => void;
  readonly launch?: TerminalLaunchIntent | null;
}

export function TerminalPanel({
  bridge,
  className,
  onClose,
  onKill,
  onExit,
  launch = null,
}: TerminalPanelProps) {
  const { t } = useLingui();
  const { resolvedTheme } = useTheme();
  const [restartKey, setRestartKey] = useState(0);
  return (
    <section
      aria-label={t`Terminal`}
      style={{ backgroundColor: xtermThemeForMode(resolvedTheme).background }}
      className={cn('relative flex h-full w-full flex-col overflow-hidden', className)}
    >
      {onKill ? (
        <div className="flex shrink-0 items-center justify-end px-1.5 py-1">
          <Button
            size="icon"
            variant="ghost"
            aria-label={t`Kill Terminal`}
            className="size-6 text-muted-foreground hover:text-foreground"
            onClick={onKill}
          >
            <Trash2 aria-hidden="true" className="size-4" />
          </Button>
        </div>
      ) : null}
      {/* Positioning context for the session's absolute exit/refusal notices, so
          they cover the canvas area and not the kill control above. */}
      <div className="relative min-h-0 flex-1">
        <TerminalSession
          key={restartKey}
          bridge={bridge}
          onClose={onClose}
          onExit={onExit}
          onRestart={() => setRestartKey((k) => k + 1)}
          launch={launch}
        />
      </div>
    </section>
  );
}

type SessionStatus = 'starting' | 'running' | 'no-project' | 'not-consented' | 'exited';

interface TerminalSessionProps {
  readonly bridge: OkDesktopBridge;
  readonly onClose?: () => void;
  readonly onExit?: (info: { readonly exitCode: number; readonly signal: number | null }) => void;
  readonly onRestart: () => void;
  readonly launch?: TerminalLaunchIntent | null;
}

function TerminalSession({
  bridge,
  onClose,
  onExit,
  onRestart,
  launch = null,
}: TerminalSessionProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const onExitRef = useRef(onExit);
  const { resolvedTheme } = useTheme();
  const termRef = useRef<Terminal | null>(null);
  const initialResolvedThemeRef = useRef(resolvedTheme);
  const [status, setStatus] = useState<SessionStatus>('starting');
  const [readiness, setReadiness] = useState<ClaudeReadiness | null>(null);
  const [preflightDone, setPreflightDone] = useState(false);
  const [exitInfo, setExitInfo] = useState<TerminalExitInfo | null>(null);
  const ptyIdRef = useRef<string | null>(null);
  const [firstOutputSeen, setFirstOutputSeen] = useState(false);
  const lastLaunchedNonceRef = useRef<number | null>(null);

  useEffect(() => {
    onExitRef.current = onExit;
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;
    let ptyId: string | null = null;
    let unsubData: (() => void) | undefined;
    let unsubExit: (() => void) | undefined;
    let observer: ResizeObserver | undefined;

    const term = new Terminal({
      screenReaderMode: true,
      minimumContrastRatio: 4.5,
      allowProposedApi: true,
      cursorBlink: true,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, monospace',
      fontSize: 13,
      theme: xtermThemeForMode(initialResolvedThemeRef.current),
    });
    termRef.current = term;
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.loadAddon(new Unicode11Addon());
    term.unicode.activeVersion = '11';
    term.loadAddon(new WebLinksAddon());

    term.open(container);

    try {
      term.loadAddon(new WebglAddon());
    } catch (err) {
      console.warn('[terminal] WebGL addon failed, using DOM renderer:', err);
    }

    fit.fit();

    void (async () => {
      let result: Awaited<ReturnType<typeof bridge.terminal.create>>;
      try {
        result = await bridge.terminal.create({ cols: term.cols, rows: term.rows });
      } catch (err) {
        if (cancelled) return;
        setExitInfo({
          exitCode: 1,
          signal: null,
          error: err instanceof Error ? err.message : String(err),
        });
        setStatus('exited');
        return;
      }

      if (cancelled) {
        if (result.ok)
          void bridge.terminal
            .kill(result.ptyId)
            .catch((err) => console.warn('[terminal] kill after cancelled mount failed:', err));
        return;
      }
      if (!result.ok) {
        setStatus(result.reason === 'not-consented' ? 'not-consented' : 'no-project');
        return;
      }

      ptyId = result.ptyId;
      ptyIdRef.current = result.ptyId;
      setStatus('running');

      term.onData((data) => {
        if (ptyId) bridge.terminal.input(ptyId, data);
      });

      unsubData = bridge.terminal.onData((msg) => {
        if (msg.ptyId !== ptyId) return;
        if (!cancelled) setFirstOutputSeen(true);
        term.write(msg.data, () => bridge.terminal.drain(msg.ptyId, msg.data.length));
      });

      unsubExit = bridge.terminal.onExit((msg) => {
        if (msg.ptyId !== ptyId) return;
        setExitInfo({ exitCode: msg.exitCode, signal: msg.signal, error: msg.error });
        setStatus('exited');
        onExitRef.current?.({ exitCode: msg.exitCode, signal: msg.signal });
      });

      observer = new ResizeObserver(() => {
        fit.fit();
        if (ptyId) bridge.terminal.resize(ptyId, term.cols, term.rows);
      });
      observer.observe(container);

      term.focus();

      bridge.terminal
        .claudePreflight()
        .then((readinessResult) => {
          if (!cancelled) setReadiness(readinessResult);
        })
        .catch((err) => {
          console.warn('[terminal] claude readiness preflight failed', err);
        })
        .finally(() => {
          if (!cancelled) setPreflightDone(true);
        });
    })();

    return () => {
      cancelled = true;
      ptyIdRef.current = null;
      termRef.current = null;
      observer?.disconnect();
      unsubData?.();
      unsubExit?.();
      term.dispose();
      if (ptyId)
        void bridge.terminal
          .kill(ptyId)
          .catch((err) => console.warn('[terminal] kill on unmount failed:', err));
    };
  }, [bridge]);

  useEffect(() => {
    const term = termRef.current;
    if (term === null) return;
    term.options.theme = xtermThemeForMode(resolvedTheme);
  }, [resolvedTheme]);

  useEffect(() => {
    if (launch === null) return;
    if (status !== 'running') return;
    if (!firstOutputSeen) return;
    if (!preflightDone) return;
    if (lastLaunchedNonceRef.current === launch.nonce) return;
    const ptyId = ptyIdRef.current;
    if (ptyId === null) return;
    if (readiness?.claude === 'not-found') {
      lastLaunchedNonceRef.current = launch.nonce;
      return;
    }
    lastLaunchedNonceRef.current = launch.nonce;
    bridge.terminal.input(ptyId, buildClaudeLaunchCommand(launch.prompt));
  }, [bridge, launch, status, firstOutputSeen, preflightDone, readiness]);

  return (
    <div className="flex h-full w-full flex-col">
      {status === 'running' && readiness ? (
        <ClaudeReadinessBanner
          readiness={readiness}
          bridge={bridge}
          onDismiss={() => setReadiness(null)}
        />
      ) : null}
      <div ref={containerRef} data-terminal-status={status} className="min-h-0 flex-1" />
      {status === 'exited' && exitInfo ? (
        <TerminalExitNotice info={exitInfo} onRestart={onRestart} />
      ) : null}
      {status === 'no-project' || status === 'not-consented' ? (
        <TerminalRefusalNotice reason={status} onClose={onClose} />
      ) : null}
    </div>
  );
}
