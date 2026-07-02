export type EditorId = 'claude' | 'claude-desktop' | 'cursor' | 'codex' | 'opencode' | 'openclaw';

export const ALL_EDITOR_IDS = [
  'claude',
  'claude-desktop',
  'cursor',
  'codex',
  'opencode',
  'openclaw',
] as const satisfies readonly EditorId[];

export const EDITOR_LABELS = {
  claude: 'Claude',
  'claude-desktop': 'Claude Desktop',
  cursor: 'Cursor',
  codex: 'Codex',
  opencode: 'OpenCode',
  openclaw: 'OpenClaw',
} as const satisfies Record<EditorId, string>;

/**
 * Project-relative skills root per editor (POSIX, `cwd`-relative), or `null`
 * for an editor with no project skill surface (Claude Desktop reads
 * user-global skills only). Authored skills project to `<root>/<name>/`; OK's
 * shipped bundle lives at `<root>/open-knowledge/`. Single source for the
 * install-projection fan-out (`skill-projection.ts`) AND the sharing-mode
 * exclude (`getOkArtifactPaths`), so both stay in lock-step.
 *
 * Each editor installs into its OWN primary skills dir so "install on Codex
 * only" is honest. Codex's is `.codex/skills` (alongside its `.codex/config.toml`
 * MCP path).
 *
 * Why per-editor and NOT a shared `.agents/skills` broadcast at project scope:
 * `.agents/skills` was Codex's old shared path and conflated Cursor+Codex. At
 * project scope there is no shared convergence point — each harness reads its
 * OWN dir (Claude → `.claude/skills`, Cursor → `.cursor/skills`, …) — so
 * projecting a project skill into `.agents/skills` would
 *   (a) HIDE it from harnesses that don't read `.agents` (Claude, Cursor),
 *   (b) DOUBLE-LOAD it for ones that read both their dir AND `.agents` (OpenCode
 *       reads `.opencode/skills` natively AND `.agents/skills`) → duplicate /
 *       name-collision (the `<name>-<editor>` churn class), and
 *   (c) CLOBBER the symlink where `.codex`/`.cursor` symlink to `.agents`.
 * The per-editor fan-out already reaches every harness OK supports, so `.agents`
 * adds NO reach at project scope — only conflation. A genuinely new harness that
 * adopts the vendor-neutral `.agents/` convention is onboarded by adding it to
 * this map (one line; flows to every dependent + lock-step test), NOT by
 * broadcasting into a shared dir.
 *
 * The asymmetry with USER/global scope is deliberate: `~/.agents/skills` IS the
 * right hub there, because the `skills` CLI fans the bundled discovery skill out
 * from it via `--agent '*'` (see `skill-install.ts`) — a shared convergence
 * point that exists globally but has no per-project equivalent.
 *
 * The CLI's `EDITOR_TARGETS.projectSkillPath` is a second source for the same
 * map and must move in lock-step.
 */
export const EDITOR_PROJECT_SKILL_ROOT = {
  claude: '.claude/skills',
  'claude-desktop': null,
  cursor: '.cursor/skills',
  codex: '.codex/skills',
  opencode: '.opencode/skills',
  openclaw: null,
} as const satisfies Record<EditorId, string | null>;

export const PROJECT_SKILL_EDITOR_IDS = ALL_EDITOR_IDS.filter(
  (id) => EDITOR_PROJECT_SKILL_ROOT[id] !== null,
);

export const HOSTS_WITH_USER_SKILL_DIR: ReadonlyArray<{
  readonly hostDir: string;
  readonly editorId: EditorId;
}> = PROJECT_SKILL_EDITOR_IDS.map((editorId) => ({
  hostDir: (EDITOR_PROJECT_SKILL_ROOT[editorId] ?? '').split('/')[0],
  editorId,
}));

export const EDITOR_PROJECT_CONFIG_PATH = {
  claude: '.mcp.json',
  'claude-desktop': null,
  cursor: '.cursor/mcp.json',
  codex: '.codex/config.toml',
  opencode: 'opencode.json',
  openclaw: null,
} as const satisfies Record<EditorId, string | null>;
