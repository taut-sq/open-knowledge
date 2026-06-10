import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable, Writable } from 'node:stream';
import { FileBackend } from '../../auth/token-store.ts';
import { type CredentialGetLogContext, handleCredentialGet } from './git-credential.ts';


function makeStream(content: string): Readable {
  return Readable.from([Buffer.from(content, 'utf-8')]);
}

function makeOutput(): { writable: Writable; result: () => string } {
  const chunks: Buffer[] = [];
  const writable = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      chunks.push(chunk);
      callback();
    },
  });
  return {
    writable,
    result: () => Buffer.concat(chunks).toString('utf-8'),
  };
}

function makeStore(tmpDir: string) {
  return new FileBackend(join(tmpDir, 'auth.yml'));
}


describe('handleCredentialGet', () => {
  let tmpDir: string;
  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'ok-git-cred-test-'));
  });
  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test('returns credentials for stored host', async () => {
    const store = makeStore(tmpDir);
    await store.set('github.com', 'alice', 'gho_abc123');
    const input = makeStream('protocol=https\nhost=github.com\n\n');
    const { writable, result } = makeOutput();

    const code = await handleCredentialGet(input, writable, store);

    expect(code).toBe(0);
    expect(result()).toBe('username=alice\npassword=gho_abc123\n');
  });

  test('returns 1 when host not stored', async () => {
    const store = makeStore(tmpDir);
    const input = makeStream('protocol=https\nhost=github.com\n\n');
    const { writable, result } = makeOutput();

    const code = await handleCredentialGet(input, writable, store);

    expect(code).toBe(1);
    expect(result()).toBe('');
  });

  test('returns 1 when no host in input', async () => {
    const store = makeStore(tmpDir);
    await store.set('github.com', 'alice', 'gho_abc');
    const input = makeStream('protocol=https\n\n');
    const { writable, result } = makeOutput();

    const code = await handleCredentialGet(input, writable, store);

    expect(code).toBe(1);
    expect(result()).toBe('');
  });

  test('handles input without trailing blank line', async () => {
    const store = makeStore(tmpDir);
    await store.set('github.com', 'alice', 'gho_abc');
    const input = makeStream('protocol=https\nhost=github.com');
    const { writable, result } = makeOutput();

    const code = await handleCredentialGet(input, writable, store);

    expect(code).toBe(0);
    expect(result()).toBe('username=alice\npassword=gho_abc\n');
  });

  test('host-specific lookup — different host returns 1', async () => {
    const store = makeStore(tmpDir);
    await store.set('gitlab.com', 'bob', 'glpat_xyz');
    const input = makeStream('protocol=https\nhost=github.com\n\n');
    const { writable } = makeOutput();

    const code = await handleCredentialGet(input, writable, store);

    expect(code).toBe(1);
  });

  test('ignores extra input fields (path, username)', async () => {
    const store = makeStore(tmpDir);
    await store.set('github.com', 'alice', 'gho_abc');
    const input = makeStream(
      'protocol=https\nhost=github.com\nusername=irrelevant\npath=/org/repo\n\n',
    );
    const { writable, result } = makeOutput();

    const code = await handleCredentialGet(input, writable, store);

    expect(code).toBe(0);
    expect(result()).toBe('username=alice\npassword=gho_abc\n');
  });

  test('output format matches git credential protocol', async () => {
    const store = makeStore(tmpDir);
    await store.set('github.com', 'miles', 'gho_secret_token_123');
    const input = makeStream('protocol=https\nhost=github.com\n\n');
    const { writable, result } = makeOutput();

    await handleCredentialGet(input, writable, store);

    const lines = result().split('\n');
    expect(lines[0]).toBe('username=miles');
    expect(lines[1]).toBe('password=gho_secret_token_123');
    expect(lines[2]).toBe('');
  });
});


interface LogCall {
  level: 'debug' | 'warn';
  fields: Record<string, unknown>;
  msg: string;
}

