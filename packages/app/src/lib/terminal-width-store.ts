export const TERMINAL_WIDTH_KEY = 'ok-terminal-width-v1';

export const DEFAULT_TERMINAL_WIDTH = 480;
export const MIN_TERMINAL_WIDTH = 320;
export const MAX_TERMINAL_WIDTH = 900;

export interface TerminalWidthStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function clamp(px: number): number {
  if (!Number.isFinite(px)) return DEFAULT_TERMINAL_WIDTH;
  if (px < MIN_TERMINAL_WIDTH) return MIN_TERMINAL_WIDTH;
  if (px > MAX_TERMINAL_WIDTH) return MAX_TERMINAL_WIDTH;
  return Math.round(px);
}

export function readTerminalWidth(storage?: TerminalWidthStorage): number {
  try {
    const s = storage ?? localStorage;
    const raw = s.getItem(TERMINAL_WIDTH_KEY);
    if (raw == null) return DEFAULT_TERMINAL_WIDTH;
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed)) return DEFAULT_TERMINAL_WIDTH;
    return clamp(parsed);
  } catch {
    return DEFAULT_TERMINAL_WIDTH;
  }
}

export function writeTerminalWidth(px: number, storage?: TerminalWidthStorage): void {
  try {
    const s = storage ?? localStorage;
    s.setItem(TERMINAL_WIDTH_KEY, String(clamp(px)));
  } catch {
  }
}

export function getInitialTerminalWidth(): number {
  try {
    if (typeof localStorage === 'undefined') return DEFAULT_TERMINAL_WIDTH;
    return readTerminalWidth();
  } catch {
    return DEFAULT_TERMINAL_WIDTH;
  }
}
