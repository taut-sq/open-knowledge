
import { FILE_TREE_TAG_NAME, type FileTree as PierreFileTreeModel } from '@pierre/trees';
import { computeRevealScrollTop } from '@/components/file-tree-scroll';

type RevealModel = Pick<PierreFileTreeModel, 'getFocusedIndex' | 'getItemHeight'>;

export function revealActiveRow(host: HTMLElement | null, model: RevealModel): void {
  const focusedIndex = model.getFocusedIndex();
  if (focusedIndex < 0) return;
  const scrollEl = host
    ?.querySelector(FILE_TREE_TAG_NAME)
    ?.shadowRoot?.querySelector<HTMLElement>('[data-file-tree-virtualized-scroll]');
  if (!scrollEl) return;
  const itemHeight = model.getItemHeight();
  const nextScrollTop = computeRevealScrollTop({
    focusedIndex,
    itemHeight,
    viewportHeight: scrollEl.clientHeight,
    currentScrollTop: scrollEl.scrollTop,
    topInset: itemHeight,
  });
  if (nextScrollTop !== null) scrollEl.scrollTop = nextScrollTop;
}