function makeFakeLogger() {
  const calls: LogCall[] = [];
  const record = (level: 'debug' | 'warn') => (fields: Record<string, unknown>, msg: string) =>
    calls.push({ level, fields, msg });
  const logger = {
    debug: record('debug'),
    warn: record('warn'),
    info: () => {},
    error: () => {},
    fatal: () => {},
    trace: () => {},
  } as unknown as NonNullable<CredentialGetLogContext['log']>;
  return { logger, calls };
}

describe('handleCredentialGet diagnostic logging', () => {
  let tmpDir: string;
  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'ok-git-cred-log-'));
  });
  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test('logs found at debug with host/backend and never the token', async () => {
    const store = makeStore(tmpDir);
    await store.set('github.com', 'alice', 'gho_super_secret');
    const input = makeStream('protocol=https\nhost=github.com\n\n');
    const { writable } = makeOutput();
    const { logger, calls } = makeFakeLogger();

    const code = await handleCredentialGet(input, writable, store, { log: logger });

    expect(code).toBe(0);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.level).toBe('debug');
    expect(calls[0]?.fields).toMatchObject({
      host: 'github.com',
      outcome: 'found',
      backend: 'file',
    });
    expect(JSON.stringify(calls)).not.toContain('gho_super_secret');
  });

  test('logs absent at warn when no credential is stored', async () => {
    const store = makeStore(tmpDir);
    const input = makeStream('protocol=https\nhost=github.com\n\n');
    const { writable } = makeOutput();
    const { logger, calls } = makeFakeLogger();

    const code = await handleCredentialGet(input, writable, store, { log: logger });

    expect(code).toBe(1);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.level).toBe('warn');
    expect(calls[0]?.fields).toMatchObject({
      host: 'github.com',
      outcome: 'absent',
      backend: 'file',
    });
  });

  test('logs read-error at warn when the keychain read failed', async () => {
    const store = makeStore(tmpDir);
    const input = makeStream('protocol=https\nhost=github.com\n\n');
    const { writable } = makeOutput();
    const { logger, calls } = makeFakeLogger();

    const code = await handleCredentialGet(input, writable, store, {
      log: logger,
      getDiag: () => ({ kind: 'read-error', host: 'github.com', error: 'Error: denied' }),
    });

    expect(code).toBe(1);
    expect(calls[0]?.level).toBe('warn');
    expect(calls[0]?.fields).toMatchObject({
      host: 'github.com',
      outcome: 'read-error',
      keychainError: 'Error: denied',
    });
  });

  test('logs corrupt-entry at warn with a bytes-free keychainError', async () => {
    const store = makeStore(tmpDir);
    const input = makeStream('protocol=https\nhost=github.com\n\n');
    const { writable } = makeOutput();
    const { logger, calls } = makeFakeLogger();

    const code = await handleCredentialGet(input, writable, store, {
      log: logger,
      getDiag: () => ({ kind: 'corrupt-entry', host: 'github.com', error: 'corrupt-entry' }),
    });

    expect(code).toBe(1);
    expect(calls[0]?.level).toBe('warn');
    expect(calls[0]?.fields).toMatchObject({
      host: 'github.com',
      outcome: 'corrupt-entry',
      keychainError: 'corrupt-entry',
    });
  });

  test('logs no-host at warn when the request omits a host', async () => {
    const store = makeStore(tmpDir);
    const input = makeStream('protocol=https\n\n');
    const { writable } = makeOutput();
    const { logger, calls } = makeFakeLogger();

    const code = await handleCredentialGet(input, writable, store, { log: logger });

    expect(code).toBe(1);
    expect(calls[0]?.level).toBe('warn');
    expect(calls[0]?.fields).toMatchObject({ outcome: 'no-host' });
  });

  test('no logger → no throw, behaviour unchanged', async () => {
    const store = makeStore(tmpDir);
    await store.set('github.com', 'alice', 'gho_abc');
    const input = makeStream('protocol=https\nhost=github.com\n\n');
    const { writable, result } = makeOutput();

    const code = await handleCredentialGet(input, writable, store);
    expect(code).toBe(0);
    expect(result()).toBe('username=alice\npassword=gho_abc\n');
  });
});
