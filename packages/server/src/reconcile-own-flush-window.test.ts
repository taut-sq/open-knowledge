import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Hocuspocus } from '@hocuspocus/server';
import { normalizeBridge } from '@inkeep/open-knowledge-core';
import * as Y from 'yjs';
import { isDocInConflict } from './conflict-errors.ts';
import {
  type ReconcileBeforeWriteResult,
  reconcileDiskBeforeAgentWrite,
} from './external-change.ts';
import {
  createPersistenceExtension,
  getReconciledBase,
  peekInFlightFlush,
  setBatchInProgress,
  switchReconciledBaseScope,
} from './persistence.ts';

const BROWSER_ORIGIN = {
  source: 'connection',
  connection: { context: { principalId: 'principal-test' } },
};

function replaceDocParagraphs(document: Y.Doc, texts: string[]): void {
  const body = `${texts.join('\n\n')}\n`;
  const fragment = document.getXmlFragment('default');
  const ytext = document.getText('source');
  if (fragment.length > 0) {
    fragment.delete(0, fragment.length);
  }
  fragment.insert(
    0,
    texts.map((text) => {
      const paragraph = new Y.XmlElement('paragraph');
      paragraph.insert(0, [new Y.XmlText(text)]);
      return paragraph;
    }),
  );
  if (ytext.length > 0) {
    ytext.delete(0, ytext.length);
  }
  ytext.insert(0, body);
}

async function loadDocument(
  persistence: ReturnType<typeof createPersistenceExtension>,
  document: Y.Doc,
  documentName: string,
): Promise<void> {
  await persistence.extension.onLoadDocument?.({
    document,
    documentName,
    context: {},
  } as never);
}

async function storeDocument(
  persistence: ReturnType<typeof createPersistenceExtension>,
  document: Y.Doc,
  documentName: string,
): Promise<void> {
  await persistence.extension.onStoreDocument?.({
    document,
    documentName,
    lastTransactionOrigin: BROWSER_ORIGIN,
    lastContext: {},
  } as never);
}

function fakeHocuspocusWith(docName: string, document: Y.Doc): Hocuspocus {
  return { documents: new Map([[docName, document]]) } as unknown as Hocuspocus;
}

const BASE_CONTENT = 'alpha\n\nbeta\n'; // prior flush (stale base in-window)
const FLUSHED_PARAGRAPHS = ['alpha', 'beta gamma']; // own flush snapshot (theirs)
const FLUSHED_CONTENT = 'alpha\n\nbeta gamma\n';
const LIVE_PARAGRAPHS = ['alpha', 'beta gamma delta']; // live Y.Text moved past the snapshot (ours)

interface WindowProbe {
  windowResult: ReconcileBeforeWriteResult | undefined;
  baseSeenInWindow: string | undefined;
  inFlightSeenInWindow: string | undefined;
  conflictAfterGuard: boolean | undefined;
}

async function drivePhantomDivergence(
  tmpDir: string,
  docName: string,
  document: Y.Doc,
  options: { diskContentInWindow?: string } = {},
): Promise<WindowProbe> {
  const docPath = join(tmpDir, `${docName}.md`);
  writeFileSync(docPath, BASE_CONTENT, 'utf-8');

  const probe: WindowProbe = {
    windowResult: undefined,
    baseSeenInWindow: undefined,
    inFlightSeenInWindow: undefined,
    conflictAfterGuard: undefined,
  };

  let windowFired = false;
  const persistence = createPersistenceExtension({
    contentDir: tmpDir,
    projectDir: tmpDir,
    gitEnabled: false,
    onDiskFlush: (name) => {
      if (name !== docName || windowFired) return;
      windowFired = true;
      document.transact(() => replaceDocParagraphs(document, LIVE_PARAGRAPHS), BROWSER_ORIGIN);
      probe.baseSeenInWindow = getReconciledBase(docName);
      probe.inFlightSeenInWindow = peekInFlightFlush(docName);
      if (options.diskContentInWindow !== undefined) {
        writeFileSync(docPath, options.diskContentInWindow, 'utf-8');
      }
      probe.windowResult = reconcileDiskBeforeAgentWrite(
        fakeHocuspocusWith(docName, document),
        docName,
        tmpDir,
      );
      probe.conflictAfterGuard = isDocInConflict(document as never);
    },
  });

  await loadDocument(persistence, document, docName);
  document.transact(() => replaceDocParagraphs(document, FLUSHED_PARAGRAPHS), BROWSER_ORIGIN);
  await storeDocument(persistence, document, docName);

  expect(windowFired).toBe(true);
  expect(probe.baseSeenInWindow).toBe(BASE_CONTENT);
  return probe;
}

