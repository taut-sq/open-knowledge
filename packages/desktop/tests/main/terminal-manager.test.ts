import { describe, expect, test } from 'bun:test';
import {
  clampPtyDimension,
  createTerminalManager,
  DEFAULT_PTY_COLS,
  DEFAULT_PTY_ROWS,
  type PtyUtilityLike,
  type TerminalManagerDeps,
} from '../../src/main/terminal-manager.ts';
import type { SendableWebContents } from '../../src/shared/ipc-send.ts';
import type { PtyHostIncomingMessage } from '../../src/utility/pty-host.ts';


class FakeUtility {
  posted: PtyHostIncomingMessage[] = [];
  killed = 0;
  private msgCb: ((raw: unknown) => void) | null = null;
  private exitCb: ((code: number | null) => void) | null = null;
  postMessage(m: PtyHostIncomingMessage): void {
    this.posted.push(m);
  }
  on(event: 'message' | 'exit', cb: (arg: never) => void): void {
    if (event === 'message') this.msgCb = cb as (raw: unknown) => void;
    else this.exitCb = cb as (code: number | null) => void;
  }
  kill(): boolean {
    this.killed += 1;
    return true;
  }
  emitMessage(raw: unknown): void {
    this.msgCb?.(raw);
  }
  emitExit(code: number | null): void {
    this.exitCb?.(code);
  }
}

interface FakeWebContents extends SendableWebContents {
  destroyed: boolean;
}
function makeWebContents(): FakeWebContents {
  const wc: FakeWebContents = {
    destroyed: false,
    send() {},
    isDestroyed() {
      return wc.destroyed;
    },
  };
  return wc;
}

interface SentRecord {
  channel: string;
  payload: Record<string, unknown>;
}

function makeManager(over?: Partial<TerminalManagerDeps>) {
  const sent: SentRecord[] = [];
  const forked: FakeUtility[] = [];
  const timers: Array<(() => void) | null> = [];
  const warns: Array<Record<string, unknown>> = [];
  let idn = 0;
  const mgr = createTerminalManager({
    forkPtyHost: () => {
      const u = new FakeUtility();
      forked.push(u);
      return u as unknown as PtyUtilityLike;
    },
    sendData: (_wc, payload) => {
      sent.push({ channel: 'ok:pty:data', payload: payload as unknown as Record<string, unknown> });
    },
    sendExit: (_wc, payload) => {
      sent.push({ channel: 'ok:pty:exit', payload: payload as unknown as Record<string, unknown> });
    },
    newPtyId: () => `pty-${++idn}`,
    setTimer: (cb) => {
      timers.push(cb);
      return timers.length - 1;
    },
    clearTimer: (t) => {
      if (typeof t === 'number') timers[t] = null;
    },
    coalesceMs: 12,
    highWaterBytes: 100,
    lowWaterBytes: 20,
    logger: { warn: (o) => warns.push(o) },
    ...over,
  });
  const runTimers = (): void => {
    const snapshot = timers.slice();
    for (let i = 0; i < snapshot.length; i += 1) {
      const cb = snapshot[i];
      if (cb) {
        timers[i] = null;
        cb();
      }
    }
  };
  const dataPayloads = (): string[] =>
    sent.filter((s) => s.channel === 'ok:pty:data').map((s) => s.payload.data as string);
  const exits = (): Array<Record<string, unknown>> =>
    sent.filter((s) => s.channel === 'ok:pty:exit').map((s) => s.payload);
  return { mgr, sent, forked, warns, runTimers, dataPayloads, exits };
}

const PROJECT = '/Users/me/project';

