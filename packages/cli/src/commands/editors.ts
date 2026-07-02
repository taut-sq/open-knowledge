import { homedir } from 'node:os';
import { basename, dirname, join, posix, resolve, sep, win32 } from 'node:path';
import {
  ALL_EDITOR_IDS as CORE_ALL_EDITOR_IDS,
  EDITOR_LABELS as CORE_EDITOR_LABELS,
  HOSTS_WITH_USER_SKILL_DIR as CORE_HOSTS_WITH_USER_SKILL_DIR,
  type EditorId as CoreEditorId,
} from '@inkeep/open-knowledge-core';
import { MCP_SERVER_NAME } from '@inkeep/open-knowledge-server';

export type EditorId = CoreEditorId;
export const ALL_EDITOR_IDS: readonly EditorId[] = CORE_ALL_EDITOR_IDS;
export const EDITOR_LABELS: Record<EditorId, string> = CORE_EDITOR_LABELS;
/** Re-export of core's derived list — the host-dir sweep set for `repair-skills`
 *  (CLI) + `skill-reclaim` (desktop). Both import it from the package surface. */
export const HOSTS_WITH_USER_SKILL_DIR = CORE_HOSTS_WITH_USER_SKILL_DIR;

const DEV_MCP_SERVER_COMMAND = 'node';
const DEV_MCP_ENV = {
  MCP_DEBUG: '1',
  OK_LOG_FILE: '/tmp/ok-mcp.log',
} as const;

export const CHAIN_VERSION_SENTINEL = '# ok-mcp-v1';

export const CHAIN_V1 = `# ok-mcp-v1
USER_BUNDLE="$HOME/Applications/OpenKnowledge.app/Contents/Resources/cli/bin/ok.sh"
[ -f "$USER_BUNDLE" ] && [ -x "$USER_BUNDLE" ] && exec "$USER_BUNDLE" mcp
BUNDLE="/Applications/OpenKnowledge.app/Contents/Resources/cli/bin/ok.sh"
[ -f "$BUNDLE" ] && [ -x "$BUNDLE" ] && exec "$BUNDLE" mcp
command -v npx >/dev/null 2>&1 && exec npx -y @inkeep/open-knowledge@latest mcp
for d in "$HOME/.nvm/versions/node"/*/bin "$HOME/.fnm/node-versions"/*/installation/bin "$HOME/.asdf/installs/nodejs"/*/bin /opt/homebrew/bin /usr/local/bin "$HOME/.local/bin" "$HOME/.volta/bin"; do
  [ -f "$d/npx" ] && [ -x "$d/npx" ] && exec "$d/npx" -y @inkeep/open-knowledge@latest mcp
done
echo "OpenKnowledge: install OK Desktop or Node.js 24+, then restart your editor" >&2
exit 127`;

type McpInstallMode = 'published' | 'dev';

export interface McpInstallOptions {
  mode?: McpInstallMode;
  skipAvailabilityCheck?: boolean;
}

export function isEntryUpToDate(entry: unknown): boolean {
  if (typeof entry !== 'object' || entry === null) return false;
  const e = entry as Record<string, unknown>;

  if (e.command === '/bin/sh') {
    if (!Array.isArray(e.args)) return false;
    if (e.args[0] !== '-l' || e.args[1] !== '-c') return false;
    const body = e.args[2];
    return typeof body === 'string' && body.includes(CHAIN_VERSION_SENTINEL);
  }

  if (e.type === 'local' && Array.isArray(e.command)) {
    if (e.command[0] !== '/bin/sh' || e.command[1] !== '-l' || e.command[2] !== '-c') return false;
    const body = e.command[3];
    return typeof body === 'string' && body.includes(CHAIN_VERSION_SENTINEL);
  }

  return false;
}

export function resolveDevCliDistPath(entryPath: string = process.argv[1]): string {
  if (!entryPath) {
    throw new Error(
      'Cannot infer the local CLI entry for --dev-mcp because process.argv[1] is empty.',
    );
  }

  const resolvedEntry = resolve(entryPath);
  if (basename(resolvedEntry) === 'cli.mjs' && basename(dirname(resolvedEntry)) === 'dist') {
    return resolvedEntry;
  }

  const pathParts = resolvedEntry.split(sep);
  const packagesIndex = pathParts.lastIndexOf('packages');
  if (packagesIndex === -1 || pathParts[packagesIndex + 1] !== 'cli') {
    throw new Error(
      `Cannot infer the repo root for --dev-mcp from ${resolvedEntry}. Run the local CLI from this repo so the built dist path can be derived.`,
    );
  }

  const rootParts = pathParts.slice(0, packagesIndex);
  const repoRoot = rootParts.length === 0 ? sep : rootParts.join(sep);
  return join(repoRoot, 'packages', 'cli', 'dist', 'cli.mjs');
}

export function buildManagedServerEntry(options: McpInstallOptions = {}): Record<string, unknown> {
  if (options.mode === 'dev') {
    return {
      command: DEV_MCP_SERVER_COMMAND,
      args: [resolveDevCliDistPath(), 'mcp'],
      env: { ...DEV_MCP_ENV },
    };
  }

  return {
    command: '/bin/sh',
    args: ['-l', '-c', CHAIN_V1],
  };
}

