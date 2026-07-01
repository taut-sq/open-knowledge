
import { TERMINAL_CLI_IDS, type TerminalCli } from '@inkeep/open-knowledge-core';
import { parseStickyCliId } from './unified-agent-store';

export function resolveDefaultCli(
  sticky: string | null,
  installed: Partial<Record<TerminalCli, boolean>>,
): TerminalCli {
  const stickyCli = parseStickyCliId(sticky);
  if (stickyCli && installed[stickyCli] !== false) return stickyCli;
  return TERMINAL_CLI_IDS.find((cli) => installed[cli] === true) ?? 'claude';
}
