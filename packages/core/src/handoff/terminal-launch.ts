
import { MCP_SERVER_NAME } from '../constants/mcp.ts';
import type { HandoffTarget } from './types.ts';

export function shellSingleQuote(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

export type TerminalCli = 'claude' | 'codex' | 'cursor';

export interface TerminalCliInfo {
  /** PATH binary launched in the PTY. Interpolated (alongside any opted-in
   *  {@link mcpPreApproveArg}) into the fixed `<bin> [<fixed-args>…] '<prompt>'`
   *  shape — fixed registry values, never user input. */
  readonly bin: string;
  /** Claude's MCP pre-approval fragment, inserted verbatim between `<bin>` and
   *  the prompt ONLY when the caller passes `mcpPreApprove: true` (see
   *  {@link buildCliLaunchCommand}) — i.e. after the launch site has verified the
   *  project's `open-knowledge` `.mcp.json` entry is OK's own. An already-shell-
   *  safe fragment (NOT re-quoted); registry-fixed, never user input. Claude-only;
   *  omit for CLIs with no pre-approval. */
  readonly mcpPreApproveArg?: string;
  readonly displayName: string;
  readonly docsUrl: string;
  /** The handoff target this CLI maps to for prompt composition (shared with
   *  the deep-link path) and brand-icon rendering. Single source of truth so
   *  the renderer doesn't re-declare a parallel `cli → HandoffTarget` map. */
  readonly handoffTarget: HandoffTarget;
}

const CLAUDE_MCP_PREAPPROVE_ARG = `--settings ${shellSingleQuote(
  JSON.stringify({ enabledMcpjsonServers: [MCP_SERVER_NAME] }),
)}`;

export const TERMINAL_CLIS = {
  claude: {
    bin: 'claude',
    displayName: 'Claude',
    docsUrl: 'https://docs.claude.com/en/docs/claude-code',
    handoffTarget: 'claude-code',
    mcpPreApproveArg: CLAUDE_MCP_PREAPPROVE_ARG,
  },
  codex: {
    bin: 'codex',
    displayName: 'Codex',
    docsUrl: 'https://developers.openai.com/codex/cli',
    handoffTarget: 'codex',
  },
  cursor: {
    bin: 'cursor-agent',
    displayName: 'Cursor',
    docsUrl: 'https://cursor.com/docs/cli/overview',
    handoffTarget: 'cursor',
  },
} as const satisfies Record<TerminalCli, TerminalCliInfo>;

export const TERMINAL_CLI_IDS = [
  'claude',
  'codex',
  'cursor',
] as const satisfies readonly TerminalCli[];

export interface BuildCliLaunchOptions {
  readonly mcpPreApprove?: boolean;
}

export function buildCliLaunchCommand(
  cli: TerminalCli,
  prompt: string,
  opts: BuildCliLaunchOptions = {},
): string {
  const info: TerminalCliInfo = TERMINAL_CLIS[cli];
  const preApprove =
    opts.mcpPreApprove === true && info.mcpPreApproveArg ? `${info.mcpPreApproveArg} ` : '';
  return `${info.bin} ${preApprove}${shellSingleQuote(prompt)}\r`;
}

export function buildClaudeLaunchCommand(prompt: string, opts: BuildCliLaunchOptions = {}): string {
  return buildCliLaunchCommand('claude', prompt, opts);
}
