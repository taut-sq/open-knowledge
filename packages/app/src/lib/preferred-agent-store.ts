import type { HandoffTarget, InstallState } from '@inkeep/open-knowledge-core';
import { VISIBLE_TARGETS } from '@/lib/handoff/targets';

export const PREFERRED_AGENT_KEY = 'ok-preferred-agent-v1';

export interface PreferredAgentStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const VISIBLE_IDS = new Set<string>(VISIBLE_TARGETS.map((target) => target.id));

function isVisibleTarget(value: unknown): value is HandoffTarget {
  return typeof value === 'string' && VISIBLE_IDS.has(value);
}

export function readPreferredAgent(storage?: PreferredAgentStorage): HandoffTarget | null {
  try {
    const raw = (storage ?? localStorage).getItem(PREFERRED_AGENT_KEY);
    return isVisibleTarget(raw) ? raw : null;
  } catch {
    return null; // localStorage unavailable (private mode, disabled) — no memory.
  }
}

/** Persist the preference. Swallows quota / availability errors — the in-memory
 *  selection still holds for the session. */
export function writePreferredAgent(id: HandoffTarget, storage?: PreferredAgentStorage): void {
  try {
    (storage ?? localStorage).setItem(PREFERRED_AGENT_KEY, id);
  } catch {}
}

export function resolvePreferredAgent(args: {
  lastUsed: HandoffTarget | null;
  states: Record<HandoffTarget, InstallState>;
}): HandoffTarget | null {
  const { lastUsed, states } = args;
  if (lastUsed && states[lastUsed]?.installed === true) return lastUsed;
  return VISIBLE_TARGETS.find((target) => states[target.id]?.installed === true)?.id ?? null;
}
