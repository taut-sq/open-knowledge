
import { describe, expect, test } from 'bun:test';
import type { JSONContent } from '@tiptap/core';
import { sharedExtensions } from '../extensions/shared.ts';
import { MarkdownManager } from './index.ts';
import { assertByteStable } from './round-trip-asserts.test-helper.ts';

const md = new MarkdownManager({ extensions: sharedExtensions });

function findInJson(json: JSONContent, predicate: (n: JSONContent) => boolean): JSONContent | null {
  if (predicate(json)) return json;
  for (const child of json.content ?? []) {
    const found = findInJson(child, predicate);
    if (found) return found;
  }
  return null;
}

function countInJson(json: JSONContent, predicate: (n: JSONContent) => boolean): number {
  let count = predicate(json) ? 1 : 0;
  for (const child of json.content ?? []) {
    count += countInJson(child, predicate);
  }
  return count;
}

const isMath = (n: JSONContent) => n.type === 'mathInline';

const expectByteStable = (source: string): void =>
  assertByteStable((s) => md.serialize(md.parse(s)), source);

function expectReparsesAsMath(emitted: string, formula: string) {
  const json = md.parse(emitted);
  expect(countInJson(json, isMath)).toBe(1);
  expect(findInJson(json, isMath)?.attrs?.formula).toBe(formula);
}

describe('single-dollar capture: `$x$` round-trips byte-identical', () => {
  test('`$x$` mid-prose round-trips byte-identical', () => {
    expectByteStable('A formula $x$ in prose.\n');
  });

  test('`$x^2$` round-trips byte-identical', () => {
    expectByteStable('Result: $x^2$.\n');
  });

  test('the captured delimiter lands on the mathInline atom', () => {
    const json = md.parse('A formula $x$ in prose.\n');
    const node = findInJson(json, isMath);
    expect(node?.attrs?.formula).toBe('x');
    expect(node?.attrs?.sourceDelimiter).toBe('$');
  });

  test('`$$x$$` keeps the paired-double form', () => {
    expectByteStable('Result: $$x^2$$.\n');
    const node = findInJson(md.parse('Result: $$x^2$$.\n'), isMath);
    expect(node?.attrs?.sourceDelimiter).toBe('$$');
  });

  test('mixed `$a$` and `$$b$$` in one paragraph each keep their form', () => {
    expectByteStable('Both $a$ and $$b$$ here.\n');
  });

  test('adjacent single-dollar maths `$y$$x$` round-trip byte-identical', () => {
    const source = '$y$$x$\n';
    const json = md.parse(source);
    expect(countInJson(json, isMath)).toBe(2);
    expect(md.serialize(json)).toBe(source);
  });

  test('LaTeX command body `$\\alpha$` round-trips byte-identical', () => {
    expectByteStable('Greek $\\alpha$ letter.\n');
  });
});

describe('currency precision: the promoter boundary is unchanged', () => {
  test('`Pay $5 to $10 dollars` stays prose, byte-identical', () => {
    const source = 'Pay $5 to $10 dollars.\n';
    expect(countInJson(md.parse(source), isMath)).toBe(0);
    expectByteStable(source);
  });

  test('`$PATH and $HOME` stays prose, byte-identical', () => {
    const source = '$PATH and $HOME\n';
    expect(countInJson(md.parse(source), isMath)).toBe(0);
    expectByteStable(source);
  });

  test('`$x$5` (digit after close) stays prose, byte-identical', () => {
    const source = 'value $x$5 here\n';
    expect(countInJson(md.parse(source), isMath)).toBe(0);
    expectByteStable(source);
  });

  test('`Cost $5$ each` parses as math (documented edge) and round-trips', () => {
    const source = 'Cost $5$ each\n';
    expect(countInJson(md.parse(source), isMath)).toBe(1);
    expectByteStable(source);
  });
});

describe('demotion boundary: a stale single-$ capture never emits bytes the promoter rejects', () => {
  function parsedCarrier(): JSONContent {
    const json = md.parse('A $x$ b\n');
    expect(findInJson(json, isMath)?.attrs?.sourceDelimiter).toBe('$');
    return json;
  }

  test('digit typed right after the atom demotes to `$$…$$`', () => {
    const json = parsedCarrier();
    const para = json.content?.[0];
    const after = para?.content?.[2];
    expect(after?.text).toBe(' b');
    if (after) after.text = '5 b';
    const out = md.serialize(json);
    expect(out).toBe('A $$x$$5 b\n');
    expectReparsesAsMath(out, 'x');
  });

  test('formula edited to contain `$` demotes and grows the fence', () => {
    const json = parsedCarrier();
    const node = findInJson(json, isMath);
    if (node?.attrs) node.attrs.formula = 'a$b';
    const out = md.serialize(json);
    expect(out).toBe('A $$a$b$$ b\n');
    expectReparsesAsMath(out, 'a$b');
  });

  test('formula edited to start with whitespace demotes', () => {
    const json = parsedCarrier();
    const node = findInJson(json, isMath);
    if (node?.attrs) node.attrs.formula = ' x';
    const out = md.serialize(json);
    expectReparsesAsMath(out, ' x');
  });

  test('formula edited to end with a backslash demotes (raw math text keeps it)', () => {
    const json = parsedCarrier();
    const node = findInJson(json, isMath);
    if (node?.attrs) node.attrs.formula = 'x\\';
    const out = md.serialize(json);
    expectReparsesAsMath(out, 'x\\');
  });

  test('formula with an escape-active backslash sequence demotes (prose re-parse would eat it)', () => {
    const json = parsedCarrier();
    const node = findInJson(json, isMath);
    if (node?.attrs) node.attrs.formula = 'a\\*b';
    const out = md.serialize(json);
    expectReparsesAsMath(out, 'a\\*b');
  });

  test('WYSIWYG-inserted math (no captured delimiter) keeps the `$$…$$` default', () => {
    const json = parsedCarrier();
    const node = findInJson(json, isMath);
    if (node?.attrs) node.attrs.sourceDelimiter = null;
    expect(md.serialize(json)).toBe('A $$x$$ b\n');
  });
});
