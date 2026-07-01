import { describe, expect, test } from 'bun:test';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';


const __dirname = dirname(fileURLToPath(import.meta.url));
const desktopRoot = resolve(__dirname, '../..');
const builderYml = resolve(desktopRoot, 'electron-builder.yml');
const tsdownConfig = resolve(desktopRoot, '..', 'cli', 'tsdown.config.ts');
const okRoot = resolve(desktopRoot, '..', '..');

const KNOWN_UNCOVERED: Record<string, string> = {
  '@parcel/watcher': 'degrades to chokidar fallback; transitive runtime deps tracked as follow-up',
};

function readNeverBundle(): string[] {
  try {
    const src = readFileSync(tsdownConfig, 'utf8');
    const m = /neverBundle:\s*\[([^\]]*)\]/.exec(src);
    if (!m) return [];
    return [...m[1].matchAll(/['"]([^'"]+)['"]/g)].map((x) => x[1] as string);
  } catch {
    return [];
  }
}

function readExtraResourceTargets(): string[] {
  try {
    const cfg = parse(readFileSync(builderYml, 'utf8')) as {
      extraResources?: Array<{ to?: string }>;
    };
    return (cfg.extraResources ?? []).map((r) => r.to ?? '').filter(Boolean);
  } catch {
    return [];
  }
}

type ExtraResourceRule = { from?: string; to?: string; filter?: string[] | string };

function readExtraResources(): ExtraResourceRule[] {
  try {
    const cfg = parse(readFileSync(builderYml, 'utf8')) as { extraResources?: ExtraResourceRule[] };
    return cfg.extraResources ?? [];
  } catch {
    return [];
  }
}

function readAsarUnpack(): string[] {
  try {
    const cfg = parse(readFileSync(builderYml, 'utf8')) as { asarUnpack?: string[] };
    return cfg.asarUnpack ?? [];
  } catch {
    return [];
  }
}

function asFilterList(filter: string[] | string | undefined): string[] {
  if (Array.isArray(filter)) return filter;
  return filter ? [filter] : [];
}

describe('bundled CLI can resolve tsdown neverBundle native addons', () => {
  const neverBundle = readNeverBundle();
  const targets = readExtraResourceTargets();

  test('neverBundle list + electron-builder.yml parsed (premise check)', () => {
    expect(existsSync(builderYml)).toBe(true);
    expect(existsSync(tsdownConfig)).toBe(true);
    expect(neverBundle.length).toBeGreaterThan(0);
  });

  for (const pkg of neverBundle) {
    test(`'${pkg}' is shipped to cli/node_modules or explicitly allowlisted`, () => {
      const shipped = targets.includes(`cli/node_modules/${pkg}`);
      const allowlisted = pkg in KNOWN_UNCOVERED;
      expect(
        shipped || allowlisted,
        `tsdown keeps '${pkg}' external (neverBundle) but electron-builder.yml ships ` +
          `no 'cli/node_modules/${pkg}' copy rule. The bundled CLI cannot resolve it ` +
          `from cli/dist/ → ERR_MODULE_NOT_FOUND. Add an extraResources rule copying ` +
          `it (and its platform binary) into cli/node_modules/, or add it to ` +
          `KNOWN_UNCOVERED with a rationale.`,
      ).toBe(true);
    });
  }

  test("'@napi-rs/keyring' ships the wrapper AND an arm64 platform binary", () => {
    expect(targets).toContain('cli/node_modules/@napi-rs/keyring');
    const hasPlatform = targets.some((t) => t === 'cli/node_modules/@napi-rs/keyring-darwin-arm64');
    expect(
      hasPlatform,
      "Ship '@napi-rs/keyring-darwin-arm64' into cli/node_modules — the wrapper " +
        'requires its platform binary sibling at runtime.',
    ).toBe(true);
  });

  test('keyring copy sources exist at the hoisted root node_modules', () => {
    expect(existsSync(resolve(okRoot, 'node_modules', '@napi-rs', 'keyring'))).toBe(true);
    if (process.platform === 'darwin' && process.arch === 'arm64') {
      expect(existsSync(resolve(okRoot, 'node_modules', '@napi-rs', 'keyring-darwin-arm64'))).toBe(
        true,
      );
    }
  });
});

