
import { describe, expect, test } from 'bun:test';
import { TERMINAL_CLI_IDS, type TerminalCli } from '@inkeep/open-knowledge-core';
import { resolveDefaultCli } from './default-cli-resolver';
import { TERMINAL_CLI_ID, terminalCliId } from './unified-agent-store';

function installedMap(clis: readonly TerminalCli[]): Record<TerminalCli, boolean> {
  return Object.fromEntries(TERMINAL_CLI_IDS.map((cli) => [cli, clis.includes(cli)])) as Record<
    TerminalCli,
    boolean
  >;
}

describe('resolveDefaultCli', () => {
  describe('sticky pick', () => {
    test('a sticky CLI that is installed wins, even over a higher-priority installed CLI', () => {
      expect(resolveDefaultCli(terminalCliId('codex'), installedMap(['claude', 'codex']))).toBe(
        'codex',
      );
    });

    test('a sticky CLI that is NOT installed falls through to first-installed by priority', () => {
      expect(resolveDefaultCli(terminalCliId('cursor'), installedMap(['opencode', 'codex']))).toBe(
        'codex',
      );
    });

    test('the legacy bare `terminal-cli` sentinel resolves to claude when installed', () => {
      expect(resolveDefaultCli(TERMINAL_CLI_ID, installedMap(['claude', 'codex']))).toBe('claude');
    });

    test('the legacy bare sentinel falls through when claude is not installed', () => {
      expect(resolveDefaultCli(TERMINAL_CLI_ID, installedMap(['opencode']))).toBe('opencode');
    });

    test('an app-target sticky (not a CLI sentinel) is ignored — New chat only launches CLIs', () => {
      expect(resolveDefaultCli('claude-code', installedMap(['codex']))).toBe('codex');
    });
  });

  describe('priority auto-pick (no usable sticky)', () => {
    test('null sticky picks the highest-priority installed CLI', () => {
      expect(resolveDefaultCli(null, installedMap(['codex', 'opencode', 'cursor']))).toBe('codex');
    });

    test('respects the full priority order claude > codex > opencode > cursor', () => {
      expect(resolveDefaultCli(null, installedMap(['opencode', 'cursor']))).toBe('opencode');
      expect(resolveDefaultCli(null, installedMap(['cursor']))).toBe('cursor');
      expect(resolveDefaultCli(null, installedMap(['claude', 'codex', 'opencode', 'cursor']))).toBe(
        'claude',
      );
    });
  });

  describe('nothing installed', () => {
    test('empty install map + no sticky → claude (the install-nudge default)', () => {
      expect(resolveDefaultCli(null, {})).toBe('claude');
    });

    test('all-false install map → claude', () => {
      expect(
        resolveDefaultCli(null, { claude: false, codex: false, opencode: false, cursor: false }),
      ).toBe('claude');
    });

    test('a KNOWN-absent sticky CLI with nothing installed → claude', () => {
      expect(resolveDefaultCli(terminalCliId('codex'), installedMap([]))).toBe('claude');
    });
  });

  describe('cold start (probe not yet resolved → unknown, not known-absent)', () => {
    test('a sticky CLI is honored against an empty/unknown map (not dropped to claude)', () => {
      expect(resolveDefaultCli(terminalCliId('codex'), {})).toBe('codex');
    });

    test('no sticky + unknown map → claude (priority auto-pick needs a positive install)', () => {
      expect(resolveDefaultCli(null, {})).toBe('claude');
    });
  });
});
