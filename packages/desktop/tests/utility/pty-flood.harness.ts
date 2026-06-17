
import { chmodSync, existsSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  createTerminalManager,
  type PtyUtilityLike,
  type TerminalManager,
} from '../../src/main/terminal-manager.ts';
import type { SendableWebContents } from '../../src/shared/ipc-send.ts';
import {
  type PtyHostHandle,
  type PtyHostIncomingMessage,
  type PtyHostOutgoingMessage,
  type SpawnPty,
  setupPtyHost,
} from '../../src/utility/pty-host.ts';

const require = createRequire(import.meta.url);

function ensureSpawnHelperExecutable(): void {
  const pkgDir = dirname(dirname(require.resolve('node-pty')));
  const helper = join(pkgDir, 'prebuilds', `${process.platform}-${process.arch}`, 'spawn-helper');
  if (existsSync(helper)) chmodSync(helper, 0o755);
}

const { spawn } = require('node-pty') as { spawn: SpawnPty };

const UNIT = '日本語🎉αβγ';
const SENTINEL = '__OKFLOOD_42__';
const SENTINEL_CMD = '__OKFLOOD_$((6*7))__';
const PTY_ID = 'flood-pty';
const COALESCE_MS = 12;

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function waitFor(predicate: () => boolean, label: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await sleep(10);
  }
  throw new Error(`timeout waiting for: ${label}`);
}