describe('createTerminalManager — create', () => {
  test('forks a host, posts create at the project root, returns the ptyId', () => {
    const h = makeManager();
    const wc = makeWebContents();
    const r = h.mgr.create({
      windowId: 1,
      webContents: wc,
      projectRoot: PROJECT,
      cols: 80,
      rows: 24,
    });
    expect(r).toEqual({ ok: true, ptyId: 'pty-1' });
    expect(h.forked).toHaveLength(1);
    expect(h.forked[0]?.posted).toEqual([
      { type: 'create', ptyId: 'pty-1', cwd: PROJECT, cols: 80, rows: 24 },
    ]);
  });

  test('a window with no project root gets no terminal and no fork', () => {
    const h = makeManager();
    const r = h.mgr.create({
      windowId: 1,
      webContents: makeWebContents(),
      projectRoot: null,
      cols: 80,
      rows: 24,
    });
    expect(r).toEqual({ ok: false, reason: 'no-project' });
    expect(h.forked).toHaveLength(0);
  });

  test('a second create for the same window reuses the host with a fresh ptyId', () => {
    const h = makeManager();
    const wc = makeWebContents();
    h.mgr.create({ windowId: 1, webContents: wc, projectRoot: PROJECT, cols: 80, rows: 24 });
    const r2 = h.mgr.create({
      windowId: 1,
      webContents: wc,
      projectRoot: PROJECT,
      cols: 100,
      rows: 30,
    });
    expect(r2).toEqual({ ok: true, ptyId: 'pty-2' });
    expect(h.forked).toHaveLength(1);
    expect(h.forked[0]?.posted).toContainEqual({
      type: 'create',
      ptyId: 'pty-2',
      cwd: PROJECT,
      cols: 100,
      rows: 30,
    });
  });

  test('separate windows each fork their own host', () => {
    const h = makeManager();
    h.mgr.create({
      windowId: 1,
      webContents: makeWebContents(),
      projectRoot: PROJECT,
      cols: 80,
      rows: 24,
    });
    h.mgr.create({
      windowId: 2,
      webContents: makeWebContents(),
      projectRoot: PROJECT,
      cols: 80,
      rows: 24,
    });
    expect(h.forked).toHaveLength(2);
  });
});

describe('createTerminalManager — addressing', () => {
  function setup() {
    const h = makeManager();
    const wc = makeWebContents();
    h.mgr.create({ windowId: 1, webContents: wc, projectRoot: PROJECT, cols: 80, rows: 24 });
    return h;
  }

  test('routes input/resize/kill to the host for the live ptyId', () => {
    const h = setup();
    h.mgr.input({ windowId: 1, ptyId: 'pty-1', data: 'ls -la\r' });
    h.mgr.resize({ windowId: 1, ptyId: 'pty-1', cols: 120, rows: 40 });
    h.mgr.kill({ windowId: 1, ptyId: 'pty-1' });
    const posted = h.forked[0]?.posted ?? [];
    expect(posted).toContainEqual({ type: 'input', ptyId: 'pty-1', data: 'ls -la\r' });
    expect(posted).toContainEqual({ type: 'resize', ptyId: 'pty-1', cols: 120, rows: 40 });
    expect(posted).toContainEqual({ type: 'kill', ptyId: 'pty-1' });
  });

  test('drops input for a stale ptyId (a superseded renderer cannot drive the live shell)', () => {
    const h = setup();
    const before = h.forked[0]?.posted.length ?? 0;
    h.mgr.input({ windowId: 1, ptyId: 'pty-OLD', data: 'rm -rf /\r' });
    expect(h.forked[0]?.posted.length).toBe(before);
  });

  test('drops input for an unknown window', () => {
    const h = setup();
    const before = h.forked[0]?.posted.length ?? 0;
    h.mgr.input({ windowId: 999, ptyId: 'pty-1', data: 'x' });
    expect(h.forked[0]?.posted.length).toBe(before);
  });
});

describe('createTerminalManager — coalescing + UTF-8 integrity', () => {
  test('batches multiple host reads into one push on the timer tick', () => {
    const h = makeManager();
    h.mgr.create({
      windowId: 1,
      webContents: makeWebContents(),
      projectRoot: PROJECT,
      cols: 80,
      rows: 24,
    });
    h.forked[0]?.emitMessage({ type: 'data', ptyId: 'pty-1', data: 'a' });
    h.forked[0]?.emitMessage({ type: 'data', ptyId: 'pty-1', data: 'b' });
    h.forked[0]?.emitMessage({ type: 'data', ptyId: 'pty-1', data: 'c' });
    expect(h.dataPayloads()).toEqual([]); // buffered until the tick
    h.runTimers();
    expect(h.dataPayloads()).toEqual(['abc']);
  });

  test('concatenating whole reads preserves multibyte UTF-8 across the coalesce boundary', () => {
    const h = makeManager();
    h.mgr.create({
      windowId: 1,
      webContents: makeWebContents(),
      projectRoot: PROJECT,
      cols: 80,
      rows: 24,
    });
    h.forked[0]?.emitMessage({ type: 'data', ptyId: 'pty-1', data: '日本' });
    h.forked[0]?.emitMessage({ type: 'data', ptyId: 'pty-1', data: '語 €' });
    h.forked[0]?.emitMessage({ type: 'data', ptyId: 'pty-1', data: ' 🚀' });
    h.runTimers();
    expect(h.dataPayloads()).toEqual(['日本語 € 🚀']);
  });

  test('drops host data tagged with a superseded ptyId', () => {
    const h = makeManager();
    h.mgr.create({
      windowId: 1,
      webContents: makeWebContents(),
      projectRoot: PROJECT,
      cols: 80,
      rows: 24,
    });
    h.forked[0]?.emitMessage({ type: 'data', ptyId: 'pty-OLD', data: 'ghost' });
    h.runTimers();
    expect(h.dataPayloads()).toEqual([]);
  });
});

