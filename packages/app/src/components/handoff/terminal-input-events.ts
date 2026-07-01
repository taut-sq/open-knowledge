
const ACTIVE_TERMINAL_INPUT_EVENT = 'open-knowledge:active-terminal-input';

export function requestActiveTerminalInput(
  text: string,
  target: Pick<Window, 'dispatchEvent'> | EventTarget = typeof window === 'undefined'
    ? new EventTarget()
    : window,
): void {
  target.dispatchEvent(new CustomEvent<string>(ACTIVE_TERMINAL_INPUT_EVENT, { detail: text }));
}

export function subscribeToActiveTerminalInput(
  onRequest: (text: string) => void,
  target: Pick<Window, 'addEventListener' | 'removeEventListener'> | EventTarget = typeof window ===
  'undefined'
    ? new EventTarget()
    : window,
): () => void {
  const listener = (event: Event) => {
    const text = event instanceof CustomEvent ? (event as CustomEvent<string>).detail : undefined;
    if (typeof text === 'string') onRequest(text);
  };
  target.addEventListener(ACTIVE_TERMINAL_INPUT_EVENT, listener as EventListener);
  return () => target.removeEventListener(ACTIVE_TERMINAL_INPUT_EVENT, listener as EventListener);
}
