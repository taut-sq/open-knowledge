
import { withSpanSync } from '@inkeep/open-knowledge-server';

export function recordShellExit(info: { crashed: boolean }): void {
  withSpanSync(
    'ok.desktop.shellExit',
    { attributes: { 'ok.desktop.shell_crashed': info.crashed } },
    () => undefined,
  );
}

export function recordTerminalSession(): void {
  withSpanSync('ok.desktop.terminalSession', {}, () => undefined);
}
