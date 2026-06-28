import { describe, expect, test } from 'bun:test';
import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  computePathLeg,
  type EnsureCliOnPathResult,
  ensureCliOnPath,
  pathInstallMarkerPath,
} from './path-install.ts';

const EXE = '/Applications/OpenKnowledge.app/Contents/MacOS/OpenKnowledge';
const WRAPPER = '/Applications/OpenKnowledge.app/Contents/Resources/cli/bin/ok.sh';

function home() {
  return mkdtempSync(join(tmpdir(), 'ok-path-install-'));
}

describe('ensureCliOnPath', () => {
  test('installs canonical ~/.ok/bin links, env shim, zsh rc block, and marker without admin prompt', async () => {
    const h = home();
    const result = await ensureCliOnPath({
      executablePath: EXE,
      isPackaged: true,
      platform: 'darwin',
      home: h,
      bundleVersion: '0.5.0-test',
      env: { HOME: h, SHELL: '/bin/zsh' },
      spawn: async () => ({ code: 0, stdout: `${h}/.ok/bin:/usr/bin`, stderr: '' }),
    });
    expect(result.status).toBe('installed');
    if (result.status === 'installed') expect(result.summary).toContain('~/.zshrc');
    expect(readlinkSync(join(h, '.ok', 'bin', 'ok'))).toBe(WRAPPER);
    expect(readlinkSync(join(h, '.ok', 'bin', 'open-knowledge'))).toBe(WRAPPER);
    expect(readFileSync(join(h, '.ok', 'env.sh'), 'utf8')).toContain(
      'export PATH="$' + '{HOME}/.ok/bin:$' + '{PATH}"',
    );
    const zshrc = readFileSync(join(h, '.zshrc'), 'utf8');
    expect(zshrc).toContain('# >>> open-knowledge cli >>>');
    expect(zshrc).toContain('Delete this whole block to opt out');
    expect(JSON.parse(readFileSync(pathInstallMarkerPath(h), 'utf8')).bundleWrapperPath).toBe(
      WRAPPER,
    );
  });

  test('healthy marker fast-path respects disk source of truth', async () => {
    const h = home();
    await ensureCliOnPath({
      executablePath: EXE,
      isPackaged: true,
      platform: 'darwin',
      home: h,
      bundleVersion: '0.5.0-test',
      env: { HOME: h, SHELL: '/bin/zsh' },
      spawn: async () => ({ code: 0, stdout: `${h}/.ok/bin`, stderr: '' }),
    });
    const healthy = await ensureCliOnPath({
      executablePath: EXE,
      isPackaged: true,
      platform: 'darwin',
      home: h,
      bundleVersion: '0.5.0-test',
      env: { HOME: h, SHELL: '/bin/zsh' },
      spawn: async () => ({ code: 0, stdout: `${h}/.ok/bin`, stderr: '' }),
    });
    expect(healthy.status).toBe('healthy-current');
    unlinkSync(join(h, '.ok', 'bin', 'ok'));
    const repaired = await ensureCliOnPath({
      executablePath: EXE,
      isPackaged: true,
      platform: 'darwin',
      home: h,
      bundleVersion: '0.5.0-test',
      env: { HOME: h, SHELL: '/bin/zsh' },
      spawn: async () => ({ code: 0, stdout: `${h}/.ok/bin`, stderr: '' }),
    });
    expect(repaired.status).toBe('installed-silent');
    expect(readlinkSync(join(h, '.ok', 'bin', 'ok'))).toBe(WRAPPER);
  });

  test('honors removal of the managed block — records opt-out, never re-adds, summary discloses', async () => {
    const h = home();
    const run = () =>
      ensureCliOnPath({
        executablePath: EXE,
        isPackaged: true,
        platform: 'darwin',
        home: h,
        bundleVersion: '0.5.0-test',
        env: { HOME: h, SHELL: '/bin/zsh' },
        spawn: async () => ({ code: 0, stdout: `${h}/.ok/bin:/usr/bin`, stderr: '' }),
      });
    const first = await run();
    expect(first.status).toBe('installed');
    expect(readFileSync(join(h, '.zshrc'), 'utf8')).toContain('# >>> open-knowledge cli >>>');
    if (first.status === 'installed') expect(first.summary).toContain('~/.zshrc');

    writeFileSync(join(h, '.zshrc'), 'export FOO=1\n');
    const second = await run();
    expect(second.status).toBe('installed');
    expect(readFileSync(join(h, '.zshrc'), 'utf8')).not.toContain('# >>> open-knowledge cli >>>');
    if (second.status === 'installed') expect(second.summary).toContain("won't be re-added");
    const marker = JSON.parse(readFileSync(pathInstallMarkerPath(h), 'utf8'));
    expect(marker.rcOptOuts).toEqual([join(h, '.zshrc')]);

    const third = await run();
    expect(third.status).toBe('healthy-current');
    expect(readFileSync(join(h, '.zshrc'), 'utf8')).not.toContain('# >>> open-knowledge cli >>>');
  });

  test('does not seed symlinks into other PATH dirs and pads the zshrc block with blank lines', async () => {
    const h = home();
    const bin = join(h, 'bin');
    mkdirSync(bin);
    writeFileSync(join(h, '.zshrc'), 'export FOO=1');
    const result = await ensureCliOnPath({
      executablePath: EXE,
      isPackaged: true,
      platform: 'darwin',
      home: h,
      bundleVersion: '0.5.0-test',
      env: { HOME: h, SHELL: '/bin/zsh' },
      spawn: async () => ({ code: 0, stdout: `${bin}:/usr/bin`, stderr: '' }),
    });
    expect(result.status).toBe('installed');
    expect(() => lstatSync(join(bin, 'ok'))).toThrow();
    expect(() => lstatSync(join(bin, 'open-knowledge'))).toThrow();
    const zshrc = readFileSync(join(h, '.zshrc'), 'utf8');
    expect(zshrc).toContain('export FOO=1\n\n# >>> open-knowledge cli >>>');
    expect(zshrc.endsWith('# <<< open-knowledge cli <<<\n\n')).toBe(true);
  });

  test('removes legacy marker-recorded extra symlinks, leaves re-pointed ones, retries failures', async () => {
    const h = home();
    const bin = join(h, 'bin');
    mkdirSync(bin);
    symlinkSync(WRAPPER, join(bin, 'ok'));
    symlinkSync('/elsewhere/ok.sh', join(bin, 'open-knowledge'));
    const markerPath = pathInstallMarkerPath(h);
    mkdirSync(dirname(markerPath), { recursive: true });
    const entry = (path: string) => ({
      path,
      target: WRAPPER,
      createdAt: '2026-05-01T00:00:00.000Z',
      kind: 'created' as const,
    });
    writeFileSync(
      markerPath,
      JSON.stringify({
        version: 1,
        installedAt: '2026-05-01T00:00:00.000Z',
        bundleVersion: '0.4.0',
        bundleWrapperPath: WRAPPER,
        binDir: join(h, '.ok', 'bin'),
        envShimPath: join(h, '.ok', 'env.sh'),
        rcFiles: [],
        pathDiscovery: null,
        extraSymlinks: [
          entry(join(bin, 'ok')),
          entry(join(bin, 'open-knowledge')),
          entry(join(bin, 'gone')),
        ],
      }),
    );
    const events: Array<Record<string, unknown>> = [];
    const result = await ensureCliOnPath({
      executablePath: EXE,
      isPackaged: true,
      platform: 'darwin',
      home: h,
      bundleVersion: '0.5.0-test',
      env: { HOME: h, SHELL: '/bin/zsh' },
      spawn: async () => ({ code: 0, stdout: `${h}/.ok/bin:/usr/bin`, stderr: '' }),
      logger: { event: (e) => events.push(e) },
    });
    expect(result.status).toBe('installed');
    if (result.status === 'installed') expect(result.summary).toContain('leftover ok symlink');
    expect(() => lstatSync(join(bin, 'ok'))).toThrow();
    expect(readlinkSync(join(bin, 'open-knowledge'))).toBe('/elsewhere/ok.sh');
    const marker = JSON.parse(readFileSync(markerPath, 'utf8'));
    expect(marker.extraSymlinks).toEqual([]);
    expect(events.some((e) => e.event === 'path-install-extra-symlink-removed')).toBe(true);
  });

  test('skips outside packaged darwin bundle contexts', async () => {
    const h = home();
    const base = {
      executablePath: EXE,
      isPackaged: true,
      platform: 'darwin',
      home: h,
      bundleVersion: '0.5.0-test',
      env: { HOME: h, SHELL: '/bin/zsh' },
      spawn: async () => ({ code: 0, stdout: '', stderr: '' }),
    };
    expect(await ensureCliOnPath({ ...base, reclaimDisableEnv: '1' })).toEqual({
      status: 'skipped',
      reason: 'reclaim-disabled',
    });
    expect(await ensureCliOnPath({ ...base, platform: 'linux' })).toEqual({
      status: 'skipped',
      reason: 'platform',
    });
    expect(await ensureCliOnPath({ ...base, isPackaged: false })).toEqual({
      status: 'skipped',
      reason: 'dev-mode',
    });
    expect(await ensureCliOnPath({ ...base, executablePath: '/usr/local/bin/electron' })).toEqual({
      status: 'skipped',
      reason: 'bad-executable-path',
    });
  });

  test('returns failed-all instead of throwing when an fs operation fails', async () => {
    const h = home();
    const enoent = () => Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    const result = await ensureCliOnPath({
      executablePath: EXE,
      isPackaged: true,
      platform: 'darwin',
      home: h,
      bundleVersion: '0.5.0-test',
      env: { HOME: h, SHELL: '/bin/zsh' },
      spawn: async () => ({ code: 0, stdout: `${h}/.ok/bin`, stderr: '' }),
      fs: {
        existsSync: () => false,
        readFileSync: () => '',
        writeFileSync: () => {},
        mkdirSync: () => {
          throw Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' });
        },
        unlinkSync: () => {},
        symlinkSync: () => {},
        renameSync: () => {},
        readlinkSync: () => {
          throw enoent();
        },
        lstatSync: () => {
          throw enoent();
        },
      },
      logger: { event: () => {} },
    });
    expect(result.status).toBe('failed-all');
    if (result.status === 'failed-all') expect(result.error).toContain('EACCES');
  });

  test('fish conf.d block uses fish syntax, not POSIX export', async () => {
    const h = home();
    await ensureCliOnPath({
      executablePath: EXE,
      isPackaged: true,
      platform: 'darwin',
      home: h,
      bundleVersion: '0.5.0-test',
      env: { HOME: h, SHELL: '/bin/zsh' },
      spawn: async () => ({ code: 0, stdout: `${h}/.ok/bin`, stderr: '' }),
    });
    const fish = readFileSync(join(h, '.config', 'fish', 'conf.d', 'open-knowledge.fish'), 'utf8');
    expect(fish).toContain('# >>> open-knowledge cli >>>');
    expect(fish).toContain('set -gx PATH');
    expect(fish).not.toContain('export PATH');
  });

  test('app update repoints canonical symlinks to the new bundle wrapper', async () => {
    const h = home();
    const opts = (exe: string) => ({
      executablePath: exe,
      isPackaged: true,
      platform: 'darwin',
      home: h,
      bundleVersion: '0.5.0-test',
      env: { HOME: h, SHELL: '/bin/zsh' },
      spawn: async () => ({ code: 0, stdout: `${h}/.ok/bin`, stderr: '' }),
    });
    await ensureCliOnPath(opts(EXE));
    const newExe = '/Users/someone/Applications/OpenKnowledge.app/Contents/MacOS/OpenKnowledge';
    const newWrapper =
      '/Users/someone/Applications/OpenKnowledge.app/Contents/Resources/cli/bin/ok.sh';
    const result = await ensureCliOnPath(opts(newExe));
    expect(result.status).toBe('installed-silent');
    expect(readlinkSync(join(h, '.ok', 'bin', 'ok'))).toBe(newWrapper);
    expect(readlinkSync(join(h, '.ok', 'bin', 'open-knowledge'))).toBe(newWrapper);
  });
});

describe('computePathLeg', () => {
  const marker = {} as Extract<EnsureCliOnPathResult, { status: 'installed' }>['marker'];

  test('installed → installed leg with its summary (the only success that toasts)', () => {
    expect(computePathLeg({ status: 'installed', marker, summary: 'Added ok to PATH.' })).toEqual({
      status: 'installed',
      summary: 'Added ok to PATH.',
    });
  });

  test('installed-silent → none (symlink-only repoint stays silent)', () => {
    expect(computePathLeg({ status: 'installed-silent', marker })).toEqual({ status: 'none' });
  });

  test('failed-all → failed leg carrying the error', () => {
    expect(computePathLeg({ status: 'failed-all', error: 'EACCES' })).toEqual({
      status: 'failed',
      summary: 'EACCES',
    });
  });

  test('skipped / healthy-current → none', () => {
    expect(computePathLeg({ status: 'skipped', reason: 'platform' })).toEqual({ status: 'none' });
    expect(computePathLeg({ status: 'healthy-current', marker })).toEqual({ status: 'none' });
  });
});