describe('createTerminalManager — exit + crash surfacing', () => {
  test('flushes buffered output before the exit state, then clears the pty', () => {
    const h = makeManager();
    h.mgr.create({
      windowId: 1,
      webContents: makeWebContents(),
      projectRoot: PROJECT,
      cols: 80,
      rows: 24,
    });
    h.forked[0]?.emitMessage({ type: 'data', ptyId: 'pty-1', data: 'goodbye' });
    h.forked[0]?.emitMessage({ type: 'exit', ptyId: 'pty-1', exitCode: 0, signal: null });
    expect(h.sent.map((s) => s.channel)).toEqual(['ok:pty:data', 'ok:pty:exit']);
    expect(h.exits()[0]).toEqual({ ptyId: 'pty-1', exitCode: 0, signal: null });
    const before = h.forked[0]?.posted.length ?? 0;
    h.mgr.input({ windowId: 1, ptyId: 'pty-1', data: 'x' });
    expect(h.forked[0]?.posted.length).toBe(before);
  });

  test('passes a crash signal through on the exit payload', () => {
    const h = makeManager();
    h.mgr.create({
      windowId: 1,
      webContents: makeWebContents(),
      projectRoot: PROJECT,
      cols: 80,
      rows: 24,
    });
    h.forked[0]?.emitMessage({ type: 'exit', ptyId: 'pty-1', exitCode: 0, signal: 9 });
    expect(h.exits()[0]).toEqual({ ptyId: 'pty-1', exitCode: 0, signal: 9 });
  });

  test('maps a host spawn-error to a crashed exit carrying the message', () => {
    const h = makeManager();
    h.mgr.create({
      windowId: 1,
      webContents: makeWebContents(),
      projectRoot: PROJECT,
      cols: 80,
      rows: 24,
    });
    h.forked[0]?.emitMessage({
      type: 'spawn-error',
      ptyId: 'pty-1',
      message: 'EMFILE: too many open files',
    });
    expect(h.exits()[0]).toEqual({
      ptyId: 'pty-1',
      exitCode: 1,
      signal: null,
      error: 'EMFILE: too many open files',
    });
  });

  test('surfaces a utilityProcess crash as an exit and drops the dead host', () => {
    const h = makeManager();
    h.mgr.create({
      windowId: 1,
      webContents: makeWebContents(),
      projectRoot: PROJECT,
      cols: 80,
      rows: 24,
    });
    h.forked[0]?.emitExit(1);
    expect(h.exits()[0]).toEqual({
      ptyId: 'pty-1',
      exitCode: 1,
      signal: null,
      error: 'terminal host exited',
    });
    h.mgr.create({
      windowId: 1,
      webContents: makeWebContents(),
      projectRoot: PROJECT,
      cols: 80,
      rows: 24,
    });
    expect(h.forked).toHaveLength(2);
  });

  test('ignores a malformed host message without crashing or sending', () => {
    const h = makeManager();
    h.mgr.create({
      windowId: 1,
      webContents: makeWebContents(),
      projectRoot: PROJECT,
      cols: 80,
      rows: 24,
    });
    expect(() => {
      h.forked[0]?.emitMessage({ type: 'bogus' });
      h.forked[0]?.emitMessage(null);
      h.forked[0]?.emitMessage('not an object');
      h.forked[0]?.emitMessage({ ptyId: 'pty-1' });
    }).not.toThrow();
    h.runTimers();
    expect(h.sent).toEqual([]);
    expect(h.warns.length).toBeGreaterThan(0);
  });
});

