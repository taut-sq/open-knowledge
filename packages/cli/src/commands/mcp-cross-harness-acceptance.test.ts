import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse as parseJsonc } from 'jsonc-parser';
import {
  createTomlConfigEngine,
  setTomlConfigEngineForTesting,
} from '../native/toml-config-engine.ts';
import { CHAIN_V1, EDITOR_TARGETS, type EditorId, type EditorMcpTarget } from './editors.ts';
import { writeEditorMcpConfig } from './init.ts';

const PUBLISHED_CHAIN_ENTRY = { command: '/bin/sh', args: ['-l', '-c', CHAIN_V1] };
const OPENCODE_ENTRY = {
  type: 'local',
  enabled: true,
  command: ['/bin/sh', '-l', '-c', CHAIN_V1],
};

function targetForFile(id: EditorId, configPath: string): EditorMcpTarget {
  return { ...EDITOR_TARGETS[id], configPath: () => configPath };
}

function write(id: EditorId, configPath: string) {
  return writeEditorMcpConfig(targetForFile(id, configPath), '', {
    mode: 'published',
    skipAvailabilityCheck: true,
  });
}

// biome-ignore lint/suspicious/noExplicitAny: structured nested access in tests.
function parseFor(id: EditorId, raw: string): any {
  if (EDITOR_TARGETS[id].format === 'toml') {
    const engine = createTomlConfigEngine();
    if (engine.backend !== 'native') {
      throw new Error('native toml_edit addon must be built for the cross-harness acceptance gate');
    }
    return engine.parseToObject(raw);
  }
  return parseJsonc(raw, [], { allowTrailingComma: true, disallowComments: false });
}

interface HarnessCase {
  id: EditorId;
  file: string;
  fixture: string;
  expectedEntry: Record<string, unknown>;
  comments: string[];
  byteContains?: string[];
}

const JSON_MCP_SERVERS_FIXTURE = `{
  "mcpServers": {
    "linear": { "command": "linear-cmd", "args": ["--stdio"] } // sibling note
  },
  "telemetry": false
}
`;

const CASES: HarnessCase[] = [
  {
    id: 'claude',
    file: 'config.json',
    fixture: JSON_MCP_SERVERS_FIXTURE,
    expectedEntry: PUBLISHED_CHAIN_ENTRY,
    comments: ['// dotfiles-managed config', '// sibling note', '/* trailing block comment */'],
  },
  {
    id: 'claude-desktop',
    file: 'config.json',
    fixture: JSON_MCP_SERVERS_FIXTURE,
    expectedEntry: PUBLISHED_CHAIN_ENTRY,
    comments: ['// dotfiles-managed config', '// sibling note', '/* trailing block comment */'],
  },
  {
    id: 'cursor',
    file: 'mcp.json',
    fixture: JSON_MCP_SERVERS_FIXTURE,
    expectedEntry: PUBLISHED_CHAIN_ENTRY,
    comments: ['// dotfiles-managed config', '// sibling note', '/* trailing block comment */'],
  },
  {
    id: 'opencode',
    file: 'opencode.json',
    fixture: `{
  "mcp": {
    "linear": { "type": "local", "enabled": true, "command": ["linear-cmd"] }
  },
  "theme": "dark"
}
`,
    expectedEntry: OPENCODE_ENTRY,
    comments: ['// opencode user config'],
  },
  {
    id: 'codex',
    file: 'config.toml',
    fixture: [
      '# my codex config — keep these comments',
      'model = "gpt-5"',
      'timeout = 30.0',
      'startup_timeout_ms = 9223372036854775807',
      'last_seen = 2026-06-26T12:34:56.123456Z',
      '',
      '[mcp_servers.linear]',
      'command = "linear-cmd"  # sibling note',
      '',
    ].join('\n'),
    expectedEntry: PUBLISHED_CHAIN_ENTRY,
    comments: ['# my codex config — keep these comments', 'command = "linear-cmd"  # sibling note'],
    byteContains: [
      'timeout = 30.0',
      'startup_timeout_ms = 9223372036854775807',
      'last_seen = 2026-06-26T12:34:56.123456Z',
    ],
  },
];