function buildOpenCodeEntry(options: McpInstallOptions = {}): Record<string, unknown> {
  if (options.mode === 'dev') {
    return {
      type: 'local',
      enabled: true,
      command: [DEV_MCP_SERVER_COMMAND, resolveDevCliDistPath(), 'mcp'],
      environment: { ...DEV_MCP_ENV },
    };
  }

  return {
    type: 'local',
    enabled: true,
    command: ['/bin/sh', '-l', '-c', CHAIN_V1],
  };
}

export function isOwnManagedEntry(entry: unknown): boolean {
  if (typeof entry !== 'object' || entry === null) return false;
  const e = entry as Record<string, unknown>;
  if (Object.keys(e).length !== 2) return false;
  const canonical = buildManagedServerEntry({ mode: 'published' });
  const canonicalArgs = canonical.args;
  if (e.command !== canonical.command) return false;
  if (!Array.isArray(canonicalArgs) || !Array.isArray(e.args)) return false;
  if (e.args.length !== canonicalArgs.length) return false;
  return e.args.every((v, i) => v === canonicalArgs[i]);
}

interface AppSupportOptions {
  home?: string;
  platformName?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
}

function pathApiForPlatform(platformName: NodeJS.Platform) {
  return platformName === 'win32' ? win32 : posix;
}

export function resolveAppSupportPath(options: AppSupportOptions = {}): string {
  const platformName = options.platformName ?? process.platform;
  const home = options.home ?? homedir();
  const env = options.env ?? process.env;
  const pathApi = pathApiForPlatform(platformName);

  if (platformName === 'darwin') {
    return pathApi.join(home, 'Library', 'Application Support');
  }

  if (platformName === 'win32') {
    return env.APPDATA ?? pathApi.join(home, 'AppData', 'Roaming');
  }

  return env.XDG_CONFIG_HOME ?? pathApi.join(home, '.config');
}

export function resolveClaudeCodeConfigPath(options: AppSupportOptions = {}): string {
  const platformName = options.platformName ?? process.platform;
  const home = options.home ?? homedir();
  return pathApiForPlatform(platformName).join(home, '.claude.json');
}

export function resolveClaudeDesktopConfigPath(options: AppSupportOptions = {}): string {
  const platformName = options.platformName ?? process.platform;
  const home = options.home ?? homedir();
  const env = options.env ?? process.env;

  if (platformName === 'darwin') {
    return posix.join(
      home,
      'Library',
      'Application Support',
      'Claude',
      'claude_desktop_config.json',
    );
  }

  if (platformName === 'win32') {
    const appData = env.APPDATA ?? win32.join(home, 'AppData', 'Roaming');
    return win32.join(appData, 'Claude', 'claude_desktop_config.json');
  }

  throw new Error(`Claude Desktop is not available on ${platformName}. Supported: macOS, Windows.`);
}

export function resolveCursorConfigPath(options: AppSupportOptions = {}): string {
  const platformName = options.platformName ?? process.platform;
  const home = options.home ?? homedir();
  return pathApiForPlatform(platformName).join(home, '.cursor', 'mcp.json');
}

function resolveCodexHomePath(options: AppSupportOptions = {}): string {
  const platformName = options.platformName ?? process.platform;
  const home = options.home ?? homedir();
  const env = options.env ?? process.env;
  return env.CODEX_HOME ?? pathApiForPlatform(platformName).join(home, '.codex');
}

export function resolveCodexConfigPath(options: AppSupportOptions = {}): string {
  const platformName = options.platformName ?? process.platform;
  return pathApiForPlatform(platformName).join(resolveCodexHomePath(options), 'config.toml');
}

function resolveOpenCodeConfigDir(options: AppSupportOptions = {}): string {
  const platformName = options.platformName ?? process.platform;
  const home = options.home ?? homedir();
  const env = options.env ?? process.env;
  const pathApi = pathApiForPlatform(platformName);
  if (platformName === 'win32') {
    const appData = env.APPDATA ?? pathApi.join(home, 'AppData', 'Roaming');
    return pathApi.join(appData, 'opencode');
  }
  const xdgConfigHome = env.XDG_CONFIG_HOME ?? pathApi.join(home, '.config');
  return pathApi.join(xdgConfigHome, 'opencode');
}

export function resolveOpenCodeConfigPath(options: AppSupportOptions = {}): string {
  const platformName = options.platformName ?? process.platform;
  return pathApiForPlatform(platformName).join(resolveOpenCodeConfigDir(options), 'opencode.json');
}

export function resolveOpenClawConfigPath(options: AppSupportOptions = {}): string {
  const platformName = options.platformName ?? process.platform;
  const home = options.home ?? homedir();
  return pathApiForPlatform(platformName).join(home, '.openclaw', 'openclaw.json');
}