describe('createTerminalManager — backpressure', () => {
  test('pauses the host when in-flight bytes cross the high-water mark', () => {
    const h = makeManager({ highWaterBytes: 100, lowWaterBytes: 20 });
    h.mgr.create({
      windowId: 1,
      webContents: makeWebContents(),
      projectRoot: PROJECT,
      cols: 80,
      rows: 24,
    });
    h.forked[0]?.emitMessage({ type: 'data', ptyId: 'pty-1', data: 'x'.repeat(150) });
    h.runTimers();
    expect(h.forked[0]?.posted).toContainEqual({ type: 'pause', ptyId: 'pty-1' });
  });

  test('resumes only once drain acks bring in-flight back under the low-water mark', () => {
    const h = makeManager({ highWaterBytes: 100, lowWaterBytes: 20 });
    h.mgr.create({
      windowId: 1,
      webContents: makeWebContents(),
      projectRoot: PROJECT,
      cols: 80,
      rows: 24,
    });
    h.forked[0]?.emitMessage({ type: 'data', ptyId: 'pty-1', data: 'x'.repeat(150) });
    h.runTimers();
    h.mgr.drain({ windowId: 1, ptyId: 'pty-1', bytes: 130 }); // 150 - 130 = 20, not < 20
    expect(h.forked[0]?.posted).not.toContainEqual({ type: 'resume', ptyId: 'pty-1' });
    h.mgr.drain({ windowId: 1, ptyId: 'pty-1', bytes: 5 }); // 15 < 20
    expect(h.forked[0]?.posted).toContainEqual({ type: 'resume', ptyId: 'pty-1' });
  });

  test('does not resume a host that was never paused', () => {
    const h = makeManager({ highWaterBytes: 100, lowWaterBytes: 20 });
    h.mgr.create({
      windowId: 1,
      webContents: makeWebContents(),
      projectRoot: PROJECT,
      cols: 80,
      rows: 24,
    });
    h.forked[0]?.emitMessage({ type: 'data', ptyId: 'pty-1', data: 'x'.repeat(10) });
    h.runTimers();
    h.mgr.drain({ windowId: 1, ptyId: 'pty-1', bytes: 10 });
    expect(h.forked[0]?.posted).not.toContainEqual({ type: 'resume', ptyId: 'pty-1' });
  });

  test('drain for a stale ptyId is ignored', () => {
    const h = makeManager({ highWaterBytes: 100, lowWaterBytes: 20 });
    h.mgr.create({
      windowId: 1,
      webContents: makeWebContents(),
      projectRoot: PROJECT,
      cols: 80,
      rows: 24,
    });
    h.forked[0]?.emitMessage({ type: 'data', ptyId: 'pty-1', data: 'x'.repeat(150) });
    h.runTimers();
    h.mgr.drain({ windowId: 1, ptyId: 'pty-OLD', bytes: 200 });
    expect(h.forked[0]?.posted).not.toContainEqual({ type: 'resume', ptyId: 'pty-1' });
  });
});

describe('createTerminalManager — destroyed-window guard', () => {
  test('skips data + exit pushes once the window is destroyed', () => {
    const h = makeManager();
    const wc = makeWebContents();
    h.mgr.create({ windowId: 1, webContents: wc, projectRoot: PROJECT, cols: 80, rows: 24 });
    wc.destroyed = true;
    h.forked[0]?.emitMessage({ type: 'data', ptyId: 'pty-1', data: 'late' });
    h.runTimers();
    h.forked[0]?.emitMessage({ type: 'exit', ptyId: 'pty-1', exitCode: 0, signal: null });
    expect(h.sent).toEqual([]);
  });
});

