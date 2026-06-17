
const DARWIN_FALLBACK_SHELL = '/bin/zsh';

const STRIPPED_ENV_MARKERS = ['OK_ELECTRON_PROTOCOL_HOST', 'OK_LOCK_KIND'] as const;

export interface PtyCreateMessage {
  type: 'create';
  ptyId: string;
  cwd: string;
  cols: number;
  rows: number;
  shell?: string;
}
interface PtyInputMessage {
  type: 'input';
  ptyId: string;
  data: string;
}
interface PtyResizeMessage {
  type: 'resize';
  ptyId: string;
  cols: number;
  rows: number;
}
interface PtyKillMessage {
  type: 'kill';
  ptyId: string;
}
interface PtyPauseMessage {
  type: 'pause';
  ptyId: string;
}
interface PtyResumeMessage {
  type: 'resume';
  ptyId: string;
}
export type PtyHostIncomingMessage =
  | PtyCreateMessage
  | PtyInputMessage
  | PtyResizeMessage
  | PtyKillMessage
  | PtyPauseMessage
  | PtyResumeMessage;

interface PtyDataMessage {
  type: 'data';
  ptyId: string;
  data: string;
}
interface PtyExitMessage {
  type: 'exit';
  ptyId: string;
  exitCode: number;
  signal: number | null;
}
interface PtySpawnErrorMessage {
  type: 'spawn-error';
  ptyId: string;
  message: string;
}
export type PtyHostOutgoingMessage = PtyDataMessage | PtyExitMessage | PtySpawnErrorMessage;

export interface PtyProcessLike {
  readonly pid: number;
  onData(listener: (data: string) => void): void;
  onExit(listener: (event: { exitCode: number; signal?: number }) => void): void;
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(signal?: string): void;
  /** Backpressure: stop/restart the underlying PTY-fd socket reads. Main
   *  pauses on a flood (in-flight bytes past the high-water mark) and resumes
   *  once the renderer's drain acks bring it back under the low-water mark. */
  pause(): void;
  resume(): void;
}

export interface PtySpawnOptions {
  name: string;
  cols: number;
  rows: number;
  cwd: string;
  env: Record<string, string>;
  /** Decode the PTY stream as UTF-8 strings; node-pty's StringDecoder keeps
   *  multibyte sequences intact across read boundaries. */
  encoding: 'utf8';
}
export type SpawnPty = (file: string, args: string[], options: PtySpawnOptions) => PtyProcessLike;

interface PtyHostParentPort {
  on(event: 'message', handler: (event: { data: unknown }) => void): void;
  postMessage(value: PtyHostOutgoingMessage): void;
}

export interface SetupPtyHostDeps {
  parentPort: PtyHostParentPort | null;
  spawn: SpawnPty;
  env?: Record<string, string | undefined>;
  logger?: { warn: (o: Record<string, unknown>) => void };
}

function asIncomingMessage(raw: unknown): PtyHostIncomingMessage | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const { type, ptyId } = raw as { type?: unknown; ptyId?: unknown };
  if (typeof type !== 'string') return null;
  if (typeof ptyId !== 'string' || ptyId.length === 0) return null;
  return raw as PtyHostIncomingMessage;
}

export interface PtyHostHandle {
  killActive(): void;
}

export function resolveShell(env: Record<string, string | undefined>, override?: string): string {
  if (override && override.length > 0) return override;
  const shell = env.SHELL;
  return typeof shell === 'string' && shell.length > 0 ? shell : DARWIN_FALLBACK_SHELL;
}

export function buildShellEnv(
  parentEnv: Record<string, string | undefined>,
): Record<string, string> {
  const stripped = new Set<string>(STRIPPED_ENV_MARKERS);
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(parentEnv)) {
    if (value === undefined) continue;
    if (stripped.has(key)) continue;
    out[key] = value;
  }
  return out;
}

