export const TERMINAL_HEIGHT_KEY = 'ok-terminal-height-v1';

export const DEFAULT_TERMINAL_HEIGHT = 240;
export const MIN_TERMINAL_HEIGHT = 120;
const MAX_TERMINAL_HEIGHT_FRACTION = 0.5;

export interface HeightStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function maxHeight(viewportHeight: number): number {
  const vh = Number.isFinite(viewportHeight) ? viewportHeight : 0;
  return Math.max(MIN_TERMINAL_HEIGHT, Math.round(vh * MAX_TERMINAL_HEIGHT_FRACTION));
}

function clamp(px: number, viewportHeight: number): number {
  const max = maxHeight(viewportHeight);
  if (!Number.isFinite(px)) return Math.min(DEFAULT_TERMINAL_HEIGHT, max);
  if (px < MIN_TERMINAL_HEIGHT) return MIN_TERMINAL_HEIGHT;
  if (px > max) return max;
  return Math.round(px);
}

function currentViewportHeight(): number {
  if (typeof window === 'undefined') return 0;
  return window.innerHeight;
}

export function readTerminalHeight(storage?: HeightStorage, viewportHeight?: number): number {
  try {
    const s = storage ?? localStorage;
    const vh = viewportHeight ?? currentViewportHeight();
    const raw = s.getItem(TERMINAL_HEIGHT_KEY);
    if (raw == null) return clamp(DEFAULT_TERMINAL_HEIGHT, vh);
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed)) return clamp(DEFAULT_TERMINAL_HEIGHT, vh);
    return clamp(parsed, vh);
  } catch {
    return DEFAULT_TERMINAL_HEIGHT;
  }
}

export function writeTerminalHeight(
  px: number,
  storage?: HeightStorage,
  viewportHeight?: number,
): void {
  try {
    const s = storage ?? localStorage;
    const vh = viewportHeight ?? currentViewportHeight();
    s.setItem(TERMINAL_HEIGHT_KEY, String(clamp(px, vh)));
  } catch {
  }
}

export function getInitialTerminalHeight(): number {
  try {
    if (typeof localStorage === 'undefined') return DEFAULT_TERMINAL_HEIGHT;
    return readTerminalHeight();
  } catch {
    return DEFAULT_TERMINAL_HEIGHT;
  }
}
