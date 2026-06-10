import { afterEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ASSET_EXTENSIONS, type DocumentListEntry } from '@inkeep/open-knowledge-core';
import {
  __getShowAllWalkStatsForTesting,
  __resetShowAllWalkStatsForTesting,
  type StreamShowAllOpts,
  streamShowAllEntries,
  walkContentDirForShowAll,
} from './api-extension.ts';
import { createContentFilter } from './content-filter.ts';

function makeFlatFixture(fileCount: number): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'ok-showall-stream-')));
  for (let i = 0; i < fileCount; i++) {
    writeFileSync(join(dir, `file-${String(i).padStart(3, '0')}.md`), `# File ${i}\n`);
  }
  return dir;
}

function makeNestedFixture(): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'ok-showall-stream-nested-')));
  writeFileSync(join(dir, 'root.md'), '# root\n');
  writeFileSync(join(dir, 'note.txt'), 'plain\n');
  for (const sub of ['alpha', 'beta']) {
    mkdirSync(join(dir, sub));
    writeFileSync(join(dir, sub, 'child.md'), `# ${sub}\n`);
  }
  return dir;
}

function streamOptsFor(dir: string, maxEntries: number): StreamShowAllOpts {
  return {
    contentDir: dir,
    contentFilter: createContentFilter({ projectDir: dir, contentDir: dir }),
    dirFilter: null,
    getDocExtension: () => '.md',
    maxEntries,
  };
}

async function drain(
  gen: AsyncGenerator<DocumentListEntry, { truncated: boolean }, void>,
): Promise<{ entries: DocumentListEntry[]; truncated: boolean }> {
  const entries: DocumentListEntry[] = [];
  let next = await gen.next();
  while (!next.done) {
    entries.push(next.value);
    next = await gen.next();
  }
  return { entries, truncated: next.value.truncated };
}

describe('streamShowAllEntries — buffered-walk equivalence (PRD-6856)', () => {
  afterEach(() => __resetShowAllWalkStatsForTesting());

  test('generator yields exactly the entries the buffered walk accumulates', async () => {
    const dir = makeNestedFixture();
    const CAP = 50_000;

    const buffered: DocumentListEntry[] = [];
    await walkContentDirForShowAll({ ...streamOptsFor(dir, CAP), documents: buffered });

    const streamed = await drain(streamShowAllEntries(streamOptsFor(dir, CAP)));

    expect(streamed.entries).toEqual(buffered);
    expect(streamed.truncated).toBe(false);
    expect(streamed.entries.length).toBeGreaterThan(0);
  });

  test('one generator instantiation counts as exactly one walk invocation', async () => {
    const dir = makeFlatFixture(10);
    __resetShowAllWalkStatsForTesting();
    await drain(streamShowAllEntries(streamOptsFor(dir, 50_000)));
    expect(__getShowAllWalkStatsForTesting().invocations).toBe(1);
    expect(__getShowAllWalkStatsForTesting().aborts).toBe(0);
  });
});

describe('streamShowAllEntries — entry cap', () => {
  test('exactly-cap fixture streams complete and untruncated', async () => {
    const CAP = 5;
    const { entries, truncated } = await drain(
      streamShowAllEntries(streamOptsFor(makeFlatFixture(CAP), CAP)),
    );
    expect(entries.length).toBe(CAP);
    expect(truncated).toBe(false);
  });

  test('cap+1 fixture stops at the cap and returns truncated', async () => {
    const CAP = 5;
    const { entries, truncated } = await drain(
      streamShowAllEntries(streamOptsFor(makeFlatFixture(CAP + 1), CAP)),
    );
    expect(entries.length).toBe(CAP);
    expect(truncated).toBe(true);
  });
});

describe('streamShowAllEntries — abort + laziness', () => {
  afterEach(() => __resetShowAllWalkStatsForTesting());

  test('a pre-aborted signal yields nothing and counts one abort', async () => {
    const dir = makeFlatFixture(20);
    __resetShowAllWalkStatsForTesting();
    const controller = new AbortController();
    controller.abort();
    const { entries, truncated } = await drain(
      streamShowAllEntries({ ...streamOptsFor(dir, 50_000), signal: controller.signal }),
    );
    expect(entries.length).toBe(0);
    expect(truncated).toBe(false);
    expect(__getShowAllWalkStatsForTesting().aborts).toBe(1);
  });

  test('pulling a single entry does not drain the whole tree', async () => {
    const dir = makeFlatFixture(500);
    const gen = streamShowAllEntries(streamOptsFor(dir, 50_000));
    const first = await gen.next();
    expect(first.done).toBe(false);
    expect(first.value).toBeDefined();
    const ret = await gen.return({ truncated: false });
    expect(ret.done).toBe(true);
  });
});

describe('streamShowAllEntries — .base/.canvas mediaKind', () => {

  test('.base and .canvas entries report mediaKind text in showAll output', async () => {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), 'ok-showall-mediakind-')));
    writeFileSync(join(dir, 'note.md'), '# Note\n');
    writeFileSync(join(dir, 'Characters.base'), 'fields:\n  - name\n');
    writeFileSync(join(dir, 'Board.canvas'), '{"nodes":[],"edges":[]}\n');

    const { entries } = await drain(streamShowAllEntries(streamOptsFor(dir, 50_000)));

    const baseEntry = entries.find((e) => e.kind === 'asset' && e.docName === 'Characters.base');
    const canvasEntry = entries.find((e) => e.kind === 'asset' && e.docName === 'Board.canvas');

    expect(baseEntry).toBeDefined();
    expect(baseEntry?.kind === 'asset' && baseEntry.mediaKind).toBe('text');
    expect(canvasEntry).toBeDefined();
    expect(canvasEntry?.kind === 'asset' && canvasEntry.mediaKind).toBe('text');
  });

  test('.base and .canvas are absent from ASSET_EXTENSIONS (serve allowlist unchanged)', () => {
    expect(ASSET_EXTENSIONS.has('base')).toBe(false);
    expect(ASSET_EXTENSIONS.has('canvas')).toBe(false);
  });
});