describe('reconcileDiskBeforeAgentWrite — own persistence flush is not foreign divergence', () => {
  let tmpDir: string;
  let document: Y.Doc;

  beforeEach(() => {
    tmpDir = realpathSync(mkdtempSync(join(tmpdir(), 'ok-own-flush-window-')));
    mkdirSync(tmpDir, { recursive: true });
    setBatchInProgress(false);
    switchReconciledBaseScope('main');
    document = new Y.Doc();
  });

  afterEach(() => {
    document.destroy();
    setBatchInProgress(false);
    switchReconciledBaseScope('main');
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test("an agent write inside the server's own flush-commit window is not refused and does not latch lifecycle conflict", async () => {
    const docName = 'own-flush-window';
    const probe = await drivePhantomDivergence(tmpDir, docName, document);

    expect(probe.conflictAfterGuard).toBe(false);
    expect(isDocInConflict(document as never)).toBe(false);
    expect(probe.windowResult?.reconciled).toBe(false);
    expect(probe.inFlightSeenInWindow).toBe(normalizeBridge(FLUSHED_CONTENT));
  });

  test('a FOREIGN disk edit landing inside the flush window still reconciles (narrow-equality safety boundary)', async () => {
    const docName = 'own-flush-foreign-in-window';
    const FOREIGN_CONTENT = 'alpha FOREIGN EDIT\n\nbeta\n';
    const probe = await drivePhantomDivergence(tmpDir, docName, document, {
      diskContentInWindow: FOREIGN_CONTENT,
    });

    expect(probe.inFlightSeenInWindow).toBe(normalizeBridge(FLUSHED_CONTENT));
    expect(probe.windowResult?.reconciled).toBe(true);
    expect(probe.windowResult?.mergeOutcome).toBe('merged');
  });

  test('no permanent 409 wedge: after the flush settles, subsequent agent writes are not refused', async () => {
    const docName = 'own-flush-wedge';
    await drivePhantomDivergence(tmpDir, docName, document);

    expect(getReconciledBase(docName)).toBe(FLUSHED_CONTENT);

    const laterGuard = reconcileDiskBeforeAgentWrite(
      fakeHocuspocusWith(docName, document),
      docName,
      tmpDir,
    );
    expect(laterGuard.reconciled).toBe(false);

    expect(isDocInConflict(document as never)).toBe(false);
  });

  test('a failed disk flush does not leave the in-flight flush signal stuck set', async () => {
    const docName = 'own-flush-fault';
    const docPath = join(tmpDir, `${docName}.md`);
    writeFileSync(docPath, BASE_CONTENT, 'utf-8');

    const persistence = createPersistenceExtension({
      contentDir: tmpDir,
      projectDir: tmpDir,
      gitEnabled: false,
    });
    await loadDocument(persistence, document, docName);
    document.transact(() => replaceDocParagraphs(document, FLUSHED_PARAGRAPHS), BROWSER_ORIGIN);

    const prevFault = process.env.OK_TEST_STORE_FAULT;
    process.env.OK_TEST_STORE_FAULT = docName;
    try {
      await expect(storeDocument(persistence, document, docName)).rejects.toThrow(
        'OK_TEST_STORE_FAULT',
      );
    } finally {
      if (prevFault === undefined) {
        delete process.env.OK_TEST_STORE_FAULT;
      } else {
        process.env.OK_TEST_STORE_FAULT = prevFault;
      }
    }

    expect(peekInFlightFlush(docName)).toBeUndefined();
    expect(getReconciledBase(docName)).toBe(BASE_CONTENT);
  });

  test("an earlier overlapping flush settling does not clear a later flush's in-flight signal", async () => {
    const docName = 'own-flush-overlap';
    const docPath = join(tmpDir, `${docName}.md`);
    writeFileSync(docPath, BASE_CONTENT, 'utf-8');

    const OVERLAP_PARAGRAPHS = ['alpha', 'beta gamma epsilon'];
    const OVERLAP_CONTENT = 'alpha\n\nbeta gamma epsilon\n';

    let windowFired = false;
    let laterFlush: Promise<void> | undefined;
    let peekAfterLaterStart: string | undefined;
    const persistence = createPersistenceExtension({
      contentDir: tmpDir,
      projectDir: tmpDir,
      gitEnabled: false,
      onDiskFlush: (name) => {
        if (name !== docName || windowFired) return;
        windowFired = true;
        document.transact(() => replaceDocParagraphs(document, OVERLAP_PARAGRAPHS), BROWSER_ORIGIN);
        laterFlush = storeDocument(persistence, document, docName);
        peekAfterLaterStart = peekInFlightFlush(docName);
      },
    });

    await loadDocument(persistence, document, docName);
    document.transact(() => replaceDocParagraphs(document, FLUSHED_PARAGRAPHS), BROWSER_ORIGIN);
    await storeDocument(persistence, document, docName);

    expect(windowFired).toBe(true);
    expect(peekAfterLaterStart).toBe(normalizeBridge(OVERLAP_CONTENT));
    expect(peekInFlightFlush(docName)).toBe(normalizeBridge(OVERLAP_CONTENT));

    await laterFlush;
    expect(peekInFlightFlush(docName)).toBeUndefined();
  });
});
