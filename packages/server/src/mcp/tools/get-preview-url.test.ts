
import { describe, expect, test } from 'bun:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveLockDir } from '../../config/paths.ts';
import { type Config, ConfigSchema } from '../../config/schema.ts';
import { readArmedPaneTarget } from '../../pane-target.ts';
import { register } from './get-preview-url.ts';
import { bindTestUiLock } from './preview-url-test-helpers.ts';
import type { ServerInstance } from './shared.ts';

const BASE_CONFIG: Config = ConfigSchema.parse({});
const CONFIG_AUTOOPEN_OFF: Config = ConfigSchema.parse({
  appearance: { preview: { autoOpen: false } },
});

interface ToolResult {
  content: Array<{ type: 'text'; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

type ToolHandler = (args: {
  docName?: string;
  folder?: string;
  armPaneTarget?: boolean;
  cwd?: string;
}) => Promise<ToolResult>;

function captureRegistration(cwd: string, config: Config = BASE_CONFIG): ToolHandler {
  let captured: ToolHandler | null = null;
  const server = {
    registerTool(_name: string, _config: unknown, handler: ToolHandler) {
      captured = handler;
    },
    tool() {
      throw new Error('legacy tool() should not be called by preview_url');
    },
  } as unknown as ServerInstance;
  register(server, {
    config,
    resolveCwd: async () => cwd,
  });
  if (!captured) throw new Error('tool not registered');
  return captured;
}

describe('preview_url tool — UI running', () => {
  test('with docName: composes baseUrl + the doc route', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'ok-get-preview-url-'));
    const uiBase = bindTestUiLock(cwd);
    const handler = captureRegistration(cwd);
    const result = await handler({ document: 'specs/foo/SPEC' });
    expect(result.isError).toBeUndefined();
    expect(result.structuredContent?.running).toBe(true);
    expect(result.structuredContent?.baseUrl).toBe(uiBase);
    expect(result.structuredContent?.url).toBe(`${uiBase}/#/specs/foo/SPEC`);
    expect(result.structuredContent?.autoOpen).toBe(true);
    expect(result.content[0]?.text).toContain(`${uiBase}/#/specs/foo/SPEC`);
  });

  test('with folder: composes the folder route with a trailing slash', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'ok-get-preview-url-'));
    const uiBase = bindTestUiLock(cwd);
    const handler = captureRegistration(cwd);
    const result = await handler({ folder: 'specs/foo' });
    expect(result.structuredContent?.url).toBe(`${uiBase}/#/specs/foo/`);
  });

  test('folder route tolerates surrounding slashes and per-segment encodes', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'ok-get-preview-url-'));
    const uiBase = bindTestUiLock(cwd);
    const handler = captureRegistration(cwd);
    const result = await handler({ folder: '/My Notes/sub/' });
    expect(result.structuredContent?.url).toBe(`${uiBase}/#/My%20Notes/sub/`);
  });

  test('armPaneTarget writes the doc route as a readable armed target', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'ok-get-preview-url-'));
    bindTestUiLock(cwd);
    const handler = captureRegistration(cwd);
    await handler({ document: 'specs/foo/SPEC', armPaneTarget: true });
    expect(readArmedPaneTarget(resolveLockDir(cwd))).toBe('#/specs/foo/SPEC');
  });

  test('without armPaneTarget: arms nothing (read-only)', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'ok-get-preview-url-'));
    bindTestUiLock(cwd);
    const handler = captureRegistration(cwd);
    await handler({ document: 'specs/foo/SPEC' });
    expect(readArmedPaneTarget(resolveLockDir(cwd))).toBeNull();
  });

  test('armPaneTarget with no docName/folder: arms nothing + surfaces a note', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'ok-get-preview-url-'));
    bindTestUiLock(cwd);
    const handler = captureRegistration(cwd);
    const result = await handler({ armPaneTarget: true });
    expect(readArmedPaneTarget(resolveLockDir(cwd))).toBeNull();
    expect(result.content[0]?.text).toContain('nothing was armed');
  });

  test('armPaneTarget with a folder arms the folder route', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'ok-get-preview-url-'));
    bindTestUiLock(cwd);
    const handler = captureRegistration(cwd);
    await handler({ folder: 'specs/foo', armPaneTarget: true });
    expect(readArmedPaneTarget(resolveLockDir(cwd))).toBe('#/specs/foo/');
  });

  test('docName + folder together is rejected (mutually exclusive)', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'ok-get-preview-url-'));
    bindTestUiLock(cwd);
    const handler = captureRegistration(cwd);
    const result = await handler({ document: 'specs/foo/SPEC', folder: 'specs/foo' });
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('mutually exclusive');
    expect(readArmedPaneTarget(resolveLockDir(cwd))).toBeNull();
  });

  test('without docName: returns the UI root URL', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'ok-get-preview-url-'));
    const uiBase = bindTestUiLock(cwd);
    const handler = captureRegistration(cwd);
    const result = await handler({});
    expect(result.isError).toBeUndefined();
    expect(result.structuredContent?.running).toBe(true);
    expect(result.structuredContent?.url).toBe(uiBase);
    expect(result.structuredContent?.baseUrl).toBe(uiBase);
    expect(result.structuredContent?.autoOpen).toBe(true);
  });

  test('per-segment encodes docName when composing the URL', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'ok-get-preview-url-'));
    const uiBase = bindTestUiLock(cwd);
    const handler = captureRegistration(cwd);
    const result = await handler({ document: 'notes/My Doc' });
    expect(result.structuredContent?.url).toBe(`${uiBase}/#/notes/My%20Doc`);
  });
});

