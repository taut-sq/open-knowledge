
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import type { Hocuspocus } from '@hocuspocus/server';
import {
  BridgeInvariantViolationError,
  BridgeMergeContentLossError,
  normalizeBridge,
  stripFrontmatter,
} from '@inkeep/open-knowledge-core';
import { formatReconcileSubject } from '@inkeep/open-knowledge-core/shadow-repo-layout';
import type * as Y from 'yjs';
import { composeAndWriteRawBody } from './bridge-intake.ts';
import { isConfigDoc, isSystemDoc } from './cc1-broadcast.ts';
import { isDocInConflict } from './conflict-errors.ts';
import { recordContributor } from './contributor-tracker.ts';
import { recordFrontmatterEditSurface } from './frontmatter-telemetry.ts';
import { getLogger } from './logger.ts';
import { incrementExternalChangeHandlerErrors } from './metrics.ts';
import {
  getReconciledBase,
  isWithinContentDir,
  safeContentPath,
  setReconciledBase,
} from './persistence.ts';
import type { PairedWriteOrigin } from './server-observers.ts';
import { FILE_SYSTEM_WRITER } from './shadow-repo.ts';

export const FILE_WATCHER_ORIGIN = {
  source: 'local',
  skipStoreHooks: true,
  context: { origin: 'file-watcher', paired: true },
} as const satisfies PairedWriteOrigin;

export function applyDiskContentToDoc(
  document: Y.Doc,
  content: string,
  resolveEmbed?: (basename: string, sourcePath: string) => string | null,
  sourcePath?: string,
  resolveSize?: (basename: string, sourcePath: string) => number | null,
): void {
  const embedResolver =
    resolveEmbed && sourcePath ? { resolveEmbed, resolveSize, sourcePath } : undefined;
  composeAndWriteRawBody(document, content, 'file-watcher', embedResolver);
}

export function applyExternalChange(
  hocuspocus: Hocuspocus,
  docName: string,
  content: string,
  resolveEmbed?: (basename: string, sourcePath: string) => string | null,
  resolveSize?: (basename: string, sourcePath: string) => number | null,
): void {
  if (isSystemDoc(docName) || isConfigDoc(docName)) return;
  const document = hocuspocus.documents.get(docName);
  if (!document) return;

  const priorFm = stripFrontmatter(document.getText('source').toString()).frontmatter;
  const { frontmatter: nextFm } = stripFrontmatter(content);

  try {
    document.transact(() => {
      applyDiskContentToDoc(document, content, resolveEmbed, docName, resolveSize);
    }, FILE_WATCHER_ORIGIN);
  } catch (err) {
    setReconciledBase(docName, document.getText('source').toString());
    throw err;
  }

  if (priorFm !== nextFm) {
    recordFrontmatterEditSurface('file-watcher');
  }

  recordContributor(
    docName,
    FILE_SYSTEM_WRITER.id,
    FILE_SYSTEM_WRITER.name,
    FILE_SYSTEM_WRITER.id,
    formatReconcileSubject(docName),
  );

  setReconciledBase(docName, content);
}

export function createExternalChangeHandler(
  hocuspocus: Hocuspocus,
  resolveEmbed?: (basename: string, sourcePath: string) => string | null,
  resolveSize?: (basename: string, sourcePath: string) => number | null,
): (docName: string, content: string) => Promise<void> {
  return async (docName: string, content: string): Promise<void> => {
    try {
      applyExternalChange(hocuspocus, docName, content, resolveEmbed, resolveSize);
      getLogger('file-watcher').info({ docName }, 'applied external change');
    } catch (err) {
      if (
        err instanceof BridgeInvariantViolationError ||
        err instanceof BridgeMergeContentLossError
      ) {
        throw err;
      }
      incrementExternalChangeHandlerErrors();
      console.error(`[file-watcher] Failed to apply external change for ${docName}:`, err);
    }
  };
}

export interface ReconcileBeforeWriteResult {
  reconciled: boolean;
  baseBytes: number;
  diskBytes: number;
}

const NOT_RECONCILED: ReconcileBeforeWriteResult = {
  reconciled: false,
  baseBytes: 0,
  diskBytes: 0,
};

export function reconcileDiskBeforeAgentWrite(
  hocuspocus: Hocuspocus,
  docName: string,
  contentDir: string,
  resolveEmbed?: (basename: string, sourcePath: string) => string | null,
): ReconcileBeforeWriteResult {
  if (isSystemDoc(docName) || isConfigDoc(docName)) return NOT_RECONCILED;

  const document = hocuspocus.documents.get(docName);
  if (document && isDocInConflict(document)) return NOT_RECONCILED;

  const base = getReconciledBase(docName);
  if (base === undefined) return NOT_RECONCILED;

  let canonical: string;
  try {
    const requestedPath = safeContentPath(docName, contentDir);
    if (!existsSync(requestedPath)) return NOT_RECONCILED;
    canonical = realpathSync(requestedPath);
  } catch {
    return NOT_RECONCILED;
  }

  if (!isWithinContentDir(canonical, contentDir)) {
    getLogger('reconcile').warn(
      { docName, canonical, contentDir },
      `[reconcile] symlink-escape on disk read for ${docName}; skipping reconcile`,
    );
    return NOT_RECONCILED;
  }

  let diskContent: string;
  try {
    diskContent = readFileSync(canonical, 'utf-8');
  } catch {
    return NOT_RECONCILED;
  }

  if (normalizeBridge(diskContent) === normalizeBridge(base)) return NOT_RECONCILED;

  applyExternalChange(hocuspocus, docName, diskContent, resolveEmbed);
  return {
    reconciled: true,
    baseBytes: Buffer.byteLength(base, 'utf8'),
    diskBytes: Buffer.byteLength(diskContent, 'utf8'),
  };
}
