import type { SpawnOptions } from 'node:child_process';
import { posix as pathPosix, win32 as pathWin32 } from 'node:path';
import { resolveHelperBundleBinary } from '@inkeep/open-knowledge-core/helper-bundle';
import { fallbackPaths } from '@inkeep/open-knowledge-server';

export interface ResolveDetachedSpawnArgsInput {
  readonly platform: NodeJS.Platform;
  readonly isPackaged: boolean;
  readonly parentExecPath: string;
  readonly bundleCliMjsPath: string;
  readonly reactShellDistDir: string;
  readonly contentDir: string;
  readonly spawnErrorLogFd: number;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly singleFile?: string;
  readonly projectDir?: string;
}

export interface ResolvedDetachedSpawnArgs {
  readonly file: string;
  readonly args: readonly string[];
  readonly opts: SpawnOptions;
}

function platformPathDelimiter(platform: NodeJS.Platform): string {
  return platform === 'win32' ? ';' : ':';
}

function gitEnrichmentDirs(platform: NodeJS.Platform): readonly string[] {
  const dn = platform === 'win32' ? pathWin32.dirname : pathPosix.dirname;
  return fallbackPaths(platform).map((p) => dn(p));
}

function buildEnrichedPath(platform: NodeJS.Platform, currentPath: string | undefined): string {
  const delimiter = platformPathDelimiter(platform);
  const dirs = gitEnrichmentDirs(platform);
  const currentSegments = (currentPath ?? '').split(delimiter).filter(Boolean);
  const seen = new Set<string>();
  const result: string[] = [];
  for (const seg of dirs) {
    if (!seen.has(seg)) {
      seen.add(seg);
      result.push(seg);
    }
  }
  for (const seg of currentSegments) {
    if (!seen.has(seg)) {
      seen.add(seg);
      result.push(seg);
    }
  }
  return result.join(delimiter);
}

export function resolveDetachedSpawnArgs(
  input: ResolveDetachedSpawnArgsInput,
): ResolvedDetachedSpawnArgs {
  const {
    platform,
    isPackaged,
    parentExecPath,
    bundleCliMjsPath,
    reactShellDistDir,
    contentDir,
    spawnErrorLogFd,
    env,
    singleFile,
    projectDir,
  } = input;

  const file =
    platform === 'darwin' && isPackaged
      ? resolveHelperBundleBinary(parentExecPath)
      : parentExecPath;

  const projectRoot = projectDir ?? contentDir;
  const args = [
    bundleCliMjsPath,
    'start',
    '--serve-content-assets',
    '--react-shell-dist-dir',
    reactShellDistDir,
    ...(singleFile !== undefined
      ? ['--single-file', singleFile, '--project-dir', projectRoot]
      : []),
  ];

  const opts: SpawnOptions = {
    env: {
      ...env,
      PATH: buildEnrichedPath(platform, env.PATH),
      ELECTRON_RUN_AS_NODE: '1',
      OK_LOCK_KIND: 'interactive',
    },
    detached: true,
    stdio: ['ignore', 'ignore', spawnErrorLogFd],
    cwd: projectRoot,
  };

  return { file, args, opts };
}