function countOccurrences(haystack: string, needle: string): number {
  let count = 0;
  let idx = haystack.indexOf(needle);
  while (idx !== -1) {
    count += 1;
    idx = haystack.indexOf(needle, idx + needle.length);
  }
  return count;
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

class InProcessBridge implements PtyUtilityLike {
  pauseCount = 0;
  resumeCount = 0;
  private hostHandler: ((event: { data: unknown }) => void) | null = null;
  private readonly msgSubs: Array<(message: unknown) => void> = [];
  private readonly exitSubs: Array<(code: number | null) => void> = [];
  private readonly hostHandle: PtyHostHandle;

  constructor(spawnPty: SpawnPty, env: Record<string, string | undefined>) {
    this.hostHandle = setupPtyHost({
      parentPort: {
        on: (_event, handler) => {
          this.hostHandler = handler;
        },
        postMessage: (value: PtyHostOutgoingMessage) => {
          for (const sub of this.msgSubs) sub(value);
        },
      },
      spawn: spawnPty,
      env,
    });
  }

  postMessage(message: PtyHostIncomingMessage): void {
    if (message.type === 'pause') this.pauseCount += 1;
    else if (message.type === 'resume') this.resumeCount += 1;
    this.hostHandler?.({ data: message });
  }

  on(event: 'message', cb: (message: unknown) => void): void;
  on(event: 'exit', cb: (code: number | null) => void): void;
  on(event: 'message' | 'exit', cb: (arg: never) => void): void {
    if (event === 'message') this.msgSubs.push(cb as (message: unknown) => void);
    else this.exitSubs.push(cb as (code: number | null) => void);
  }

  kill(): boolean {
    this.reap();
    for (const sub of this.exitSubs) sub(0);
    return true;
  }

  reap(): void {
    this.hostHandle.killActive();
  }
}

interface FloodOptions {
  units: number;
  highWaterBytes: number;
  lowWaterBytes: number;
  drain: 'immediate' | 'metered';
  stallUntilPaused?: boolean;
  meterUnitsPerTick?: number;
  meterTickMs?: number;
  heartbeat?: boolean;
}

interface FloodMetrics {
  units: number;
  receivedUnitCount: number;
  hasReplacementChar: boolean;
  totalPushedCodeUnits: number;
  pushCount: number;
  maxInFlight: number;
  pauseCount: number;
  resumeCount: number;
  maxHeartbeatGapMs: number;
  heartbeats: number;
  floodMs: number;
}

async function runFloodScenario(opts: FloodOptions): Promise<FloodMetrics> {
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'ok-pty-flood-')));
  const file = join(tmp, 'flood.txt');
  writeFileSync(file, UNIT.repeat(opts.units), 'utf8');

  const bridge = new InProcessBridge(spawn, { ...process.env });

  const chunks: string[] = [];
  let totalPushed = 0;
  let totalAcked = 0;
  let pushCount = 0;
  let maxInFlight = 0;
  let tail = '';
  let sawSentinel = false;
  let drainEnabled = opts.drain === 'immediate';

  const webContents: SendableWebContents = { send: () => {}, isDestroyed: () => false };

  let manager!: TerminalManager;
  const ackBytes = (n: number): void => {
    totalAcked += n;
    manager.drain({ windowId: 1, ptyId: PTY_ID, bytes: n });
  };

  manager = createTerminalManager({
    forkPtyHost: () => bridge,
    sendData: (_wc, payload) => {
      chunks.push(payload.data);
      totalPushed += payload.data.length;
      pushCount += 1;
      const inFlight = totalPushed - totalAcked;
      if (inFlight > maxInFlight) maxInFlight = inFlight;
      tail = (tail + payload.data).slice(-256);
      if (!sawSentinel && tail.includes(SENTINEL)) sawSentinel = true;
      if (opts.drain === 'immediate' && drainEnabled) {
        const n = payload.data.length;
        queueMicrotask(() => ackBytes(n));
      }
    },
    sendExit: () => {},
    newPtyId: () => PTY_ID,
    setTimer: (cb, ms) => setTimeout(cb, ms),
    clearTimer: (t) => clearTimeout(t as ReturnType<typeof setTimeout>),
    coalesceMs: COALESCE_MS,
    highWaterBytes: opts.highWaterBytes,
    lowWaterBytes: opts.lowWaterBytes,
  });

  let lastBeat = 0;
  let maxGap = 0;
  let beats = 0;
  let measuring = false;
  const heartbeat = opts.heartbeat
    ? setInterval(() => {
        const now = Date.now();
        if (measuring && lastBeat > 0) {
          const gap = now - lastBeat;
          if (gap > maxGap) maxGap = gap;
          beats += 1;
        }
        lastBeat = now;
      }, 10)
    : null;

  const meterUnits = opts.meterUnitsPerTick ?? 262144;
  const meterMs = opts.meterTickMs ?? 20;
  const pump =
    opts.drain === 'metered'
      ? setInterval(() => {
          if (!drainEnabled) return;
          const available = totalPushed - totalAcked;
          if (available <= 0) return;
          ackBytes(Math.min(meterUnits, available));
        }, meterMs)
      : null;

  try {
    manager.create({ windowId: 1, webContents, projectRoot: tmp, cols: 80, rows: 24 });
    await waitFor(() => totalPushed > 0, 'shell prompt', 15000);

    const floodStart = Date.now();
    measuring = true;
    manager.input({ windowId: 1, ptyId: PTY_ID, data: `cat '${file}'; echo ${SENTINEL_CMD}\r` });

    if (opts.stallUntilPaused) {
      await waitFor(() => bridge.pauseCount > 0, 'backpressure pause to engage', 20000);
      drainEnabled = true;
    }

    await waitFor(() => sawSentinel, 'flood completion sentinel', 60000);
    const floodMs = Date.now() - floodStart;
    measuring = false;

    const all = chunks.join('');
    return {
      units: opts.units,
      receivedUnitCount: countOccurrences(all, UNIT),
      hasReplacementChar: all.includes('�'),
      totalPushedCodeUnits: totalPushed,
      pushCount,
      maxInFlight,
      pauseCount: bridge.pauseCount,
      resumeCount: bridge.resumeCount,
      maxHeartbeatGapMs: maxGap,
      heartbeats: beats,
      floodMs,
    };
  } finally {
    if (heartbeat) clearInterval(heartbeat);
    if (pump) clearInterval(pump);
    try {
      manager.kill({ windowId: 1, ptyId: PTY_ID });
    } catch {
    }
    bridge.reap();
    try {
      rmSync(tmp, { recursive: true, force: true });
    } catch {
    }
  }
}

const results: Array<{ name: string; ok: boolean }> = [];
async function scenario(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`PASS ${name}`);
  } catch (err) {
    results.push({ name, ok: false });
    console.log(`FAIL ${name} :: ${(err as Error).message}`);
  }
}

