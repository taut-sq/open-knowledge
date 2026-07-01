
import { describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO_ROOT = join(__dirname, '..', '..', '..', '..');
const FIXTURE_REL = 'biome-plugins/__fixtures__/no-inline-tolerance-class.fixture.tsx';
const PLUGIN_REL = './biome-plugins/no-inline-tolerance-class.grit';
const GRIT_ABS = join(REPO_ROOT, 'biome-plugins/no-inline-tolerance-class.grit');
const CATALOG_SOURCE_ABS = join(REPO_ROOT, 'packages/core/src/bridge/normalize.ts');

describe('no-inline-tolerance-class GritQL plugin', () => {
  test('fires on exactly 8 inline fidelity-class literals (and on no negative case)', () => {
    const result = spawnSync('bunx', ['biome', 'check', FIXTURE_REL], {
      cwd: REPO_ROOT,
      encoding: 'utf-8',
    });
    expect(result.error).toBeUndefined();
    expect(result.status).not.toBe(0);
    const output = `${result.stdout}\n${result.stderr}`;
    const fires = (output.match(/Inline bridge normalization-class value in a public test/g) ?? [])
      .length;
    expect(fires).toBe(8);
    expect(output).toContain('hard-coding a BRIDGE_TOLERANCE_CLASSES label');
    expect(output).toMatch(/https?:\/\/[^\s]+/);
    expect(output).toContain('biome-plugins/README.md#no-inline-tolerance-classgrit');
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

  test('matched fidelity set + universal-encoding set partition BRIDGE_TOLERANCE_CLASSES', () => {
    const UNIVERSAL_ENCODING = ['bom', 'crlf', 'trailing-whitespace', 'trailing-newline'];

    const catalogSrc = readFileSync(CATALOG_SOURCE_ABS, 'utf-8');
    const arrayBody = catalogSrc.match(/BRIDGE_TOLERANCE_CLASSES\s*=\s*\[([\s\S]*?)\]/)?.[1];
    expect(arrayBody).toBeDefined();
    const catalog = [...(arrayBody ?? '').matchAll(/'([^']+)'/g)].map((m) => m[1]).sort();
    expect(catalog.length).toBeGreaterThan(0);

    const gritArms = readFileSync(GRIT_ABS, 'utf-8')
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('//'))
      .join('\n');
    const matched = [...gritArms.matchAll(/`'([^']+)'`/g)].map((m) => m[1]).sort();

    expect(matched.filter((c) => UNIVERSAL_ENCODING.includes(c))).toEqual([]);
    const union = [...new Set([...matched, ...UNIVERSAL_ENCODING])].sort();
    expect(union).toEqual(catalog);
  });
});
