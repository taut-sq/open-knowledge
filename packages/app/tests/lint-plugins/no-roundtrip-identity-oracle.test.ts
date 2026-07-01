
import { describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const REPO_ROOT = join(__dirname, '..', '..', '..', '..');
const FIXTURE_REL = 'biome-plugins/__fixtures__/no-roundtrip-identity-oracle.fixture.tsx';
const PLUGIN_REL = './biome-plugins/no-roundtrip-identity-oracle.grit';

describe('no-roundtrip-identity-oracle GritQL plugin', () => {
  test('fires on exactly 10 byte-identity oracle assertions (and on no negative case)', () => {
    const result = spawnSync('bunx', ['biome', 'check', FIXTURE_REL], {
      cwd: REPO_ROOT,
      encoding: 'utf-8',
    });
    expect(result.error).toBeUndefined();
    expect(result.status).not.toBe(0);
    const output = `${result.stdout}\n${result.stderr}`;
    const fires = (output.match(/Byte-fidelity round-trip oracle in a public test/g) ?? []).length;
    expect(fires).toBe(10);
    expect(output).toContain('assert a fixed expected literal for a specific contract');
    expect(output).toMatch(/https?:\/\/[^\s]+/);
    expect(output).toContain('biome-plugins/README.md#no-roundtrip-identity-oraclegrit');
  });

  test('plugin is registered as an override scoped to the public test surface (not workspace-wide)', () => {
    const config = require(join(REPO_ROOT, 'biome.jsonc'));
    const rootPlugins: string[] = config.plugins ?? [];
    expect(rootPlugins).not.toContain(PLUGIN_REL);

    const overrides: Array<{ includes?: string[]; plugins?: string[] }> = config.overrides ?? [];
    const entry = overrides.find((o) => (o.plugins ?? []).includes(PLUGIN_REL));
    expect(entry).toBeDefined();
    const includes = entry?.includes ?? [];
    expect(includes).toContain(FIXTURE_REL);
    for (const excluded of [
      '!packages/md-conformance/**',
      '!packages/app/tests/fidelity/**',
      '!packages/core/src/markdown/**/*.test.ts',
      '!packages/core/src/bridge/**/*.test.ts',
      '!**/*.private.*',
    ]) {
      expect(includes).toContain(excluded);
    }
  });
});