describe('cross-harness FR1 acceptance matrix', () => {
  let dir: string;

  beforeEach(() => {
    const engine = createTomlConfigEngine();
    if (engine.backend !== 'native') {
      throw new Error('native toml_edit addon must be built for the cross-harness acceptance gate');
    }
    setTomlConfigEngineForTesting(engine);
  });

  afterEach(() => {
    setTomlConfigEngineForTesting(null);
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  function tempFile(name: string): string {
    dir = mkdtempSync(join(tmpdir(), 'ok-acceptance-'));
    return join(dir, name);
  }

  for (const c of CASES) {
    it(`${c.id}: only OK's entry changes — everything else is data-identical`, () => {
      const configPath = tempFile(c.file);
      writeFileSync(configPath, c.fixture);

      const result = write(c.id, configPath);
      expect(result.action).toBe('written');

      const after = readFileSync(configPath, 'utf-8');

      for (const cm of c.comments) expect(after).toContain(cm);
      for (const b of c.byteContains ?? []) expect(after).toContain(b);

      const beforeData = parseFor(c.id, c.fixture);
      const afterData = parseFor(c.id, after);
      const key = EDITOR_TARGETS[c.id].topLevelKey;
      const container = afterData[key] as Record<string, unknown>;
      expect(container['open-knowledge']).toEqual(c.expectedEntry);
      delete container['open-knowledge'];
      expect(afterData).toEqual(beforeData);

      expect(readdirSync(dir).some((n) => n.includes('.broken-'))).toBe(false);
    });
  }

  it('codex: preserves a leading BOM and CRLF line endings while adding only our entry', () => {
    const configPath = tempFile('config.toml');
    const original =
      '\uFEFF# bom+crlf config\r\nmodel = "gpt-5"\r\n\r\n[mcp_servers.other]\r\ncommand = "node"\r\n';
    writeFileSync(configPath, original);

    const result = write('codex', configPath);
    expect(result.action).toBe('written');

    const after = readFileSync(configPath, 'utf-8');
    expect(after.charCodeAt(0)).toBe(0xfeff);
    expect(after.replace(/\r\n/g, '')).not.toContain('\n');
    expect(after).toContain('# bom+crlf config');

    const parsed = parseFor('codex', after);
    expect(parsed.mcp_servers.other).toEqual({ command: 'node' });
    expect(parsed.mcp_servers['open-knowledge']).toEqual(PUBLISHED_CHAIN_ENTRY);
  });

  it('claude: preserves a leading BOM on a JSON harness', () => {
    const configPath = tempFile('config.json');
    const original = '\uFEFF{\n  // keep me\n  "mcpServers": {}\n}\n';
    writeFileSync(configPath, original);

    const result = write('claude', configPath);
    expect(result.action).toBe('written');

    const after = readFileSync(configPath, 'utf-8');
    expect(after.charCodeAt(0)).toBe(0xfeff);
    expect(after).toContain('// keep me');
    expect(
      (parseFor('claude', after).mcpServers as Record<string, unknown>)['open-knowledge'],
    ).toEqual(PUBLISHED_CHAIN_ENTRY);
  });
});

describe('surgical-text-splice counterfactual guard', () => {
  let dir: string;

  beforeEach(() => {
    const engine = createTomlConfigEngine();
    if (engine.backend !== 'native') {
      throw new Error('native toml_edit addon must be built for the counterfactual guard');
    }
    setTomlConfigEngineForTesting(engine);
  });

  afterEach(() => {
    setTomlConfigEngineForTesting(null);
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  function tempFile(name: string): string {
    dir = mkdtempSync(join(tmpdir(), 'ok-counterfactual-'));
    return join(dir, name);
  }

  it('inline-table own-entry: updates in place, never appends a duplicate header', () => {
    const configPath = tempFile('config.toml');
    const original = [
      '# codex with an inline OK entry',
      'model = "gpt-5"',
      'mcp_servers.open-knowledge = { command = "STALE", args = ["old"] }',
      '',
      '[mcp_servers.linear]',
      'command = "linear-cmd"  # keep',
      '',
    ].join('\n');
    writeFileSync(configPath, original);

    const result = write('codex', configPath);
    expect(result.action).toBe('overwritten');

    const after = readFileSync(configPath, 'utf-8');
    const engine = createTomlConfigEngine();
    if (engine.backend !== 'native') throw new Error('native addon required');
    const parsed = engine.parseToObject(after) as { mcp_servers: Record<string, unknown> };
    expect(after).not.toContain('STALE');
    expect(parsed.mcp_servers['open-knowledge']).toEqual(PUBLISHED_CHAIN_ENTRY);
    expect(parsed.mcp_servers.linear).toEqual({ command: 'linear-cmd' });
  });

  it('dotted-key form: inserts our entry without deleting sibling servers or root keys', () => {
    const configPath = tempFile('config.toml');
    const original = [
      '# codex with dotted-key servers',
      'model = "gpt-5"',
      'profile.name = "default"',
      'mcp_servers.linear = { command = "linear-cmd", args = ["--stdio"] }',
      'mcp_servers.github = { command = "gh-cmd" }',
      '',
    ].join('\n');
    writeFileSync(configPath, original);

    const result = write('codex', configPath);
    expect(result.action).toBe('written');

    const after = readFileSync(configPath, 'utf-8');
    const engine = createTomlConfigEngine();
    if (engine.backend !== 'native') throw new Error('native addon required');
    // biome-ignore lint/suspicious/noExplicitAny: structured nested access in tests.
    const parsed = engine.parseToObject(after) as any;
    expect(parsed.model).toBe('gpt-5');
    expect(parsed.profile).toEqual({ name: 'default' });
    expect(parsed.mcp_servers.linear).toEqual({ command: 'linear-cmd', args: ['--stdio'] });
    expect(parsed.mcp_servers.github).toEqual({ command: 'gh-cmd' });
    expect(parsed.mcp_servers['open-knowledge']).toEqual(PUBLISHED_CHAIN_ENTRY);
  });
});

describe('decline carries no config contents', () => {
  let dir: string;
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });
  function tempFile(name: string): string {
    dir = mkdtempSync(join(tmpdir(), 'ok-decline-'));
    return join(dir, name);
  }

  it('declines an unparseable present config and the result leaks none of its bytes', () => {
    const configPath = tempFile('config.json');
    const secret = 'SUPER_SECRET_TOKEN_xyz';
    writeFileSync(configPath, `{ "mcpServers": { "a": "${secret}" `);

    const result = write('claude', configPath);
    expect(result.action).toBe('declined');
    expect(result.declineReason).toBe('unparseable');
    expect(readFileSync(configPath, 'utf-8')).toContain(secret);
    expect(JSON.stringify(result)).not.toContain(secret);
  });
});