const FLOOD_UNITS_RESPONSIVE = 1_500_000; // ~28.5 MB UTF-8 / 12M UTF-16 code units
const FLOOD_UNITS_BACKPRESSURE = 300_000; // ~5.7 MB UTF-8 / 2.4M UTF-16 code units
const MAX_HEARTBEAT_GAP_MS = (() => {
  const override = Number(process.env.OK_FLOOD_MAX_GAP_MS);
  return Number.isFinite(override) && override > 0 ? override : 500;
})();

async function main(): Promise<void> {
  ensureSpawnHelperExecutable();

  await scenario('flood stays responsive and byte-exact under a fast consumer', async () => {
    const m = await runFloodScenario({
      units: FLOOD_UNITS_RESPONSIVE,
      highWaterBytes: Number.MAX_SAFE_INTEGER,
      lowWaterBytes: 0,
      drain: 'immediate',
      heartbeat: true,
    });
    assert(
      m.receivedUnitCount === m.units,
      `byte corruption: ${m.receivedUnitCount} units delivered, expected ${m.units}`,
    );
    assert(!m.hasReplacementChar, 'U+FFFD replacement char in stream (split multibyte sequence)');
    assert(m.heartbeats > 0, 'event loop frozen: no heartbeats fired during the flood');
    assert(
      m.maxHeartbeatGapMs < MAX_HEARTBEAT_GAP_MS,
      `event loop starved: max heartbeat gap ${m.maxHeartbeatGapMs}ms >= ${MAX_HEARTBEAT_GAP_MS}ms`,
    );
    const maxExpectedPushes = Math.ceil(m.floodMs / COALESCE_MS) + 8;
    assert(
      m.pushCount <= maxExpectedPushes,
      `coalescing ineffective: ${m.pushCount} pushes for a ${m.floodMs}ms flood (tick-bound ${maxExpectedPushes})`,
    );
    const avgPushUnits = m.totalPushedCodeUnits / Math.max(1, m.pushCount);
    console.log(
      `  units=${m.units} pushes=${m.pushCount} avgPush=${avgPushUnits.toFixed(0)} maxGap=${m.maxHeartbeatGapMs}ms beats=${m.heartbeats} floodMs=${m.floodMs}`,
    );
  });

  await scenario('flood backpressure bounds in-flight under a slow consumer', async () => {
    const highWater = 256 * 1024;
    const m = await runFloodScenario({
      units: FLOOD_UNITS_BACKPRESSURE,
      highWaterBytes: highWater,
      lowWaterBytes: 64 * 1024,
      drain: 'metered',
      stallUntilPaused: true,
      meterUnitsPerTick: 131072,
      meterTickMs: 20,
    });
    assert(
      m.receivedUnitCount === m.units,
      `byte corruption: ${m.receivedUnitCount} units delivered, expected ${m.units}`,
    );
    assert(!m.hasReplacementChar, 'U+FFFD replacement char in stream (split multibyte sequence)');
    assert(m.pauseCount >= 1, 'backpressure never paused the source under sustained flood');
    assert(m.resumeCount >= 1, 'backpressure never resumed the source after draining');
    assert(
      m.maxInFlight < m.totalPushedCodeUnits * 0.6,
      `in-flight not bounded: peak ${m.maxInFlight} vs ${m.totalPushedCodeUnits} total code units`,
    );
    console.log(
      `  units=${m.units} maxInFlight=${m.maxInFlight} highWater=${highWater} pauses=${m.pauseCount} resumes=${m.resumeCount} floodMs=${m.floodMs}`,
    );
  });

  const failed = results.filter((r) => !r.ok).length;
  console.log(`HARNESS_RESULT ok=${results.length - failed} fail=${failed}`);
  process.exit(failed === 0 ? 0 : 1);
}

const hardTimeout = setTimeout(() => {
  console.log('HARNESS_RESULT ok=0 fail=1 :: hard timeout');
  process.exit(1);
}, 120000);
hardTimeout.unref();

void main().catch((err) => {
  console.log(`HARNESS_RESULT ok=0 fail=1 :: ${(err as Error).message}`);
  process.exit(1);
});
