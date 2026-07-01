
export const TERMINAL_DOCK_KEY = 'ok-terminal-dock-v1';

export type TerminalDockPosition = 'bottom' | 'right';

export const DEFAULT_TERMINAL_DOCK: TerminalDockPosition = 'right';

export interface DockStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function coerce(raw: string | null): TerminalDockPosition {
  return raw === 'bottom' ? 'bottom' : 'right';
}

export function readTerminalDock(storage?: DockStorage): TerminalDockPosition {
  try {
    const s = storage ?? localStorage;
    return coerce(s.getItem(TERMINAL_DOCK_KEY));
  } catch {
    return DEFAULT_TERMINAL_DOCK;
  }
}

export function writeTerminalDock(position: TerminalDockPosition, storage?: DockStorage): void {
  try {
    const s = storage ?? localStorage;
    s.setItem(TERMINAL_DOCK_KEY, position);
  } catch {
  }
}

export function getInitialTerminalDock(): TerminalDockPosition {
  try {
    if (typeof localStorage === 'undefined') return DEFAULT_TERMINAL_DOCK;
    return readTerminalDock();
  } catch {
    return DEFAULT_TERMINAL_DOCK;
  }
}
