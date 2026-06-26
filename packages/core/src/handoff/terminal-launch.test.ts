import { describe, expect, it } from 'bun:test';
import { MCP_SERVER_NAME } from '../constants/mcp.ts';
import {
  buildClaudeLaunchCommand,
  buildCliLaunchCommand,
  shellSingleQuote,
  TERMINAL_CLI_IDS,
  TERMINAL_CLIS,
} from './terminal-launch.ts';

const CLAUDE_PREAPPROVE = `--settings '{"enabledMcpjsonServers":["${MCP_SERVER_NAME}"]}'`;

describe('shellSingleQuote', () => {
  it('wraps a plain string in single quotes', () => {
    expect(shellSingleQuote('hello world')).toBe("'hello world'");
  });

  it('escapes embedded single quotes with the POSIX close-escape-reopen idiom', () => {
    expect(shellSingleQuote("it's")).toBe("'it'\\''s'");
  });

  it('renders shell metacharacters inert (no expansion possible)', () => {
    for (const payload of [
      '$(rm -rf /)',
      '`whoami`',
      'a; rm -rf /',
      'a && curl evil',
      'a | sh',
      'a > /etc/passwd',
      '$HOME',
      '*.md',
      'line1\nline2',
      'back\\slash',
    ]) {
      const quoted = shellSingleQuote(payload);
      expect(quoted.startsWith("'")).toBe(true);
      expect(quoted.endsWith("'")).toBe(true);
      expect(quoted).toContain(payload);
    }
  });

  it('cannot be broken out of with an injected quote + command', () => {
    const malicious = "'; rm -rf / #";
    const quoted = shellSingleQuote(malicious);
    expect(quoted).toBe("''\\''; rm -rf / #'");
    const interior = quoted.slice(1, -1);
    expect(interior.replace(/'\\''/g, '')).not.toContain("'");
  });
});

describe('buildClaudeLaunchCommand', () => {
  it("defaults to a bare `claude '<prompt>'` — no MCP pre-approval unless opted in", () => {
    expect(buildClaudeLaunchCommand("Let's work on `foo.md` using OpenKnowledge.")).toBe(
      "claude 'Let'\\''s work on `foo.md` using OpenKnowledge.'\r",
    );
  });

  it("with mcpPreApprove, produces the `claude --settings '<json>' '<prompt>'` shape", () => {
    expect(
      buildClaudeLaunchCommand("Let's work on `foo.md` using OpenKnowledge.", {
        mcpPreApprove: true,
      }),
    ).toBe(
      "claude --settings '{\"enabledMcpjsonServers\":[\"open-knowledge\"]}' 'Let'\\''s work on `foo.md` using OpenKnowledge.'\r",
    );
  });

  it('keeps an injection payload inert and contained in the prompt arg (pre-approved)', () => {
    const cmd = buildClaudeLaunchCommand("'; rm -rf / #", { mcpPreApprove: true });
    expect(cmd).toBe(`claude ${CLAUDE_PREAPPROVE} ''\\''; rm -rf / #'\r`);
    expect(cmd.startsWith(`claude ${CLAUDE_PREAPPROVE} `)).toBe(true);
    expect(cmd.endsWith("''\\''; rm -rf / #'\r")).toBe(true);
  });
});

describe('buildCliLaunchCommand', () => {
  it('defaults to a bare positional single-quoted prompt per CLI (no pre-approval)', () => {
    expect(buildCliLaunchCommand('claude', 'hi')).toBe("claude 'hi'\r");
    expect(buildCliLaunchCommand('codex', 'hi')).toBe("codex 'hi'\r");
    expect(buildCliLaunchCommand('cursor', 'hi')).toBe("cursor-agent 'hi'\r");
    expect(buildCliLaunchCommand('opencode', 'hi')).toBe("opencode --prompt 'hi'\r");
  });

  it('escapes the prompt identically for every CLI regardless of fixed args', () => {
    for (const cli of TERMINAL_CLI_IDS) {
      const cmd = buildCliLaunchCommand(cli, "'; rm -rf / #", { mcpPreApprove: true });
      expect(cmd.startsWith(`${TERMINAL_CLIS[cli].bin} `)).toBe(true);
      expect(cmd.endsWith("''\\''; rm -rf / #'\r")).toBe(true);
    }
  });

  it('buildClaudeLaunchCommand is the claude specialization (opts forwarded)', () => {
    expect(buildClaudeLaunchCommand('hi')).toBe(buildCliLaunchCommand('claude', 'hi'));
    expect(buildClaudeLaunchCommand('hi', { mcpPreApprove: true })).toBe(
      buildCliLaunchCommand('claude', 'hi', { mcpPreApprove: true }),
    );
  });
});

describe('claude MCP pre-approval', () => {
  it('is OFF by default and only added for claude when opted in', () => {
    expect(buildCliLaunchCommand('claude', 'hi')).not.toContain('--settings');
    expect(buildCliLaunchCommand('claude', 'hi', { mcpPreApprove: true })).toContain(
      CLAUDE_PREAPPROVE,
    );
  });

  it('never added for codex/cursor/opencode, even when opted in (claude-only flag)', () => {
    expect(buildCliLaunchCommand('codex', 'hi', { mcpPreApprove: true })).toBe("codex 'hi'\r");
    expect(buildCliLaunchCommand('cursor', 'hi', { mcpPreApprove: true })).toBe(
      "cursor-agent 'hi'\r",
    );
    expect(buildCliLaunchCommand('opencode', 'hi', { mcpPreApprove: true })).toBe(
      "opencode --prompt 'hi'\r",
    );
  });

  it('names the canonical MCP server, matching what editor wiring registers in .mcp.json', () => {
    expect(buildCliLaunchCommand('claude', 'hi', { mcpPreApprove: true })).toContain(
      `["${MCP_SERVER_NAME}"]`,
    );
  });
});
