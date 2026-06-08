import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { setTimeout as wait } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { createEphemeralProjectDir } from '@inkeep/open-knowledge-server';
import { test as base, expect } from '@playwright/test';
import {
  diffManifest,
  mutationsOf,
  snapshotMarkdownOnly,
} from '../integration/_fixtures/init-load-byte-stable-snapshot.ts';
import {
  getFreePort,
  killGracefully,
  waitForActiveProviderSynced,
  waitForHttpReady,
} from './_helpers';

const HELPERS_DIR = dirname(fileURLToPath(import.meta.url));
const APP_PACKAGE_ROOT = resolve(HELPERS_DIR, '..', '..');

const PROD_MAX_DEBOUNCE_MS = 10_000;
const POST_MOUNT_WAIT_MS = PROD_MAX_DEBOUNCE_MS * 2 + 500;

const DOC_NAME = 'todo';
const FILE_NAME = `${DOC_NAME}.md`;
const RAW_BODY = '# Todo\n\n1. first\n1. second\n';

interface EphemeralFixture {
  port: number;
  baseURL: string;
  notesDir: string; // the file's parent — the ephemeral contentDir (must stay clean)
  filePath: string;
  projectDir: string; // throwaway projectDir (where `.ok/` is allowed)
}

const test = base.extend<{ ephemeral: EphemeralFixture }>({
  // biome-ignore lint/correctness/noEmptyPattern: Playwright requires an object-destructuring pattern; this fixture has no dependencies.
  ephemeral: async ({}, use) => {
    const port = await getFreePort();
    const userDir = realpathSync(mkdtempSync(join(tmpdir(), 'ok-sf-e2e-')));
    const notesDir = join(userDir, 'notes');
    mkdirSync(notesDir, { recursive: true });
    const filePath = join(notesDir, FILE_NAME);
    writeFileSync(filePath, RAW_BODY, 'utf-8');
    writeFileSync(join(notesDir, 'other.md'), '# Other\n', 'utf-8');
    writeFileSync(join(notesDir, 'pic.png'), 'not-a-real-png', 'utf-8');
    const projectDir = createEphemeralProjectDir(notesDir);

    const baseURL = `http://localhost:${port}`;
    const proc = spawn('bun', ['run', '--silent', 'dev'], {
      cwd: APP_PACKAGE_ROOT,
      env: {
        ...process.env,
        VITE_PORT: String(port),
        OK_TEST_CONTENT_DIR: notesDir,
        OK_TEST_SINGLE_DOC_REL_PATH: FILE_NAME,
        OK_TEST_PROJECT_DIR: projectDir,
        NO_COLOR: process.env.NO_COLOR ?? '1',
      },
      stdio: ['ignore', 'ignore', 'inherit'],
    });

    try {
      await Promise.race([
        waitForHttpReady(baseURL, 60_000),
        new Promise<never>((_, reject) => {
          proc.once('error', (err) => reject(err));
          proc.once('exit', (code, signal) => {
            if (code !== 0 && code !== null)
              reject(new Error(`dev server exited early: code=${code} signal=${signal}`));
          });
        }),
      ]);
    } catch (err) {
      await killGracefully(proc);
      rmSync(userDir, { recursive: true, force: true });
      rmSync(projectDir, { recursive: true, force: true });
      throw err;
    }

    try {
      await use({ port, baseURL, notesDir, filePath, projectDir });
    } finally {
      try {
        await killGracefully(proc);
      } finally {
        rmSync(userDir, { recursive: true, force: true });
        rmSync(projectDir, { recursive: true, force: true });
      }
    }
  },
  baseURL: async ({ ephemeral }, use) => {
    await use(ephemeral.baseURL);
  },
});

test.describe('single-file ephemeral session (browser fallback)', () => {
  test('opens without rewriting the file (FR4/G8), hides project chrome, keeps the editor editable, persists real edits (FR3)', async ({
    page,
    ephemeral,
  }) => {
    test.setTimeout(120_000);

    const baseline = snapshotMarkdownOnly(ephemeral.notesDir);

    await page.goto(`/#/${DOC_NAME}`);
    await waitForActiveProviderSynced(page, { timeout: 60_000 });

    const editor = page.locator('.ProseMirror').first();
    await editor.waitFor({ state: 'visible', timeout: 60_000 });
    await expect(editor.locator('h1').first()).toContainText('Todo', { timeout: 30_000 });

    await expect(page.locator('[data-slot="sidebar"]')).toHaveCount(0);
    await expect(page.locator('[data-sidebar="trigger"]')).toHaveCount(0);

    await expect(page.locator('[data-testid="open-in-agent-trigger"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="share-button"]')).toHaveCount(0);

    const editableBeforeEdit = await page.evaluate(() => window.__activeEditor?.isEditable);
    expect(editableBeforeEdit).toBe(true);

    const samplingStart = Date.now();
    while (Date.now() - samplingStart < POST_MOUNT_WAIT_MS) {
      const sample = snapshotMarkdownOnly(ephemeral.notesDir);
      const muts = mutationsOf(diffManifest(baseline, sample));
      expect(muts, `disk mutation at t=${Date.now() - samplingStart}ms after mount`).toEqual([]);
      expect(existsSync(join(ephemeral.notesDir, '.ok'))).toBe(false);
      await wait(2000);
    }
    expect(await readFile(ephemeral.filePath, 'utf-8')).toBe(RAW_BODY);

    const SENTINEL = 'genuine-edit-xyz';
    await editor.click();
    await page.keyboard.insertText(SENTINEL);
    await expect(editor).toContainText(SENTINEL, { timeout: 10_000 });
    await page.waitForFunction(
      (s) => window.__activeProvider?.document?.getText('source')?.toString()?.includes(s) ?? false,
      SENTINEL,
      { timeout: 10_000 },
    );
    await expect
      .poll(async () => (await readFile(ephemeral.filePath, 'utf-8')).includes(SENTINEL), {
        timeout: 20_000,
        intervals: [500, 1000, 2000],
      })
      .toBe(true);

    expect(existsSync(join(ephemeral.notesDir, '.ok'))).toBe(false);
  });
});
