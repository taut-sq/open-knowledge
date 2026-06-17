
import { existsSync, readFileSync } from 'node:fs';
import { resolveConfigPath } from '@inkeep/open-knowledge-core/server';
import { parse as parseYaml } from 'yaml';

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function isTerminalConsented(projectDir: string): boolean {
  const path = resolveConfigPath('project-local', projectDir);
  if (!existsSync(path)) return false;
  let parsed: unknown;
  try {
    parsed = parseYaml(readFileSync(path, 'utf-8'));
  } catch {
    return false;
  }
  if (!isObject(parsed)) return false;
  const terminal = parsed.terminal;
  if (!isObject(terminal)) return false;
  return terminal.enabled === true;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export const TERMINAL_CONSENT_GRACE_TIMEOUT_MS = 3000;

export async function isTerminalConsentedWithGrace(
  projectDir: string,
  {
    timeoutMs = TERMINAL_CONSENT_GRACE_TIMEOUT_MS,
    intervalMs = 50,
  }: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (true) {
    if (isTerminalConsented(projectDir)) return true;
    if (Date.now() >= deadline) return false;
    await sleep(intervalMs);
  }
}
