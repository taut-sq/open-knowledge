const COMMONMARK_ESCAPE_RE = /\\([!"#$%&'()*+,\-./:;<=>?@[\]^_`{|}~])/g;

const TABLE_ALIGN_ROW_RE = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?\s*$/;

const LIST_ITEM_INDENT_RE = /^[ \t]+([-+*]|\d+[.)]|[a-zA-Z][.)])\s/;

const ORDERED_LIST_MARKER_RE = /^\d+([.)])(?=\s)/;

/** Canonical sentinel the ordered-list marker number collapses to. Any digit
 *  run works as long as it is stable across both sides; `1` keeps the
 *  normalized form readable. */
const ORDERED_LIST_MARKER_CANONICAL = '1';

const EMPHASIS_AROUND_CODE_RE = /\*\*\s*(`[^`]+`)\s*\*\*/g;

const FENCE_LINE_RE = /^(`{3,}|~{3,})/;

function findTableRowLines(lines: readonly string[]): Set<number> {
  const rows = new Set<number>();
  let fenceOpener: '`' | '~' | null = null;
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trimEnd();
    const fence = FENCE_LINE_RE.exec(trimmed);
    if (fence) {
      const char = fence[1][0] as '`' | '~';
      if (fenceOpener === null) {
        fenceOpener = char;
        continue;
      }
      if (fenceOpener === char) {
        fenceOpener = null;
        continue;
      }
    }
    if (fenceOpener !== null || i === 0) continue;
    if (!TABLE_ALIGN_ROW_RE.test(trimmed)) continue;
    const prev = lines[i - 1].trimEnd();
    if (!prev.startsWith('|') || TABLE_ALIGN_ROW_RE.test(prev)) continue;
    rows.add(i - 1);
    rows.add(i);
    for (let j = i + 1; j < lines.length; j++) {
      if (!lines[j].trimEnd().startsWith('|')) break;
      rows.add(j);
    }
  }
  return rows;
}

function stripTrailingPipe(line: string): string {
  return line.slice(0, -1).trimEnd();
}

const CONTINUATION_BLOCK_START_RE =
  /^(?:#{1,6}[ \t]|>|(?:[-+*]|\d{1,9}[.)])[ \t]|`{3,}|~{3,}|=+[ \t]*$|-+[ \t]*$|(?:\*[ \t]*){3,}$|(?:_[ \t]*){3,}$)/;

/** Line indices inside fenced-code interiors (opening/closing fence lines
 *  excluded). Same opener-char discipline as `findTableRowLines`: a
 *  mismatched fence char inside an open fence is content. */
function findFenceInteriorLines(lines: readonly string[]): Set<number> {
  const interior = new Set<number>();
  let opener: '`' | '~' | null = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const m = /^(`{3,}|~{3,})/.exec(line.trimStart());
    if (m?.[1]) {
      const ch = m[1][0] as '`' | '~';
      if (opener === null) {
        opener = ch;
        continue;
      }
      if (opener === ch) {
        opener = null;
        continue;
      }
    }
    if (opener !== null) interior.add(i);
  }
  return interior;
}

