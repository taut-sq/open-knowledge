import type { ClaudeReadiness } from '../shared/bridge-contract.ts';
import { getLogger } from './desktop-logger.ts';

export type ClaudeOnPath = ClaudeReadiness['claude'];
export type McpWiringStatus = ClaudeReadiness['mcp'];

export const CLAUDE_PROBE_ARGS: readonly string[] = ['-l', '-i', '-c', 'command -v claude'];

const PROBE_TIMEOUT_MS = 5000;

export type McpEntryKind = 'present' | 'absent' | 'no-entry' | 'corrupt';

/** Minimal child-process surface the probe drives — injected so the spawn is a
 *  test seam. Custom method names avoid the EventEmitter overload friction of
 *  structurally matching `child_process.ChildProcess`. */
export interface ProbeChild {
  onExit(cb: (code: number | null) => void): void;
  onError(cb: (err: Error) => void): void;
  kill(): void;
}
export type ProbeSpawn = (file: string, args: readonly string[]) => ProbeChild;

export interface ProbeTimers {
  setTimer(cb: () => void, ms: number): unknown;
  clearTimer(token: unknown): void;
}

export function runLoginShellProbe(
  spawn: ProbeSpawn,
  shell: string,
  timers: ProbeTimers,
  timeoutMs: number = PROBE_TIMEOUT_MS,
): Promise<number | null> {
  return new Promise<number | null>((resolve) => {
    let child: ProbeChild;
    try {
      child = spawn(shell, CLAUDE_PROBE_ARGS);
    } catch {
      resolve(null);
      return;
    }
    let settled = false;
    const timer = timers.setTimer(() => {
      child.kill();
      finish(null);
    }, timeoutMs);
    function finish(code: number | null): void {
      if (settled) return;
      settled = true;
      timers.clearTimer(timer);
      resolve(code);
    }
    child.onError(() => finish(null));
    child.onExit((code) => finish(code));
  });
}

export function interpretClaudeProbe(code: number | null): ClaudeOnPath {
  if (code === null) return 'unknown';
  return code === 0 ? 'present' : 'not-found';
}

/** Only an actually-present `open-knowledge` entry counts as wired; absent /
 *  no-entry / corrupt all mean the terminal's `claude` would see no OK tools. */
export function mcpStatusFromClassification(kind: McpEntryKind): McpWiringStatus {
  return kind === 'present' ? 'wired' : 'needs-rewire';
}

export interface ResolveClaudeReadinessDeps {
  probeClaude(): Promise<number | null>;
  classifyMcpEntry(): McpEntryKind;
}

export async function resolveClaudeReadiness(
  deps: ResolveClaudeReadinessDeps,
): Promise<ClaudeReadiness> {
  const code = await deps.probeClaude().catch((err) => {
    getLogger('claude-readiness').warn(
      { err: err instanceof Error ? err.message : String(err) },
      'claude PATH probe rejected; treating claude presence as unknown',
    );
    return null;
  });
  let kind: McpEntryKind;
  try {
    kind = deps.classifyMcpEntry();
  } catch (err) {
    getLogger('claude-readiness').warn(
      { err: err instanceof Error ? err.message : String(err) },
      'classifyMcpEntry threw (never-throws contract violated); treating MCP as not-wired',
    );
    kind = 'absent';
  }
  return { claude: interpretClaudeProbe(code), mcp: mcpStatusFromClassification(kind) };
}
