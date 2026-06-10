
export interface RevealScrollInput {
  focusedIndex: number;
  itemHeight: number;
  viewportHeight: number;
  currentScrollTop: number;
  topInset?: number;
}

export function computeRevealScrollTop(input: RevealScrollInput): number | null {
  const { focusedIndex, itemHeight, viewportHeight, currentScrollTop } = input;
  if (focusedIndex < 0) return null;
  const topInset = Math.max(0, input.topInset ?? 0);
  const itemTop = focusedIndex * itemHeight;
  const itemBottom = itemTop + itemHeight;

  if (itemTop < currentScrollTop + topInset) {
    const next = Math.max(0, itemTop - topInset);
    return next === currentScrollTop ? null : next;
  }
  if (itemBottom > currentScrollTop + viewportHeight) {
    const next = itemBottom - viewportHeight;
    return next === currentScrollTop ? null : next;
  }
  return null;
}