export function setupPtyHost(deps: SetupPtyHostDeps): PtyHostHandle {
  const env = deps.env ?? (process.env as Record<string, string | undefined>);
  let active: { ptyId: string; pty: PtyProcessLike } | null = null;

  function post(message: PtyHostOutgoingMessage): void {
    deps.parentPort?.postMessage(message);
  }

  function safeKill(pty: PtyProcessLike): void {
    try {
      pty.kill();
    } catch {
    }
  }

  function handleCreate(message: PtyCreateMessage): void {
    if (active) {
      safeKill(active.pty);
      active = null;
    }
    const shell = resolveShell(env, message.shell);
    const shellEnv = buildShellEnv(env);
    let pty: PtyProcessLike;
    try {
      pty = deps.spawn(shell, ['-l', '-i'], {
        name: 'xterm-256color',
        cols: message.cols,
        rows: message.rows,
        cwd: message.cwd,
        env: shellEnv,
        encoding: 'utf8',
      });
    } catch (err) {
      post({ type: 'spawn-error', ptyId: message.ptyId, message: (err as Error).message });
      return;
    }
    const { ptyId } = message;
    active = { ptyId, pty };
    pty.onData((data) => {
      if (active?.ptyId === ptyId) post({ type: 'data', ptyId, data });
    });
    pty.onExit(({ exitCode, signal }) => {
      if (active?.ptyId === ptyId) active = null;
      post({ type: 'exit', ptyId, exitCode, signal: signal ?? null });
    });
  }

  function handleInput(message: PtyInputMessage): void {
    if (active?.ptyId === message.ptyId) active.pty.write(message.data);
  }

  function handleResize(message: PtyResizeMessage): void {
    if (active?.ptyId === message.ptyId) active.pty.resize(message.cols, message.rows);
  }

  function handleKill(message: PtyKillMessage): void {
    if (active?.ptyId === message.ptyId) safeKill(active.pty);
  }

  function handlePause(message: PtyPauseMessage): void {
    if (active?.ptyId === message.ptyId) active.pty.pause();
  }

  function handleResume(message: PtyResumeMessage): void {
    if (active?.ptyId === message.ptyId) active.pty.resume();
  }

  deps.parentPort?.on('message', (event) => {
    const message = asIncomingMessage(event.data);
    if (!message) {
      deps.logger?.warn({ event: 'pty-host-unexpected-message' });
      return;
    }
    switch (message.type) {
      case 'create':
        handleCreate(message);
        break;
      case 'input':
        handleInput(message);
        break;
      case 'resize':
        handleResize(message);
        break;
      case 'kill':
        handleKill(message);
        break;
      case 'pause':
        handlePause(message);
        break;
      case 'resume':
        handleResume(message);
        break;
      default:
        deps.logger?.warn({
          event: 'pty-host-unexpected-message',
          type: (message as unknown as { type: string }).type,
        });
        break;
    }
  });

  return {
    killActive(): void {
      if (active) {
        safeKill(active.pty);
        active = null;
      }
    },
  };
}

export interface HostReapProcess {
  on(event: 'exit', listener: () => void): void;
  on(event: NodeJS.Signals, listener: () => void): void;
  exit(code?: number): void;
}

const REAP_SIGNALS: readonly NodeJS.Signals[] = ['SIGTERM', 'SIGINT', 'SIGHUP'];

export function installHostReaping(handle: PtyHostHandle, proc: HostReapProcess): void {
  let reaped = false;
  const reap = (): void => {
    if (reaped) return;
    reaped = true;
    handle.killActive();
  };
  proc.on('exit', reap);
  for (const signal of REAP_SIGNALS) {
    proc.on(signal, () => {
      reap();
      proc.exit(0);
    });
  }
}

if ((process as NodeJS.Process & { parentPort?: unknown }).parentPort) {
  const parentPort = (process as NodeJS.Process & { parentPort: PtyHostParentPort }).parentPort;
  void (async () => {
    let spawn: SpawnPty;
    try {
      ({ spawn } = await import('node-pty'));
    } catch (err) {
      const message = (err as Error).message;
      parentPort.on('message', (event) => {
        const msg = asIncomingMessage(event.data);
        if (msg?.type === 'create') {
          parentPort.postMessage({ type: 'spawn-error', ptyId: msg.ptyId, message });
        }
      });
      return;
    }
    const { getLogger } = await import('../main/desktop-logger.ts');
    const log = getLogger('pty-host');
    const handle = setupPtyHost({
      parentPort,
      spawn,
      env: process.env,
      logger: { warn: (o) => log.warn(o, 'unexpected pty-host message') },
    });
    installHostReaping(handle, process);
  })();
}
