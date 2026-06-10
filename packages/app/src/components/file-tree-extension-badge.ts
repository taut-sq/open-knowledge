
import { getFileExtension } from '@/components/file-tree-rename-validation';

export const OK_EXT_BADGE_ATTR = 'data-ok-ext-badge';
export const OK_EXT_ROW_ATTR = 'data-ok-ext-row';

export const FILE_TREE_EXT_BADGE_CSS = `
  [data-item-selected='true'] [data-icon-token='markdown'] {
    color: var(--trees-selected-fg);
  }
  [data-type='item'][${OK_EXT_ROW_ATTR}] [data-truncate-segment-priority]:last-child {
    display: none;
  }
  [${OK_EXT_BADGE_ATTR}] {
    display: inline-block;
    margin-left: 0.375rem;
    margin-right: 0.25rem;
    align-self: center;
    color: color-mix(in oklab, var(--muted-foreground) 60%, transparent);
    font-size: 0.75rem;
    text-transform: uppercase;
    flex-shrink: 0;
    pointer-events: none;
    user-select: none;
  }
`;

export function applyExtensionBadges(root: ParentNode): void {
  const rows = root.querySelectorAll<HTMLElement>('[data-type="item"][data-item-path]');
  for (const row of rows) {
    const treePath = row.dataset.itemPath;
    if (!treePath || treePath.endsWith('/')) {
      clearExtensionRow(row);
      continue;
    }
    const ext = getFileExtension(treePath);
    if (!ext) {
      clearExtensionRow(row);
      continue;
    }

    const truncateGroup = row.querySelector<HTMLElement>(
      '[data-truncate-group-container="middle"]',
    );
    if (!truncateGroup) continue;

    const segments = truncateGroup.querySelectorAll<HTMLElement>(
      '[data-truncate-segment-priority]',
    );
    if (segments.length < 2) continue;
    const basenameSeg = segments[0];
    if (!basenameSeg) continue;

    row.setAttribute(OK_EXT_ROW_ATTR, '');
    trimTrailingDotInBasenameSegment(basenameSeg);

    const isMarkdown = ext.toLowerCase() === '.md';
    if (isMarkdown) {
      removeStaleBadge(row);
      continue;
    }
    upsertBadge(row, ext.slice(1).toUpperCase());
  }
}

function removeStaleBadge(row: HTMLElement): void {
  const badge = row.querySelector<HTMLElement>(`[${OK_EXT_BADGE_ATTR}]`);
  if (badge) badge.remove();
}

function clearExtensionRow(row: HTMLElement): void {
  row.removeAttribute(OK_EXT_ROW_ATTR);
  removeStaleBadge(row);
}

function trimTrailingDotInBasenameSegment(basenameSeg: HTMLElement): void {
  const contentDivs = basenameSeg.querySelectorAll<HTMLElement>('[data-truncate-content]');
  for (const contentDiv of contentDivs) {
    const firstChild = contentDiv.firstChild;
    if (!firstChild || firstChild.nodeType !== Node.TEXT_NODE) continue;
    const current = firstChild.textContent ?? '';
    if (!current.endsWith('.')) continue;
    firstChild.textContent = current.replace(/\.+$/, '');
  }
}

function upsertBadge(row: HTMLElement, label: string): void {
  let badge = row.querySelector<HTMLSpanElement>(`[${OK_EXT_BADGE_ATTR}]`);
  if (!badge) {
    badge = row.ownerDocument.createElement('span');
    badge.setAttribute(OK_EXT_BADGE_ATTR, '');
    badge.setAttribute('aria-hidden', 'true');
    const actionSection = row.querySelector('[data-item-section="action"]');
    if (actionSection) {
      actionSection.before(badge);
    } else {
      row.appendChild(badge);
    }
  }
  if (badge.textContent !== label) {
    badge.textContent = label;
  }
}
