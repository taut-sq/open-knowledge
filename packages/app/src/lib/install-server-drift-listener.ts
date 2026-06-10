
import { createElement } from 'react';
import { toast } from 'sonner';
import { ServerDriftToast } from '@/components/ServerDriftToast';
import type {
  OkDesktopBridge,
  OkServerRestartOutcome,
  OkServerVersionDriftInfo,
} from '@/lib/desktop-bridge-types';

const RESTART_ACTION_LABEL = "Restart with this app's version";
const CANCEL_LABEL = 'Not now';

export const RESTART_DISRUPTION_WARNING =
  "Restarting closes this project's server. Connected agents (Claude Code, Codex, Cursor) will see their Open Knowledge MCP connection close unexpectedly — you may need to restart the agent, or toggle its Open Knowledge MCP server off and on, to reconnect.";

export function driftToastBody(info: OkServerVersionDriftInfo): string {
  if (info.serverRuntime === info.appRuntime) {
    return `This project is running a different, incompatible build of Open Knowledge than this app (v${info.appRuntime}).`;
  }
  return info.relation === 'older'
    ? `This project is running an older version of Open Knowledge (v${info.serverRuntime}) than this app (v${info.appRuntime}).`
    : `This project's server (v${info.serverRuntime}) is newer than this app (v${info.appRuntime}).`;
}

export function restartSuccessMessage(appRuntime: string): string {
  return `Restarted — now running v${appRuntime}.`;
}

export function reclaimNoticeMessage(appRuntime: string): string {
  return `Started a fresh Open Knowledge server (v${appRuntime}) for this dev session — the server already running for this project was terminated. Connected agents (Claude Code, Codex, Cursor) just lost their Open Knowledge MCP connection; restart the agent, or toggle its Open Knowledge MCP server off and on, to reconnect.`;
}

export function restartFailureMessage(reason: 'eperm' | 'other'): string {
  return reason === 'eperm'
    ? "Couldn't restart the server — it's running under a different account. Restart your computer to clear it, then reopen this project."
    : "Couldn't restart the server automatically. Try running `ok stop all` in a terminal, then reopen this project — or restart your computer if it persists.";
}

async function runRestart(bridge: OkDesktopBridge): Promise<void> {
  const loadingId = toast.loading('Restarting the server…', {
    duration: Number.POSITIVE_INFINITY,
  });
  let outcome: OkServerRestartOutcome;
  try {
    outcome = await bridge.restartServer(bridge.config.projectPath);
  } catch {
    return;
  }
  toast.dismiss(loadingId);
  if (outcome.ok === false) {
    toast.error(restartFailureMessage(outcome.reason), {
      duration: Number.POSITIVE_INFINITY,
    });
  }
}

export function installServerDriftListener(opts: {
  bridge: OkDesktopBridge | undefined;
}): (() => void) | undefined {
  const bridge = opts.bridge;
  if (!bridge) return undefined;

  const unsubscribeDrift = bridge.onServerVersionDrift((info) => {
    toast.custom(
      (id) =>
        createElement(ServerDriftToast, {
          body: driftToastBody(info),
          warning: RESTART_DISRUPTION_WARNING,
          restartLabel: RESTART_ACTION_LABEL,
          cancelLabel: CANCEL_LABEL,
          onRestart: () => {
            toast.dismiss(id);
            void runRestart(bridge);
          },
          onDismiss: () => toast.dismiss(id),
        }),
      { duration: Number.POSITIVE_INFINITY },
    );
  });

  const unsubscribeRestarted = bridge.onServerRestarted((info) => {
    toast.success(restartSuccessMessage(info.appRuntime));
  });

  const unsubscribeReclaimed = bridge.onServerReclaimed((info) => {
    toast.warning(reclaimNoticeMessage(info.appRuntime), { duration: 15_000 });
  });

  return () => {
    unsubscribeDrift();
    unsubscribeRestarted();
    unsubscribeReclaimed();
  };
}
