import { resolve } from 'node:path';
import simpleGit, { type SimpleGit, type SimpleGitOptions } from 'simple-git';

export { withParentLock } from './git-mutex.ts';

export interface RelayGhToken {
  token: string;
  host: string;
}

interface GitHandleOptions {
  credentialArgs?: string[];
  gitIndexFile?: string;
  ghToken?: RelayGhToken;
}

export interface GitHandle {
  git: SimpleGit;
  projectDir: string;
  credentialArgs: string[];
}

type CredentialHelperUnsafeGitOptions = SimpleGitOptions & {
  unsafe?: NonNullable<SimpleGitOptions['unsafe']> & {
    allowUnsafeCredentialHelper?: boolean;
  };
};

export function buildGitEnv(ghToken?: RelayGhToken): Record<string, string> {
  const env: Record<string, string> = { LANG: 'C', LC_ALL: 'C', GIT_TERMINAL_PROMPT: '0' };
  if (process.env.PATH !== undefined) {
    env.PATH = process.env.PATH;
  }
  if (process.env.ELECTRON_RUN_AS_NODE !== undefined) {
    env.ELECTRON_RUN_AS_NODE = process.env.ELECTRON_RUN_AS_NODE;
  }
  if (ghToken) {
    env.OK_GH_TOKEN = ghToken.token;
    env.OK_GH_TOKEN_HOST = ghToken.host;
  }
  return env;
}

export function createGitInstance(projectDir: string, options: GitHandleOptions = {}): GitHandle {
  const { credentialArgs = [], gitIndexFile, ghToken } = options;

  const env: Record<string, string | undefined> = buildGitEnv(ghToken);
  if (gitIndexFile) {
    env.GIT_INDEX_FILE = resolve(projectDir, gitIndexFile);
  }

  const gitConfig = credentialArgs.length >= 2 ? [credentialArgs[1]] : [];

  const gitOptions: Partial<CredentialHelperUnsafeGitOptions> = {
    baseDir: projectDir,
    config: gitConfig,
    unsafe: { allowUnsafeCredentialHelper: true },
  };

  const git = simpleGit(gitOptions as Partial<SimpleGitOptions>).env(env as Record<string, string>);

  return { git, projectDir, credentialArgs };
}
