
import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveConfigPath } from '@inkeep/open-knowledge-core/server';
import {
  isTerminalConsented,
  isTerminalConsentedWithGrace,
  TERMINAL_CONSENT_GRACE_TIMEOUT_MS,
} from './terminal-consent.ts';

const STORE_DEBOUNCE_MS = 2000;

function makeProjectDir(): string {
  return mkdtempSync(join(tmpdir(), 'ok-terminal-consent-'));
}

function writeConsent(projectDir: string, value: unknown): void {
  const path = resolveConfigPath('project-local', projectDir);
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, `terminal:\n  enabled: ${JSON.stringify(value)}\n`, 'utf-8');
}

describe('isTerminalConsented (synchronous)', () => {
  test('absent file → not consented', () => {
    const dir = makeProjectDir();
    try {
      expect(isTerminalConsented(dir)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('terminal.enabled: true → consented', () => {
    const dir = makeProjectDir();
    try {
      writeConsent(dir, true);
      expect(isTerminalConsented(dir)).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('only the literal true consents — false / absent leaf / non-bool refuse', () => {
    const dir = makeProjectDir();
    try {
      writeConsent(dir, false);
      expect(isTerminalConsented(dir)).toBe(false);
      writeConsent(dir, 'true');
      expect(isTerminalConsented(dir)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('grace budget vs. store debounce', () => {
  test('default grace budget exceeds the 2000ms store debounce', () => {
    expect(TERMINAL_CONSENT_GRACE_TIMEOUT_MS).toBeGreaterThan(STORE_DEBOUNCE_MS);
  });

  test('resolves true the moment a delayed write lands inside the window', async () => {
    const dir = makeProjectDir();
    try {
      setTimeout(() => writeConsent(dir, true), 120);
      expect(isTerminalConsented(dir)).toBe(false);
      const granted = await isTerminalConsentedWithGrace(dir, {
        timeoutMs: 1000,
        intervalMs: 20,
      });
      expect(granted).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('resolves false when the write never lands within the window', async () => {
    const dir = makeProjectDir();
    try {
      const granted = await isTerminalConsentedWithGrace(dir, {
        timeoutMs: 100,
        intervalMs: 20,
      });
      expect(granted).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('a revoked (enabled: false) project keeps refusing across the window', async () => {
    const dir = makeProjectDir();
    try {
      writeConsent(dir, false);
      const granted = await isTerminalConsentedWithGrace(dir, {
        timeoutMs: 100,
        intervalMs: 20,
      });
      expect(granted).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