describe('createTerminalManager — lifecycle reap (US-005 hooks)', () => {
  test('killForWindow kills the host, deletes it, and silences its exit event', () => {
    const h = makeManager();
    h.mgr.create({
      windowId: 1,
      webContents: makeWebContents(),
      projectRoot: PROJECT,
      cols: 80,
      rows: 24,
    });
    const utility = h.forked[0];
    h.mgr.killForWindow(1);
    expect(utility?.killed).toBe(1);
    utility?.emitExit(0);
    expect(h.exits()).toEqual([]);
    h.mgr.create({
      windowId: 1,
      webContents: makeWebContents(),
      projectRoot: PROJECT,
      cols: 80,
      rows: 24,
    });
    expect(h.forked).toHaveLength(2);
  });

  test('killForWindow on an unknown window is a no-op', () => {
    const h = makeManager();
    expect(() => h.mgr.killForWindow(42)).not.toThrow();
  });

  test('killAll reaps every window host', () => {
    const h = makeManager();
    h.mgr.create({
      windowId: 1,
      webContents: makeWebContents(),
      projectRoot: PROJECT,
      cols: 80,
      rows: 24,
    });
    h.mgr.create({
      windowId: 2,
      webContents: makeWebContents(),
      projectRoot: PROJECT,
      cols: 80,
      rows: 24,
    });
    h.mgr.killAll();
    expect(h.forked[0]?.killed).toBe(1);
    expect(h.forked[1]?.killed).toBe(1);
    h.mgr.create({
      windowId: 1,
      webContents: makeWebContents(),
      projectRoot: PROJECT,
      cols: 80,
      rows: 24,
    });
    expect(h.forked).toHaveLength(3);
  });

  test('killAll completes the reap even when one host throws on kill (no orphans)', () => {
    const forked: ThrowingUtility[] = [];
    let idn = 0;
    const mgr = createTerminalManager({
      forkPtyHost: () => {
        const u = new ThrowingUtility(forked.length === 0);
        forked.push(u);
        return u as unknown as PtyUtilityLike;
      },
      sendData: () => {},
      sendExit: () => {},
      newPtyId: () => `pty-${++idn}`,
      setTimer: () => 0,
      clearTimer: () => {},
    });
    for (const windowId of [1, 2, 3]) {
      mgr.create({
        windowId,
        webContents: makeWebContents(),
        projectRoot: PROJECT,
        cols: 80,
        rows: 24,
      });
    }

    expect(() => mgr.killAll()).not.toThrow();
    expect(forked.map((u) => u.killAttempts)).toEqual([1, 1, 1]);
  });

  test('killForWindow swallows a throwing kill instead of crashing the reap', () => {
    const forked: ThrowingUtility[] = [];
    let idn = 0;
    const mgr = createTerminalManager({
      forkPtyHost: () => {
        const u = new ThrowingUtility(true);
        forked.push(u);
        return u as unknown as PtyUtilityLike;
      },
      sendData: () => {},
      sendExit: () => {},
      newPtyId: () => `pty-${++idn}`,
      setTimer: () => 0,
      clearTimer: () => {},
    });
    mgr.create({
      windowId: 1,
      webContents: makeWebContents(),
      projectRoot: PROJECT,
      cols: 80,
      rows: 24,
    });
    expect(() => mgr.killForWindow(1)).not.toThrow();
    expect(forked[0]?.killAttempts).toBe(1);
  });
});

class ThrowingUtility {
  killAttempts = 0;
  constructor(private readonly throwsOnKill: boolean) {}
  postMessage(): void {}
  on(): void {}
  kill(): boolean {
    this.killAttempts += 1;
    if (this.throwsOnKill) throw new Error('host already gone');
    return true;
  }
}

