import { describe, expect, test } from 'bun:test';
import type { JSONContent } from '@tiptap/core';
import { sharedExtensions } from '../extensions/shared.ts';
import { MarkdownManager } from './index.ts';

const md = new MarkdownManager({ extensions: sharedExtensions });

type PmJSON = JSONContent;

function toJSON(node: unknown): PmJSON {
  const n = node as { toJSON?: () => PmJSON };
  return n && typeof n.toJSON === 'function' ? n.toJSON() : (node as PmJSON);
}

function pmText(node: unknown, out: string[] = []): string {
  const n = toJSON(node);
  if (!n || typeof n !== 'object') return out.join('');
  if (typeof n.text === 'string') out.push(n.text);
  if (Array.isArray(n.content)) for (const c of n.content) pmText(c, out);
  return out.join('');
}

function pmSourceLiteralSegments(
  node: unknown,
  out: Array<{ text: string; sourceRaw: string }> = [],
): Array<{ text: string; sourceRaw: string }> {
  const n = toJSON(node);
  if (!n || typeof n !== 'object') return out;
  if (typeof n.text === 'string' && Array.isArray(n.marks)) {
    const mark = n.marks.find((mk) => (mk as { type?: string }).type === 'sourceLiteral') as
      | { attrs?: { sourceRaw?: string } }
      | undefined;
    if (mark) out.push({ text: n.text, sourceRaw: mark.attrs?.sourceRaw ?? '' });
  }
  if (Array.isArray(n.content)) for (const c of n.content) pmSourceLiteralSegments(c, out);
  return out;
}

describe('boundary-whitespace char-ref displays decoded in the PM doc (RED — the reported bug)', () => {
  test('interior boundary space displays as a real space, not literal &#x20;', () => {
    const shown = pmText(md.parse('a&#x20;b\n'));
    expect(shown).not.toContain('&#x20;');
    expect(shown).toBe('a b');
  });

  test('trailing boundary space displays as a real space (trailing-trim risk)', () => {
    const shown = pmText(md.parse('abc&#x20;\n'));
    expect(shown).not.toContain('&#x20;');
    expect(shown).toBe('abc ');
  });

  test('leading boundary space displays as a real space', () => {
    const shown = pmText(md.parse('&#x20;abc\n'));
    expect(shown).not.toContain('&#x20;');
    expect(shown).toBe(' abc');
  });

  test('decimal space form (&#32;) decodes for display', () => {
    expect(pmText(md.parse('a&#32;b\n'))).toBe('a b');
  });

  test('hex tab form (&#x9;) decodes for display', () => {
    expect(pmText(md.parse('a&#x9;b\n'))).toBe('a\tb');
  });

  test('decoded boundary space carries sourceLiteral.sourceRaw for byte-fidelity', () => {
    expect(pmSourceLiteralSegments(md.parse('a&#x20;b\n'))).toEqual([
      { text: ' ', sourceRaw: '&#x20;' },
    ]);
  });

  test('decoded boundary tab carries sourceLiteral.sourceRaw', () => {
    expect(pmSourceLiteralSegments(md.parse('a&#x9;b\n'))).toEqual([
      { text: '\t', sourceRaw: '&#x9;' },
    ]);
  });

  test('adjacent identical refs display as multiple spaces in ONE coalesced segment', () => {
    expect(pmText(md.parse('a&#x20;&#x20;b\n'))).toBe('a  b');
    expect(pmSourceLiteralSegments(md.parse('a&#x20;&#x20;b\n'))).toEqual([
      { text: '  ', sourceRaw: '&#x20;&#x20;' },
    ]);
  });

  test('adjacent identical tab refs coalesce', () => {
    expect(pmText(md.parse('a&#x9;&#x9;b\n'))).toBe('a\t\tb');
    expect(pmSourceLiteralSegments(md.parse('a&#x9;&#x9;b\n'))).toEqual([
      { text: '\t\t', sourceRaw: '&#x9;&#x9;' },
    ]);
  });

  test('mixed adjacent whitespace refs coalesce into one segment', () => {
    expect(pmText(md.parse('a&#x20;&#x9;b\n'))).toBe('a \tb');
    expect(pmSourceLiteralSegments(md.parse('a&#x20;&#x9;b\n'))).toEqual([
      { text: ' \t', sourceRaw: '&#x20;&#x9;' },
    ]);
  });

  test('a long run (n>=4) coalesces into ONE segment, not two equal-mark pairs', () => {
    expect(pmText(md.parse('a&#x20;&#x20;&#x20;&#x20;b\n'))).toBe('a    b');
    expect(pmSourceLiteralSegments(md.parse('a&#x20;&#x20;&#x20;&#x20;b\n'))).toEqual([
      { text: '    ', sourceRaw: '&#x20;&#x20;&#x20;&#x20;' },
    ]);
  });

  test('whitespace refs do NOT coalesce across an interleaved non-whitespace entity', () => {
    expect(pmText(md.parse('a&#x20;&amp;&#x20;b\n'))).toBe('a &amp; b');
    expect(pmSourceLiteralSegments(md.parse('a&#x20;&amp;&#x20;b\n'))).toEqual([
      { text: ' ', sourceRaw: '&#x20;' },
      { text: '&amp;', sourceRaw: '&amp;' },
      { text: ' ', sourceRaw: '&#x20;' },
    ]);
  });
});

describe('guard: byte-fidelity is unchanged by the display decode', () => {
  const byteStable = [
    'a&#x20;b\n',
    'abc&#x20;\n',
    '&#x20;abc\n',
    'a&#32;b\n',
    'a&#x9;b\n',
    'a&#x41;b\n',
    'a&amp;b\n',
    'a\\&#x20;b\n',
    'a&#x20;&#x20;b\n',
    'a&#x9;&#x9;b\n',
    'a&#x20;&#x20;&#x20;b\n',
    'a&#x20;&#x9;b\n',
    'a&#x20;&#x20;\n',
    '&#x20;&#x20;a\n',
    'a&#x20;&amp;&#x20;b\n',
    '**a&#x20;&#x20;b**\n',
    'a&#x20;&#x20;&#x20;&#x20;b\n',
    'a&#x20;&#x20;&#x20;&#x20;&#x20;b\n',
    'a&#x20;&#x20;&#x20;&#x20;&#x20;&#x20;b\n',
    'a&#x9;&#x9;&#x9;&#x9;b\n',
    'a&#x20;&#x9;&#x20;&#x9;&#x20;b\n',
  ] as const;
  for (const src of byteStable) {
    test(`round-trips byte-identically: ${JSON.stringify(src)}`, () => {
      expect(md.serialize(md.parse(src))).toBe(src);
    });
  }
});

describe('guard: scope is strictly whitespace numeric refs (locked non-goal)', () => {
  test('non-whitespace numeric ref (&#x41; = "A") stays literal in display', () => {
    expect(pmText(md.parse('a&#x41;b\n'))).toBe('a&#x41;b');
  });
  test('named ref (&amp;) stays literal in display', () => {
    expect(pmText(md.parse('a&amp;b\n'))).toBe('a&amp;b');
  });
  test('a user-escaped \\&#x20; stays literal (escape = literal intent)', () => {
    expect(pmText(md.parse('x\\&#x20;y\n'))).toContain('&#x20;');
  });
});
