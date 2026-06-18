import { describe, expect, test } from 'bun:test';
import { sharedExtensions } from '../extensions/shared.ts';
import { MarkdownManager } from './index.ts';

const md = new MarkdownManager({ extensions: sharedExtensions });
const rt = (s: string): string => md.serialize(md.parse(s));

const expectByteExact = (src: string): void => {
  const once = rt(src);
  expect(once).toBe(src);
  expect(rt(once)).toBe(src);
};

const expectStable = (src: string, out: string): void => {
  const once = rt(src);
  expect(once).toBe(out);
  expect(rt(once)).toBe(out);
};

describe('inert delimiters stay bare (over-escape cleared)', () => {
  test('whitespace-flanked asterisk round-trips byte-exact', () => {
    expectByteExact('a * b\n');
  });

  test('whitespace-flanked asterisk run round-trips byte-exact', () => {
    expectByteExact('a ** b\n');
  });

  test('intraword underscore round-trips byte-exact', () => {
    expectByteExact('a_b_c\n');
  });

  test('under_score round-trips without gaining a backslash', () => {
    expectByteExact('under_score\n');
  });

  test('snake_case identifiers in prose round-trip byte-exact', () => {
    expectByteExact('call snake_case_name with under_score args\n');
  });

  test('whitespace-flanked tilde round-trips byte-exact', () => {
    expectByteExact('word ~ word\n');
  });

  test('whitespace-flanked double tilde round-trips byte-exact', () => {
    expectByteExact('a ~~ b\n');
  });

  test('whitespace-flanked asterisk inside an ATX heading round-trips byte-exact', () => {
    expectByteExact('# a * b\n');
  });

  test('whitespace-flanked asterisk inside a blockquote round-trips byte-exact', () => {
    expectByteExact('> a * b\n');
  });

  test('inert asterisk keeps parsing as plain text after the bare round-trip', () => {
    const out = rt('a * b\n');
    const para = md.parseToMdast(out).children[0];
    expect(para?.type).toBe('paragraph');
    const children = (para as { children: Array<{ type: string; value?: string }> }).children;
    expect(children).toHaveLength(1);
    expect(children[0]?.type).toBe('text');
    expect(children[0]?.value).toBe('a * b');
  });

  test('intraword underscore inside an underscore-delimited emphasis stays bare', () => {
    expectByteExact('_x_y_\n');
    const para = md.parseToMdast('_x_y_\n').children[0];
    const em = (para as { children: Array<{ type: string; children?: Array<{ value?: string }> }> })
      .children[0];
    expect(em?.type).toBe('emphasis');
    expect(em?.children?.[0]?.value).toBe('x_y');
  });
});

describe('line-start = escapes only for the setext-underline shape', () => {
  test('padded highlight-like text does not gain a backslash', () => {
    expectByteExact('== foo ==\n');
  });

  test('mid-line double equals stays bare', () => {
    expectByteExact('x == y\n');
  });

  test('line-start = followed by prose stays bare', () => {
    expectByteExact('= line of prose\n');
  });

  test('non-contiguous equals line stays bare (not a setext-underline shape)', () => {
    expectByteExact('== ==\n');
  });

  test('lazy continuation line starting with = followed by prose stays bare', () => {
    expectByteExact('foo\n== bar\n');
  });

  test('pure = paragraph stays escaped (setext-underline shape)', () => {
    expectStable('==\n', '\\==\n');
  });

  test('escaped pure = line round-trips byte-exact', () => {
    expectByteExact('\\==\n');
  });

  test('escaped setext-underline shape after a soft break round-trips byte-exact', () => {
    expectByteExact('foo\n\\==\n');
  });

  test('escaped = before prose on a continuation line drops no bytes', () => {
    expectByteExact('foo\n\\= bar\n');
  });
});

describe('flanking-active delimiters still escape (precision sweep)', () => {
  test('escaped emphasis-able pair round-trips byte-exact', () => {
    expectByteExact('a \\*bc\\* d\n');
  });

  test('escaped full emphasis shape round-trips byte-exact', () => {
    expectByteExact('\\*foo\\*\n');
  });

  test('escaped left-flanking single asterisk round-trips byte-exact', () => {
    expectByteExact('a \\*b\n');
  });

  test('escaped underscore pair round-trips byte-exact', () => {
    expectByteExact('a \\_b\\_ c\n');
  });

  test('escaped tilde pairs round-trip byte-exact', () => {
    expectByteExact('a \\~\\~b\\~\\~ c\n');
  });

  test('line-start left-flanking asterisk still gains an escape', () => {
    expectStable('*x\n', '\\*x\n');
  });

  test('left-flanking asterisk mid-phrasing still gains an escape', () => {
    expectStable('a *b\n', 'a \\*b\n');
  });

  test('quote-flanked underscore still escapes (punctuation adjacency can open)', () => {
    expectStable('a "_" b\n', 'a "\\_" b\n');
  });

  test('text ending in bare asterisks before emphasis keeps the boundary escaped', () => {
    expectStable('foo***bar*\n', 'foo\\*\\**bar*\n');
    const para = md.parseToMdast('foo\\*\\**bar*\n').children[0];
    const children = (para as { children: Array<{ type: string; value?: string }> }).children;
    expect(children.map((c) => c.type)).toEqual(['text', 'emphasis']);
    expect(children[0]?.value).toBe('foo**');
  });

  test('text starting with bare asterisks after emphasis keeps the boundary escaped', () => {
    expectStable('*foo***bar\n', '*foo*\\*\\*bar\n');
    const para = md.parseToMdast('*foo*\\*\\*bar\n').children[0];
    const children = (para as { children: Array<{ type: string; value?: string }> }).children;
    expect(children.map((c) => c.type)).toEqual(['emphasis', 'text']);
    expect(children[1]?.value).toBe('**bar');
  });

  test('rule-of-three blocked shapes stay all-literal with every run escaped', () => {
    expectStable('foo**bar*\n', 'foo\\*\\*bar\\*\n');
    expectStable('*foo**bar\n', '\\*foo\\*\\*bar\n');
  });
});

describe('atBreak guards for * _ ~ are unchanged (list / thematic / fence threats)', () => {
  test('escaped list-marker shape at line start round-trips byte-exact', () => {
    expectByteExact('\\* foo\n');
  });

  test('line-start underscore before a space stays escaped (thematic-break guard)', () => {
    expectStable('_ foo\n', '\\_ foo\n');
  });

  test('line-start tilde before a space stays escaped (fence guard)', () => {
    expectStable('~ foo\n', '\\~ foo\n');
  });
});

describe('genuine formation cases are untouched', () => {
  test('emphasis, strong, strikethrough, and highlight round-trip byte-exact', () => {
    expectByteExact('*em*\n');
    expectByteExact('_em_\n');
    expectByteExact('**st**\n');
    expectByteExact('__st__\n');
    expectByteExact('~~del~~\n');
    expectByteExact('==hl==\n');
  });

  test('intraword strikethrough still parses and round-trips', () => {
    expectByteExact('a~~b~~c\n');
  });

  test('emphasis adjacent to inert delimiters round-trips byte-exact', () => {
    expectByteExact('a * b *em* c * d\n');
  });
});