describe('createTerminalManager — telemetry (US-013)', () => {
  function makeTelemetryManager() {
    const shellExits: Array<{ crashed: boolean }> = [];
    const sessions: true[] = [];
    const h = makeManager({
      recordShellExit: (info) => shellExits.push(info),
      recordTerminalSession: () => sessions.push(true),
    });
    const start = (windowId: number): void => {
      h.mgr.create({
        windowId,
        webContents: makeWebContents(),
        projectRoot: PROJECT,
        cols: 80,
        rows: 24,
      });
    };
    return { ...h, shellExits, sessions, start };
  }

  test('a clean shell exit emits a non-crash shell-exit; no session without a command', () => {
    const h = makeTelemetryManager();
    h.start(1);
    h.forked[0]?.emitMessage({ type: 'exit', ptyId: 'pty-1', exitCode: 0, signal: null });
    expect(h.shellExits).toEqual([{ crashed: false }]);
    expect(h.sessions).toEqual([]);
  });

  test('a session with at least one command emits one terminal-session on exit', () => {
    const h = makeTelemetryManager();
    h.start(1);
    h.mgr.input({ windowId: 1, ptyId: 'pty-1', data: 'ls -la\r' });
    h.forked[0]?.emitMessage({ type: 'exit', ptyId: 'pty-1', exitCode: 0, signal: null });
    expect(h.sessions).toHaveLength(1);
    expect(h.shellExits).toEqual([{ crashed: false }]);
  });

  test('keystrokes without a line terminator do not count as a command', () => {
    const h = makeTelemetryManager();
    h.start(1);
    h.mgr.input({ windowId: 1, ptyId: 'pty-1', data: 'ls' });
    h.mgr.input({ windowId: 1, ptyId: 'pty-1', data: ' -la' });
    h.forked[0]?.emitMessage({ type: 'exit', ptyId: 'pty-1', exitCode: 0, signal: null });
    expect(h.sessions).toEqual([]);
  });

  test('a newline-terminated input also counts as a command', () => {
    const h = makeTelemetryManager();
    h.start(1);
    h.mgr.input({ windowId: 1, ptyId: 'pty-1', data: 'pwd\n' });
    h.forked[0]?.emitMessage({ type: 'exit', ptyId: 'pty-1', exitCode: 0, signal: null });
    expect(h.sessions).toHaveLength(1);
  });

  test('a spawn-error emits a crashed shell-exit and no session (the shell never ran)', () => {
    const h = makeTelemetryManager();
    h.start(1);
    h.forked[0]?.emitMessage({ type: 'spawn-error', ptyId: 'pty-1', message: 'EMFILE' });
    expect(h.shellExits).toEqual([{ crashed: true }]);
    expect(h.sessions).toEqual([]);
  });

  test('a host crash emits a crashed shell-exit and counts the session if a command ran', () => {
    const h = makeTelemetryManager();
    h.start(1);
    h.mgr.input({ windowId: 1, ptyId: 'pty-1', data: 'npm test\r' });
    h.forked[0]?.emitExit(1);
    expect(h.shellExits).toEqual([{ crashed: true }]);
    expect(h.sessions).toHaveLength(1);
  });

  test('a window-close reap counts the session but emits no shell-exit', () => {
    const h = makeTelemetryManager();
    h.start(1);
    h.mgr.input({ windowId: 1, ptyId: 'pty-1', data: 'git status\r' });
    h.mgr.killForWindow(1);
    expect(h.sessions).toHaveLength(1);
    expect(h.shellExits).toEqual([]);
  });

  test('a window-close reap with no command run emits neither signal', () => {
    const h = makeTelemetryManager();
    h.start(1);
    h.mgr.killForWindow(1);
    expect(h.sessions).toEqual([]);
    expect(h.shellExits).toEqual([]);
  });

  test('killAll counts only the windows that ran a command', () => {
    const h = makeTelemetryManager();
    h.start(1);
    h.start(2);
    h.mgr.input({ windowId: 1, ptyId: 'pty-1', data: 'build\r' });
    h.mgr.killAll();
    expect(h.sessions).toHaveLength(1);
    expect(h.shellExits).toEqual([]);
  });

  test('each PTY lifecycle is one session: a post-restart shell with no command is not counted', () => {
    const h = makeTelemetryManager();
    h.start(1);
    h.mgr.input({ windowId: 1, ptyId: 'pty-1', data: 'first\r' });
    h.forked[0]?.emitMessage({ type: 'exit', ptyId: 'pty-1', exitCode: 0, signal: null });
    h.start(1);
    h.forked[0]?.emitMessage({ type: 'exit', ptyId: 'pty-2', exitCode: 0, signal: null });
    expect(h.sessions).toHaveLength(1);
    expect(h.shellExits).toEqual([{ crashed: false }, { crashed: false }]);
  });
});

describe('clampPtyDimension', () => {
  test('passes a valid in-range integer through', () => {
    expect(clampPtyDimension(80, DEFAULT_PTY_COLS)).toBe(80);
    expect(clampPtyDimension(1, DEFAULT_PTY_ROWS)).toBe(1);
    expect(clampPtyDimension(1000, DEFAULT_PTY_COLS)).toBe(1000);
  });

  test('falls back for NaN, zero, negative, non-integer, and over-range values', () => {
    expect(clampPtyDimension(Number.NaN, DEFAULT_PTY_COLS)).toBe(DEFAULT_PTY_COLS);
    expect(clampPtyDimension(0, DEFAULT_PTY_COLS)).toBe(DEFAULT_PTY_COLS);
    expect(clampPtyDimension(-5, DEFAULT_PTY_ROWS)).toBe(DEFAULT_PTY_ROWS);
    expect(clampPtyDimension(40.5, DEFAULT_PTY_ROWS)).toBe(DEFAULT_PTY_ROWS);
    expect(clampPtyDimension(5_000_000, DEFAULT_PTY_COLS)).toBe(DEFAULT_PTY_COLS);
  });

  test('falls back for non-number inputs (a malformed renderer payload)', () => {
    expect(clampPtyDimension('80', DEFAULT_PTY_COLS)).toBe(DEFAULT_PTY_COLS);
    expect(clampPtyDimension(undefined, DEFAULT_PTY_ROWS)).toBe(DEFAULT_PTY_ROWS);
    expect(clampPtyDimension(null, DEFAULT_PTY_COLS)).toBe(DEFAULT_PTY_COLS);
  });
});
