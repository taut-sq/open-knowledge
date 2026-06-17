
import type { SendableWebContents } from '../shared/ipc-send.ts';
import type { PtyHostIncomingMessage, PtyHostOutgoingMessage } from '../utility/pty-host.ts';

export interface PtyUtilityLike {
  postMessage(message: PtyHostIncomingMessage): void;
  on(event: 'message', cb: (message: unknown) => void): void;
  on(event: 'exit', cb: (code: number | null) => void): void;
  kill(signal?: NodeJS.Signals): boolean;
}

type TimerToken = unknown;

export interface TerminalManagerDeps {
  forkPtyHost: () => PtyUtilityLike;
  sendData: (webContents: SendableWebContents, payload: { ptyId: string; data: string }) => void;
  sendExit: (
    webContents: SendableWebContents,
    payload: { ptyId: string; exitCode: number; signal: number | null; error?: string },
  ) => void;
  newPtyId: () => string;
  setTimer: (cb: () => void, ms: number) => TimerToken;
  clearTimer: (token: TimerToken) => void;
  coalesceMs?: number;
  highWaterBytes?: number;
  lowWaterBytes?: number;
  logger?: { warn: (o: Record<string, unknown>) => void };
  recordShellExit?: (info: { crashed: boolean }) => void;
  recordTerminalSession?: () => void;
}

interface TerminalCreateRequest {
  windowId: number;
  webContents: SendableWebContents;
  projectRoot: string | null;
  cols: number;
  rows: number;
}

interface TerminalAddressedRequest {
  windowId: number;
  ptyId: string;
}

type CreateResult =
  | { readonly ok: true; readonly ptyId: string }
  | { readonly ok: false; readonly reason: 'no-project' | 'not-consented' };

interface PtyWindowHandle {
  webContents: SendableWebContents;
  utility: PtyUtilityLike;
  ptyId: string | null;
  outbound: string;
  flushToken: TimerToken | null;
  pendingBytes: number;
  paused: boolean;
  commandRan: boolean;
}

const DEFAULT_COALESCE_MS = 12;
const DEFAULT_HIGH_WATER = 1024 * 1024;
const DEFAULT_LOW_WATER = 256 * 1024;

export const DEFAULT_PTY_COLS = 80;
export const DEFAULT_PTY_ROWS = 24;
const MAX_PTY_DIMENSION = 1000;

export function clampPtyDimension(value: unknown, fallback: number): number {
  return typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= MAX_PTY_DIMENSION
    ? value
    : fallback;
}

function containsCommandSubmit(data: string): boolean {
  return data.includes('\r') || data.includes('\n');
}

export interface TerminalManager {
  create(req: TerminalCreateRequest): CreateResult;
  input(req: TerminalAddressedRequest & { data: string }): void;
  resize(req: TerminalAddressedRequest & { cols: number; rows: number }): void;
  kill(req: TerminalAddressedRequest): void;
  drain(req: TerminalAddressedRequest & { bytes: number }): void;
  killForWindow(windowId: number): void;
  killAll(): void;
}