export function normalizeBridge(s: string): string {
  const lines = s
    .replace(/^﻿/, '')
    .replace(/\r/g, '')
    .replace(COMMONMARK_ESCAPE_RE, '$1')
    .replace(EMPHASIS_AROUND_CODE_RE, '$1')
    .replace(/^\n+/, '')
    .replace(/^[*-]{3,}(?=\n|$)/, '---')
    .replace(/(\n)([#>+-]|\d+[.)]|`{3,}|~{3,})/g, '\n\n$2')
    .replace(/^([#>+-].*|\d+[.)].*|`{3,}.*|~{3,}.*)\n([^\n])/gm, '$1\n\n$2')
    .split('\n');
  const tableRowLines = findTableRowLines(lines);
  const fenceInterior = findFenceInteriorLines(lines);
  return lines
    .map((l, i) => {
      const trimmed = l.trimEnd();
      if (
        i > 0 &&
        !fenceInterior.has(i) &&
        /^[ \t]+\S/.test(trimmed) &&
        (lines[i - 1] ?? '').trim() !== '' &&
        !LIST_ITEM_INDENT_RE.test(trimmed) &&
        !CONTINUATION_BLOCK_START_RE.test(trimmed.trimStart())
      ) {
        const prev = (lines[i - 1] ?? '').trimStart();
        if (!CONTINUATION_BLOCK_START_RE.test(prev) && !prev.startsWith('|')) {
          return trimmed.replace(/^[ \t]+/, '');
        }
      }
      if (TABLE_ALIGN_ROW_RE.test(trimmed)) {
        const collapsed = trimmed.replace(/\s+/g, '');
        return tableRowLines.has(i) &&
          collapsed.length > 1 &&
          collapsed.startsWith('|') &&
          collapsed.endsWith('|')
          ? stripTrailingPipe(collapsed)
          : collapsed;
      }
      let line = LIST_ITEM_INDENT_RE.test(trimmed) ? trimmed.replace(/^[ \t]+/, '') : trimmed;
      if (tableRowLines.has(i) && line.length > 1 && line.startsWith('|') && line.endsWith('|')) {
        line = stripTrailingPipe(line);
      }
      return line.replace(ORDERED_LIST_MARKER_RE, `${ORDERED_LIST_MARKER_CANONICAL}$1`);
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\n+$/, '');
}

export const BRIDGE_TOLERANCE_CLASSES = [
  'bom',
  'crlf',
  'commonmark-escape',
  'emphasis-around-code',
  'leading-newline',
  'doc-start-thematic',
  'block-separator-collapse',
  'table-align-row-spacing',
  'row-no-trailing-pipe',
  'list-indent-canonical',
  'ordered-list-marker-number',
  'paragraph-continuation-indent',
  'trailing-whitespace',
  'blank-line-collapse',
  'trailing-newline',
] as const;

export type BridgeToleranceClass = (typeof BRIDGE_TOLERANCE_CLASSES)[number];

export function detectAppliedToleranceClasses(left: string, right: string): BridgeToleranceClass[] {
  const classes: BridgeToleranceClass[] = [];

  if (left.charCodeAt(0) === 0xfeff || right.charCodeAt(0) === 0xfeff) {
    classes.push('bom');
  }
  if (left.includes('\r') || right.includes('\r')) {
    classes.push('crlf');
  }

  if (
    /\\[!"#$%&'()*+,\-./:;<=>?@[\]^_`{|}~\\]/.test(left) ||
    /\\[!"#$%&'()*+,\-./:;<=>?@[\]^_`{|}~\\]/.test(right)
  ) {
    classes.push('commonmark-escape');
  }

  if (/\*\*\s*`[^`]+`\s*\*\*/.test(left) || /\*\*\s*`[^`]+`\s*\*\*/.test(right)) {
    classes.push('emphasis-around-code');
  }

  const leftNoBom = left.replace(/^﻿/, '');
  const rightNoBom = right.replace(/^﻿/, '');
  if (leftNoBom.startsWith('\n') !== rightNoBom.startsWith('\n')) {
    classes.push('leading-newline');
  }

  const leftStart = leftNoBom.replace(/^\n+/, '');
  const rightStart = rightNoBom.replace(/^\n+/, '');
  const isStarsLeft = /^\*{3,}(?=\n|$)/.test(leftStart);
  const isDashesLeft = /^-{3,}(?=\n|$)/.test(leftStart);
  const isStarsRight = /^\*{3,}(?=\n|$)/.test(rightStart);
  const isDashesRight = /^-{3,}(?=\n|$)/.test(rightStart);
  if ((isStarsLeft && isDashesRight) || (isDashesLeft && isStarsRight)) {
    classes.push('doc-start-thematic');
  }

  const blockSepBeforeRe = /\n\n([#>+-]|\d+[.)]|`{3,}|~{3,})/;
  const blockSepAfterRe = /^([#>+-].*|\d+[.)].*|`{3,}.*|~{3,}.*)\n\n[^\n]/m;
  const beforeLeft = blockSepBeforeRe.test(leftNoBom);
  const beforeRight = blockSepBeforeRe.test(rightNoBom);
  const afterLeft = blockSepAfterRe.test(leftNoBom);
  const afterRight = blockSepAfterRe.test(rightNoBom);
  if (beforeLeft !== beforeRight || afterLeft !== afterRight) {
    classes.push('block-separator-collapse');
  }

  const leftLf = leftNoBom.replace(/\r/g, '');
  const rightLf = rightNoBom.replace(/\r/g, '');

  const tableAlignRowMultiline = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?\s*$/m;
  if (tableAlignRowMultiline.test(leftLf) || tableAlignRowMultiline.test(rightLf)) {
    classes.push('table-align-row-spacing');
  }

  const hasUnterminatedPipeRow = (s: string): boolean =>
    tableAlignRowMultiline.test(s) && /^\|[^\n]*[^|\s][ \t]*$/m.test(s);
  if (hasUnterminatedPipeRow(leftLf) !== hasUnterminatedPipeRow(rightLf)) {
    classes.push('row-no-trailing-pipe');
  }

  const listIndentMultiline = /^[ \t]+([-+*]|\d+[.)]|[a-zA-Z][.)])\s/m;
  if (listIndentMultiline.test(leftLf) || listIndentMultiline.test(rightLf)) {
    classes.push('list-indent-canonical');
  }

  const continuationIndentMultiline = /[^\n]\n[ \t]+(?![-+*>#]|\d+[.)])\S/;
  if (continuationIndentMultiline.test(leftLf) || continuationIndentMultiline.test(rightLf)) {
    classes.push('paragraph-continuation-indent');
  }

  const canonMarkerLine = (line: string): string =>
    line
      .replace(/^[ \t]+/, '')
      .replace(ORDERED_LIST_MARKER_RE, `${ORDERED_LIST_MARKER_CANONICAL}$1`);
  const leftLines = leftLf.split('\n');
  const rightLines = rightLf.split('\n');
  const markerLineCount = Math.min(leftLines.length, rightLines.length);
  for (let i = 0; i < markerLineCount; i++) {
    const l = leftLines[i] ?? '';
    const r = rightLines[i] ?? '';
    if (l !== r && canonMarkerLine(l) === canonMarkerLine(r) && /^[ \t]*\d+[.)]\s/.test(l)) {
      classes.push('ordered-list-marker-number');
      break;
    }
  }

  if (/[ \t]\n/.test(leftLf) || /[ \t]\n/.test(rightLf)) {
    classes.push('trailing-whitespace');
  }
  if (/[ \t]$/.test(leftLf) || /[ \t]$/.test(rightLf)) {
    if (!classes.includes('trailing-whitespace')) classes.push('trailing-whitespace');
  }

  if (/\n{3,}/.test(leftLf) || /\n{3,}/.test(rightLf)) {
    classes.push('blank-line-collapse');
  }
  if (leftLf.endsWith('\n') !== rightLf.endsWith('\n')) {
    classes.push('trailing-newline');
  }

  return classes;
}
