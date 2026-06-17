import { afterEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  isTerminalConsented,
  isTerminalConsentedWithGrace,
} from '../../src/main/terminal-consent.ts';


const created: string[] = [];

function makeProject(localConfigYaml: string | null): string {
  const projectDir = mkdtempSync(join(tmpdir(), 'ok-terminal-consent-'));
  created.push(projectDir);
  if (localConfigYaml !== null) {
    const localDir = join(projectDir, '.ok', 'local');
    mkdirSync(localDir, { recursive: true });
    writeFileSync(join(localDir, 'config.yml'), localConfigYaml, 'utf-8');
  }
  return projectDir;
}

function writeLocalConfig(projectDir: string, yaml: string): void {
  const localDir = join(projectDir, '.ok', 'local');
  mkdirSync(localDir, { recursive: true });
  writeFileSync(join(localDir, 'config.yml'), yaml, 'utf-8');
}

afterEach(() => {
  for (const dir of created.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('isTerminalConsented', () => {
  test('true only when terminal.enabled is explicitly true', () => {
    expect(isTerminalConsented(makeProject('terminal:\n  enabled: true\n'))).toBe(true);
  });

  test('false when terminal.enabled is false (revoked)', () => {
    expect(isTerminalConsented(makeProject('terminal:\n  enabled: false\n'))).toBe(false);
  });

  test('false when the leaf is absent (never consented)', () => {
    expect(isTerminalConsented(makeProject('git:\n  autoSync:\n    enabled: true\n'))).toBe(false);
  });

  test('false when the project-local config file is missing', () => {
    expect(isTerminalConsented(makeProject(null))).toBe(false);
  });

  test('false on malformed YAML rather than throwing or defaulting permissive', () => {
    expect(isTerminalConsented(makeProject('terminal: {{{ not yaml'))).toBe(false);
  });

  test('false when terminal.enabled is a truthy non-boolean (only literal true grants)', () => {
    expect(isTerminalConsented(makeProject('terminal:\n  enabled: "true"\n'))).toBe(false);
  });
});

describe('isTerminalConsentedWithGrace', () => {
  test('resolves true immediately when consent is already on disk', async () => {
    const projectDir = makeProject('terminal:\n  enabled: true\n');
    expect(await isTerminalConsentedWithGrace(projectDir, { timeoutMs: 300, intervalMs: 20 })).toBe(
      true,
    );
  });

  test('resolves true once a grant lands partway through the grace window', async () => {
    const projectDir = makeProject(null);
    setTimeout(() => writeLocalConfig(projectDir, 'terminal:\n  enabled: true\n'), 120);
    expect(await isTerminalConsentedWithGrace(projectDir, { timeoutMs: 750, intervalMs: 25 })).toBe(
      true,
    );
  });

  test('resolves false when the config file stays absent through the window', async () => {
    const projectDir = makeProject(null);
    expect(await isTerminalConsentedWithGrace(projectDir, { timeoutMs: 200, intervalMs: 25 })).toBe(
      false,
    );
  });

  test('resolves false when the leaf stays false (revoked) through the window', async () => {
    const projectDir = makeProject('terminal:\n  enabled: false\n');
    expect(await isTerminalConsentedWithGrace(projectDir, { timeoutMs: 200, intervalMs: 25 })).toBe(
      false,
    );
  });
});