export function createTerminalManager(deps: TerminalManagerDeps): TerminalManager {
  const coalesceMs = deps.coalesceMs ?? DEFAULT_COALESCE_MS;
  const highWater = deps.highWaterBytes ?? DEFAULT_HIGH_WATER;
  const lowWater = deps.lowWaterBytes ?? DEFAULT_LOW_WATER;
  const handles = new Map<number, PtyWindowHandle>();

  /** Kill a host without letting a throw abort a multi-window reap loop. The
   *  utilityProcess may already be gone (TOCTOU) so `kill()` can throw; mirrors
   *  pty-host's `safeKill`. */
  function safeKillUtility(handle: PtyWindowHandle): void {
    try {
      handle.utility.kill();
    } catch {
    }
  }

  function pushData(handle: PtyWindowHandle, ptyId: string, data: string): void {
    if (handle.webContents.isDestroyed?.()) return;
    deps.sendData(handle.webContents, { ptyId, data });
  }

  function pushExit(
    handle: PtyWindowHandle,
    payload: { ptyId: string; exitCode: number; signal: number | null; error?: string },
  ): void {
    if (handle.webContents.isDestroyed?.()) return;
    deps.sendExit(handle.webContents, payload);
  }

  function flush(windowId: number): void {
    const handle = handles.get(windowId);
    if (!handle) return;
    handle.flushToken = null;
    if (handle.webContents.isDestroyed?.()) return;
    if (handle.outbound.length === 0 || handle.ptyId === null) return;
    const chunk = handle.outbound;
    handle.outbound = '';
    pushData(handle, handle.ptyId, chunk);
    handle.pendingBytes += chunk.length;
    if (!handle.paused && handle.pendingBytes > highWater) {
      handle.utility.postMessage({ type: 'pause', ptyId: handle.ptyId });
      handle.paused = true;
    }
  }

  function scheduleFlush(windowId: number, handle: PtyWindowHandle): void {
    if (handle.flushToken !== null) return;
    handle.flushToken = deps.setTimer(() => flush(windowId), coalesceMs);
  }

  function clearFlush(handle: PtyWindowHandle): void {
    if (handle.flushToken !== null) {
      deps.clearTimer(handle.flushToken);
      handle.flushToken = null;
    }
  }

  function asHostMessage(raw: unknown): PtyHostOutgoingMessage | null {
    if (typeof raw !== 'object' || raw === null) return null;
    const m = raw as Record<string, unknown>;
    if (typeof m.ptyId !== 'string' || m.ptyId.length === 0) return null;
    switch (m.type) {
      case 'data':
        return typeof m.data === 'string' ? (raw as PtyHostOutgoingMessage) : null;
      case 'exit':
        return typeof m.exitCode === 'number' && (m.signal === null || typeof m.signal === 'number')
          ? (raw as PtyHostOutgoingMessage)
          : null;
      case 'spawn-error':
        return typeof m.message === 'string' ? (raw as PtyHostOutgoingMessage) : null;
      default:
        return null;
    }
  }

  function onUtilityMessage(windowId: number, raw: unknown): void {
    const handle = handles.get(windowId);
    if (!handle) return;
    const message = asHostMessage(raw);
    if (!message) {
      deps.logger?.warn({ event: 'pty-host-unexpected-message', windowId });
      return;
    }
    if (handle.ptyId === null || message.ptyId !== handle.ptyId) return;

    switch (message.type) {
      case 'data':
        handle.outbound += message.data;
        scheduleFlush(windowId, handle);
        break;
      case 'exit': {
        clearFlush(handle);
        flush(windowId);
        const { ptyId } = message;
        maybeRecordSession(handle);
        resetPty(handle);
        deps.recordShellExit?.({ crashed: false });
        pushExit(handle, {
          ptyId,
          exitCode: message.exitCode,
          signal: message.signal,
        });
        break;
      }
      case 'spawn-error': {
        const { ptyId } = message;
        resetPty(handle);
        deps.recordShellExit?.({ crashed: true });
        pushExit(handle, { ptyId, exitCode: 1, signal: null, error: message.message });
        break;
      }
    }
  }

  function onUtilityExit(windowId: number, code: number | null): void {
    const handle = handles.get(windowId);
    if (!handle) return;
    const ptyId = handle.ptyId;
    clearFlush(handle);
    handles.delete(windowId);
    if (ptyId !== null) {
      maybeRecordSession(handle);
      deps.recordShellExit?.({ crashed: true });
      pushExit(handle, {
        ptyId,
        exitCode: code ?? 1,
        signal: null,
        error: 'terminal host exited',
      });
    }
  }

  function resetPty(handle: PtyWindowHandle): void {
    handle.ptyId = null;
    handle.outbound = '';
    handle.pendingBytes = 0;
    handle.paused = false;
    handle.commandRan = false;
  }

  function maybeRecordSession(handle: PtyWindowHandle): void {
    if (!handle.commandRan) return;
    handle.commandRan = false;
    deps.recordTerminalSession?.();
  }

  function ensureHandle(req: TerminalCreateRequest): PtyWindowHandle {
    const existing = handles.get(req.windowId);
    if (existing) {
      existing.webContents = req.webContents;
      return existing;
    }
    const utility = deps.forkPtyHost();
    const handle: PtyWindowHandle = {
      webContents: req.webContents,
      utility,
      ptyId: null,
      outbound: '',
      flushToken: null,
      pendingBytes: 0,
      paused: false,
      commandRan: false,
    };
    handles.set(req.windowId, handle);
    utility.on('message', (raw) => onUtilityMessage(req.windowId, raw));
    utility.on('exit', (code) => onUtilityExit(req.windowId, code));
    return handle;
  }

  return {
    create(req): CreateResult {
      if (req.projectRoot === null) return { ok: false, reason: 'no-project' };
      const handle = ensureHandle(req);
      const ptyId = deps.newPtyId();
      clearFlush(handle);
      resetPty(handle);
      handle.ptyId = ptyId;
      handle.utility.postMessage({
        type: 'create',
        ptyId,
        cwd: req.projectRoot,
        cols: req.cols,
        rows: req.rows,
      });
      return { ok: true, ptyId };
    },

    input(req): void {
      const handle = handles.get(req.windowId);
      if (!handle || handle.ptyId !== req.ptyId) return;
      if (!handle.commandRan && containsCommandSubmit(req.data)) handle.commandRan = true;
      handle.utility.postMessage({ type: 'input', ptyId: req.ptyId, data: req.data });
    },

    resize(req): void {
      const handle = handles.get(req.windowId);
      if (!handle || handle.ptyId !== req.ptyId) return;
      handle.utility.postMessage({
        type: 'resize',
        ptyId: req.ptyId,
        cols: req.cols,
        rows: req.rows,
      });
    },

    kill(req): void {
      const handle = handles.get(req.windowId);
      if (!handle || handle.ptyId !== req.ptyId) return;
      handle.utility.postMessage({ type: 'kill', ptyId: req.ptyId });
    },

    drain(req): void {
      const handle = handles.get(req.windowId);
      if (!handle || handle.ptyId !== req.ptyId) return;
      handle.pendingBytes = Math.max(0, handle.pendingBytes - req.bytes);
      if (handle.paused && handle.pendingBytes < lowWater) {
        handle.utility.postMessage({ type: 'resume', ptyId: req.ptyId });
        handle.paused = false;
      }
    },

    killForWindow(windowId): void {
      const handle = handles.get(windowId);
      if (!handle) return;
      clearFlush(handle);
      maybeRecordSession(handle);
      handles.delete(windowId);
      safeKillUtility(handle);
    },

    killAll(): void {
      for (const handle of handles.values()) {
        clearFlush(handle);
        maybeRecordSession(handle);
        safeKillUtility(handle);
      }
      handles.clear();
    },
  };
}
