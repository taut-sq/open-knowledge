const TERMINAL_LAUNCH_EVENT = 'open-knowledge:terminal-launch';

interface TerminalLaunchDetail {
  readonly prompt: string;
}

export function requestTerminalLaunch(
  prompt: string,
  target: Pick<Window, 'dispatchEvent'> | EventTarget = typeof window === 'undefined'
    ? new EventTarget()
    : window,
): void {
  target.dispatchEvent(
    new CustomEvent<TerminalLaunchDetail>(TERMINAL_LAUNCH_EVENT, { detail: { prompt } }),
  );
}

export function subscribeToTerminalLaunchRequests(
  onRequest: (prompt: string) => void,
  target: Pick<Window, 'addEventListener' | 'removeEventListener'> | EventTarget = typeof window ===
  'undefined'
    ? new EventTarget()
    : window,
): () => void {
  const listener = (event: Event) => {
    const prompt =
      event instanceof CustomEvent
        ? (event as CustomEvent<TerminalLaunchDetail>).detail?.prompt
        : undefined;
    if (typeof prompt === 'string') onRequest(prompt);
  };
  target.addEventListener(TERMINAL_LAUNCH_EVENT, listener as EventListener);
  return () => target.removeEventListener(TERMINAL_LAUNCH_EVENT, listener as EventListener);
}