describe('@inkeep/open-knowledge-native-config ships its napi loader + platform binary', () => {
  const NATIVE_CONFIG = '@inkeep/open-knowledge-native-config';
  const nativeConfigDir = resolve(desktopRoot, '..', 'native-config');

  test('an extraResources rule copies the addon into cli/node_modules shipping loader AND binary', () => {
    const rule = readExtraResources().find((r) => r.to === `cli/node_modules/${NATIVE_CONFIG}`);
    expect(
      rule,
      `electron-builder.yml has no extraResources rule copying ${NATIVE_CONFIG} into ` +
        'cli/node_modules. The bundled CLI cannot resolve the toml_edit addon from ' +
        'cli/dist/ → the Codex TOML write degrades to a non-destructive decline.',
    ).toBeDefined();
    const filter = asFilterList(rule?.filter);
    expect(filter).toContain('index.js');
    expect(
      filter.includes('*.node'),
      `The ${NATIVE_CONFIG} extraResources filter must include '*.node' — without the ` +
        "platform binary the loader is shipped but require('./<binary>.node') throws.",
    ).toBe(true);
  });

  test('asarUnpack unpacks the addon for the in-process desktop main consumer', () => {
    expect(readAsarUnpack()).toContain(`**/${NATIVE_CONFIG}/**`);
  });

  test('the addon source dir exists at the extraResources `from` path', () => {
    expect(existsSync(nativeConfigDir)).toBe(true);
    expect(existsSync(resolve(nativeConfigDir, 'package.json'))).toBe(true);
  });

  test('the napi-built loader + a platform binary exist after a build', () => {
    const loader = resolve(nativeConfigDir, 'index.js');
    const nodeBinaries = existsSync(nativeConfigDir)
      ? readdirSync(nativeConfigDir).filter((f) => f.endsWith('.node'))
      : [];
    if (!existsSync(loader) || nodeBinaries.length === 0) {
      console.warn(
        `[electron-builder-cli-native-deps] SKIP: ${NATIVE_CONFIG} not built ` +
          `(no index.js / *.node in ${nativeConfigDir}). Run \`bun run build\` first; ` +
          'the gate builds it upstream of this tier.',
      );
      return;
    }
    expect(nodeBinaries.length).toBeGreaterThan(0);
    if (process.platform === 'darwin' && process.arch === 'arm64') {
      expect(nodeBinaries).toContain('native-config.darwin-arm64.node');
    }
  });
});

describe('@inkeep/open-knowledge-native-config ships bundled in cli/dist/native', () => {
  const cliDist = resolve(desktopRoot, '..', 'cli', 'dist');

  test('the cli/dist extraResources rule does not filter out the native bundle', () => {
    const rule = readExtraResources().find((r) => r.to === 'cli/dist');
    expect(
      rule,
      'electron-builder.yml must copy ../cli/dist into the packaged app so the ' +
        'bundled native-config (cli/dist/native) reaches the spawned CLI subprocess.',
    ).toBeDefined();
    const filter = asFilterList(rule?.filter);
    expect(filter).toContain('**/*');
    for (const excluded of ['!**/*.node', '!**/*.js', '!**/package.json', '!**/native/**']) {
      expect(
        filter.includes(excluded),
        `the cli/dist filter must not exclude '${excluded}' — it would strip the bundled addon.`,
      ).toBe(false);
    }
  });

  test('the bundled loader + platform binary exist in cli/dist/native after a build', () => {
    const nativeBundle = resolve(cliDist, 'native');
    const loader = resolve(nativeBundle, 'index.js');
    const pkgJson = resolve(nativeBundle, 'package.json');
    const nodeBinaries = existsSync(nativeBundle)
      ? readdirSync(nativeBundle).filter((f) => f.endsWith('.node'))
      : [];
    if (!existsSync(loader) || nodeBinaries.length === 0) {
      console.warn(
        '[electron-builder-cli-native-deps] SKIP: cli/dist/native not built ' +
          `(no index.js / *.node in ${nativeBundle}). Run \`bun run build\` first.`,
      );
      return;
    }
    expect(existsSync(pkgJson)).toBe(true);
    expect(nodeBinaries.length).toBeGreaterThan(0);
  });
});
