
import { fileEntryToTreePath } from './file-tree-adapter';
import type { FileEntry } from './file-tree-utils';

export const STALE_REFRESH_PRESERVE_WINDOW_MS = 5_000;

export function mergeAndPruneRecentLocalAdds(
  serverEntries: readonly FileEntry[],
  localEntries: readonly FileEntry[],
  recentAdds: Map<string, number>,
  now: number = Date.now(),
): FileEntry[] {
  if (recentAdds.size === 0) return [...serverEntries];
  const serverPaths = new Set(serverEntries.map((entry) => fileEntryToTreePath(entry)));
  const preservedLocal: FileEntry[] = [];
  for (const localEntry of localEntries) {
    const treePath = fileEntryToTreePath(localEntry);
    if (serverPaths.has(treePath)) {
      recentAdds.delete(treePath);
      continue;
    }
    const addedAt = recentAdds.get(treePath);
    if (addedAt === undefined) continue; // never optimistically added — drop with server view
    if (now - addedAt > STALE_REFRESH_PRESERVE_WINDOW_MS) {
      recentAdds.delete(treePath); // window expired — trust server
      continue;
    }
    preservedLocal.push(localEntry);
  }
  if (preservedLocal.length === 0) return [...serverEntries];
  return [...serverEntries, ...preservedLocal];
}
