
import type { AgentIdentity } from '../agent-identity.ts';
import { getCurrentMcpLogger, type McpLogger } from '../logger.ts';
import { createLoggedServer } from '../tool-logging.ts';
import {
  DESCRIPTION as CHECKPOINT_DESCRIPTION,
  register as registerCheckpoint,
} from './checkpoint.ts';
import { DESCRIPTION as CONFIG_DESCRIPTION, register as registerConfig } from './config.ts';
import {
  DESCRIPTION as CONFLICTS_DESCRIPTION,
  register as registerConflicts,
} from './conflicts.ts';
import { DESCRIPTION as DELETE_DESCRIPTION, register as registerDelete } from './delete.ts';
import { DESCRIPTION as EDIT_DESCRIPTION, register as registerEdit } from './edit.ts';
import { DESCRIPTION as EXEC_DESCRIPTION, register as registerExec } from './exec.ts';
import {
  DESCRIPTION as PREVIEW_URL_DESCRIPTION,
  register as registerPreviewUrl,
} from './get-preview-url.ts';
import { DESCRIPTION as HISTORY_DESCRIPTION, register as registerHistory } from './history.ts';
import { DESCRIPTION as LINKS_DESCRIPTION, register as registerLinks } from './links.ts';
import { DESCRIPTION as MOVE_DESCRIPTION, register as registerMove } from './move.ts';
import { DESCRIPTION as PALETTE_DESCRIPTION, register as registerPalette } from './palette.ts';
import {
  DESCRIPTION as RESOLVE_CONFLICT_DESCRIPTION,
  register as registerResolveConflict,
} from './resolve-conflict.ts';
import {
  DESCRIPTION as RESTORE_VERSION_DESCRIPTION,
  register as registerRestoreVersion,
} from './restore-version.ts';
import { register as registerSearch, DESCRIPTION as SEARCH_DESCRIPTION } from './search.ts';
import {
  register as registerShareLink,
  DESCRIPTION as SHARE_LINK_DESCRIPTION,
} from './share-link.ts';
import type { ConfigOrResolver, ServerInstance, ServerUrlOrResolver } from './shared.ts';
import { register as registerWorkflow, DESCRIPTION as WORKFLOW_DESCRIPTION } from './workflow.ts';
import { register as registerWrite, DESCRIPTION as WRITE_DESCRIPTION } from './write.ts';

const _TOOL_DESCRIPTIONS = {
  exec: EXEC_DESCRIPTION,
  workflow: WORKFLOW_DESCRIPTION,
  move: MOVE_DESCRIPTION,
  search: SEARCH_DESCRIPTION,
  links: LINKS_DESCRIPTION,
  write: WRITE_DESCRIPTION,
  edit: EDIT_DESCRIPTION,
  delete: DELETE_DESCRIPTION,
  history: HISTORY_DESCRIPTION,
  checkpoint: CHECKPOINT_DESCRIPTION,
  restore_version: RESTORE_VERSION_DESCRIPTION,
  palette: PALETTE_DESCRIPTION,
  config: CONFIG_DESCRIPTION,
  preview_url: PREVIEW_URL_DESCRIPTION,
  conflicts: CONFLICTS_DESCRIPTION,
  resolve_conflict: RESOLVE_CONFLICT_DESCRIPTION,
  share_link: SHARE_LINK_DESCRIPTION,
} as const;

type ResolveCwd = (explicit?: string) => Promise<string>;

interface RegisterAllToolsOptions {
  serverUrl?: ServerUrlOrResolver;
  resolveCwd: ResolveCwd;
  config: ConfigOrResolver;
  identityRef?: { current: AgentIdentity };
  logger?: McpLogger;
}

export function registerAllTools(server: ServerInstance, opts: RegisterAllToolsOptions): void {
  const log = opts.logger;
  const registrationServer = createLoggedServer(server, {
    logger: opts.logger,
    identityRef: opts.identityRef,
  });
  const named =
    (tool: string): ResolveCwd =>
    async (explicit?: string) => {
      try {
        const cwd = await opts.resolveCwd(explicit);
        const activeLog = getCurrentMcpLogger() ?? log;
        activeLog?.debug('tool cwd resolved', { tool, cwd, ...(explicit ? { explicit } : {}) });
        return cwd;
      } catch (err) {
        const activeLog = getCurrentMcpLogger() ?? log;
        activeLog?.warn('tool call failed', {
          tool,
          error: err instanceof Error ? err.message : String(err),
          ...(explicit ? { explicit } : {}),
        });
        throw err;
      }
    };

  registerExec(registrationServer, {
    resolveCwd: named('exec'),
    serverUrl: opts.serverUrl,
    config: opts.config,
  });

  registerWorkflow(registrationServer, { config: opts.config, resolveCwd: named('workflow') });

  registerSearch(registrationServer, {
    resolveCwd: named('search'),
    config: opts.config,
    serverUrl: opts.serverUrl,
  });
  registerLinks(registrationServer, {
    serverUrl: opts.serverUrl,
    config: opts.config,
    resolveCwd: named('links'),
  });

  registerWrite(registrationServer, {
    serverUrl: opts.serverUrl,
    config: opts.config,
    resolveCwd: named('write'),
    identityRef: opts.identityRef,
  });
  registerEdit(registrationServer, {
    serverUrl: opts.serverUrl,
    config: opts.config,
    resolveCwd: named('edit'),
    identityRef: opts.identityRef,
  });
  registerDelete(registrationServer, {
    serverUrl: opts.serverUrl,
    config: opts.config,
    resolveCwd: named('delete'),
    identityRef: opts.identityRef,
  });
  registerMove(registrationServer, {
    serverUrl: opts.serverUrl,
    config: opts.config,
    resolveCwd: named('move'),
    identityRef: opts.identityRef,
  });
  registerHistory(registrationServer, {
    serverUrl: opts.serverUrl,
    config: opts.config,
    resolveCwd: named('history'),
  });
  registerCheckpoint(registrationServer, {
    serverUrl: opts.serverUrl,
    config: opts.config,
    resolveCwd: named('checkpoint'),
    identityRef: opts.identityRef,
  });
  registerRestoreVersion(registrationServer, {
    serverUrl: opts.serverUrl,
    config: opts.config,
    resolveCwd: named('restore_version'),
    identityRef: opts.identityRef,
  });
  registerPalette(registrationServer, {
    resolveCwd: named('palette'),
    config: opts.config,
  });

  registerConfig(registrationServer, {
    config: opts.config,
    resolveCwd: named('config'),
  });
  registerPreviewUrl(registrationServer, {
    config: opts.config,
    resolveCwd: named('preview_url'),
  });
  registerConflicts(registrationServer, {
    serverUrl: opts.serverUrl,
    config: opts.config,
    resolveCwd: named('conflicts'),
  });
  registerResolveConflict(registrationServer, {
    serverUrl: opts.serverUrl,
    config: opts.config,
    resolveCwd: named('resolve_conflict'),
  });

  registerShareLink(registrationServer, {
    serverUrl: opts.serverUrl,
    config: opts.config,
    resolveCwd: named('share_link'),
  });
}