export interface EditorMcpTarget {
  id: EditorId;
  label: string;
  configPath: (cwd: string, home?: string) => string;
  format: 'json' | 'toml';
  topLevelKey: 'mcpServers' | 'servers' | 'mcp_servers' | 'mcp';
  serverMapSubKey?: string;
  offerOnlyWhenDetected?: boolean;
  serverName: (cwd: string) => string;
  buildEntry: (cwd: string, options?: McpInstallOptions) => Record<string, unknown>;
  scope: 'project' | 'global';
  detectPath?: (cwd: string, home?: string) => string;
  projectConfigPath?: (cwd: string) => string;
  projectSkillPath?: (cwd: string) => string;
}

export const EDITOR_TARGETS: Record<EditorId, EditorMcpTarget> = {
  claude: {
    id: 'claude',
    label: EDITOR_LABELS.claude,
    configPath: (_cwd, home) => resolveClaudeCodeConfigPath({ home }),
    format: 'json',
    topLevelKey: 'mcpServers',
    serverName: () => MCP_SERVER_NAME,
    buildEntry: (_cwd, options) => buildManagedServerEntry(options),
    scope: 'global',
    detectPath: (_cwd, home) => join(home ?? homedir(), '.claude'),
    projectConfigPath: (cwd) => join(cwd, '.mcp.json'),
    projectSkillPath: (cwd) => join(cwd, '.claude', 'skills', 'open-knowledge', 'SKILL.md'),
  },
  'claude-desktop': {
    id: 'claude-desktop',
    label: EDITOR_LABELS['claude-desktop'],
    configPath: (_cwd, home) => resolveClaudeDesktopConfigPath({ home }),
    format: 'json',
    topLevelKey: 'mcpServers',
    serverName: () => MCP_SERVER_NAME,
    buildEntry: (_cwd, options) => buildManagedServerEntry(options),
    scope: 'global',
    detectPath: (_cwd, home) => dirname(resolveClaudeDesktopConfigPath({ home })),
  },
  cursor: {
    id: 'cursor',
    label: EDITOR_LABELS.cursor,
    configPath: (_cwd, home) => resolveCursorConfigPath({ home }),
    format: 'json',
    topLevelKey: 'mcpServers',
    serverName: () => MCP_SERVER_NAME,
    buildEntry: (_cwd, options) => buildManagedServerEntry(options),
    scope: 'global',
    detectPath: (_cwd, home) => dirname(resolveCursorConfigPath({ home })),
    projectConfigPath: (cwd) => join(cwd, '.cursor', 'mcp.json'),
    projectSkillPath: (cwd) => join(cwd, '.cursor', 'skills', 'open-knowledge', 'SKILL.md'),
  },
  codex: {
    id: 'codex',
    label: EDITOR_LABELS.codex,
    configPath: (_cwd, home) => resolveCodexConfigPath({ home }),
    format: 'toml',
    topLevelKey: 'mcp_servers',
    serverName: () => MCP_SERVER_NAME,
    buildEntry: (_cwd, options) => buildManagedServerEntry(options),
    scope: 'global',
    detectPath: (_cwd, home) => dirname(resolveCodexConfigPath({ home })),
    projectConfigPath: (cwd) => join(cwd, '.codex', 'config.toml'),
    projectSkillPath: (cwd) => join(cwd, '.codex', 'skills', 'open-knowledge', 'SKILL.md'),
  },
  opencode: {
    id: 'opencode',
    label: EDITOR_LABELS.opencode,
    configPath: (_cwd, home) => resolveOpenCodeConfigPath({ home }),
    format: 'json',
    topLevelKey: 'mcp',
    serverName: () => MCP_SERVER_NAME,
    buildEntry: (_cwd, options) => buildOpenCodeEntry(options),
    scope: 'global',
    detectPath: (_cwd, home) => dirname(resolveOpenCodeConfigPath({ home })),
    projectConfigPath: (cwd) => join(cwd, 'opencode.json'),
    projectSkillPath: (cwd) => join(cwd, '.opencode', 'skills', 'open-knowledge', 'SKILL.md'),
  },
  openclaw: {
    id: 'openclaw',
    label: EDITOR_LABELS.openclaw,
    configPath: (_cwd, home) => resolveOpenClawConfigPath({ home }),
    format: 'json',
    topLevelKey: 'mcp',
    serverMapSubKey: 'servers',
    serverName: () => MCP_SERVER_NAME,
    buildEntry: (_cwd, options) => buildManagedServerEntry(options),
    scope: 'global',
    detectPath: (_cwd, home) => join(home ?? homedir(), '.openclaw'),
    offerOnlyWhenDetected: true,
  },
};

export function resolveEditorTargets(ids: EditorId[]): EditorMcpTarget[] {
  const unknown = ids.filter((id) => !Object.hasOwn(EDITOR_TARGETS, id));
  if (unknown.length > 0) {
    throw new Error(
      `Unknown editor(s): ${unknown.join(', ')}. Valid options: ${ALL_EDITOR_IDS.join(', ')}`,
    );
  }
  return ids.map((id) => EDITOR_TARGETS[id]);
}