describe('preview_url tool — no UI running', () => {
  test('returns running:false + null url when no ui.lock is present', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'ok-get-preview-url-'));
    const handler = captureRegistration(cwd);
    const result = await handler({ document: 'specs/foo/SPEC' });
    expect(result.isError).toBeUndefined();
    expect(result.structuredContent?.running).toBe(false);
    expect(result.structuredContent?.url).toBeNull();
    expect(result.structuredContent?.baseUrl).toBeNull();
    expect(result.structuredContent?.autoOpen).toBe(true);
    expect(result.content[0]?.text).toContain('No UI is running');
  });

  test('no-UI branch is the same regardless of docName', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'ok-get-preview-url-'));
    const handler = captureRegistration(cwd);
    const result = await handler({});
    expect(result.structuredContent?.running).toBe(false);
    expect(result.structuredContent?.url).toBeNull();
    expect(result.structuredContent?.autoOpen).toBe(true);
  });
});

describe('preview_url tool — autoOpen field', () => {
  test('echoes resolved autoOpen=false when the user has disabled it', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'ok-get-preview-url-'));
    bindTestUiLock(cwd);
    const handler = captureRegistration(cwd, CONFIG_AUTOOPEN_OFF);
    const result = await handler({ document: 'specs/foo/SPEC' });
    expect(result.isError).toBeUndefined();
    expect(result.structuredContent?.running).toBe(true);
    expect(result.structuredContent?.autoOpen).toBe(false);
  });

  test('echoes autoOpen=false when no UI is running', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'ok-get-preview-url-'));
    const handler = captureRegistration(cwd, CONFIG_AUTOOPEN_OFF);
    const result = await handler({});
    expect(result.structuredContent?.running).toBe(false);
    expect(result.structuredContent?.autoOpen).toBe(false);
  });

  test('reads config fresh per call (resolver invoked on every invocation)', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'ok-get-preview-url-'));
    bindTestUiLock(cwd);
    let currentAutoOpen = true;
    const configResolver = async (): Promise<Config> =>
      ConfigSchema.parse({ appearance: { preview: { autoOpen: currentAutoOpen } } });
    let captured: ToolHandler | null = null;
    const server = {
      registerTool(_name: string, _config: unknown, handler: ToolHandler) {
        captured = handler;
      },
      tool() {
        throw new Error('legacy tool() should not be called by preview_url');
      },
    } as unknown as ServerInstance;
    register(server, {
      config: configResolver,
      resolveCwd: async () => cwd,
    });
    if (!captured) throw new Error('tool not registered');
    const handler = captured as ToolHandler;

    const first = await handler({ document: 'foo' });
    expect(first.structuredContent?.autoOpen).toBe(true);

    currentAutoOpen = false;
    const second = await handler({ document: 'foo' });
    expect(second.structuredContent?.autoOpen).toBe(false);
  });
});

describe('preview_url tool — error path', () => {
  test('returns isError when resolveCwd rejects', async () => {
    let captured: ToolHandler | undefined;
    const server = {
      registerTool(_name: string, _config: unknown, handler: ToolHandler) {
        captured = handler;
      },
      tool() {
        throw new Error('legacy tool() should not be called by preview_url');
      },
    } as unknown as ServerInstance;
    register(server, {
      config: BASE_CONFIG,
      resolveCwd: async () => {
        throw new Error('no roots configured');
      },
    });
    if (!captured) throw new Error('tool not registered');
    const result = await captured({ document: 'specs/foo/SPEC' });
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('no roots configured');
  });
});
