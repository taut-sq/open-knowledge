import { describe, expect, test } from 'bun:test';
import { sharedExtensions } from '../extensions/shared.ts';
import { MarkdownManager } from './index.ts';

const md = new MarkdownManager({ extensions: sharedExtensions });
const rt = (s: string): string => md.serialize(md.parse(s));

const expectStable = (src: string, out: string): void => {
  const once = rt(src);
  expect(once).toBe(out);
  expect(rt(once)).toBe(out);
};

const stripTree = (n: unknown): unknown => {
  if (Array.isArray(n)) return n.map(stripTree);
  if (n && typeof n === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(n as Record<string, unknown>)) {
      if (k === 'position' || k === 'data') continue;
      out[k] = stripTree(v);
    }
    return out;
  }
  return n;
};

const expectContentPreserved = (src: string): void => {
  expect(stripTree(md.parseToMdast(rt(src)))).toEqual(stripTree(md.parseToMdast(src)));
};

describe('char-ref-inert escape churn (the entity is a bystander)', () => {
  test('punct-inner asterisk run after a numeric char ref gains escapes, stays lossless', () => {
    expectStable('a&#x41;*.y.*', 'a&#x41;\\*.y.\\*\n');
    expectContentPreserved('a&#x41;*.y.*');
  });

  test('entity bytes survive verbatim through the escape churn', () => {
    expect(rt('a&#x41;*.y.*')).toContain('a&#x41;');
  });

  test('the decoded twin escapes identically (the char ref does not alter the escape)', () => {
    expectStable('aA*.y.*', 'aA\\*.y.\\*\n');
  });

  test('the no-ref control produces the same escape', () => {
    expectStable('a*.y.*', 'a\\*.y.\\*\n');
  });
});

describe('char-ref-causal PUA-flanking divergence (the char ref alters escaping)', () => {
  test('underscore run after a numeric char ref escapes both delimiters, stays lossless', () => {
    expectStable('a&#x41;_foo_', 'a&#x41;\\_foo\\_\n');
    expectContentPreserved('a&#x41;_foo_');
    expect(rt('a&#x41;_foo_')).toContain('a&#x41;');
  });

  test('the decoded twin diverges: intraword opener stays bare, only the closer escapes', () => {
    expectStable('aA_foo_', 'aA_foo\\_\n');
  });

  test('punct-inner asterisk run after a named char ref escapes both delimiters, stays lossless', () => {
    expectStable('a&amp;*.y.*', 'a&amp;\\*.y.\\*\n');
    expectContentPreserved('a&amp;*.y.*');
    expect(rt('a&amp;*.y.*')).toContain('a&amp;');
  });

  test('the decoded twin diverges: the bare ampersand form round-trips byte-exact with zero escapes', () => {
    expectStable('a&*.y.*', 'a&*.y.*\n');
    expect(rt('a&*.y.*')).not.toContain('\\');
  });

  test('the causal pairs differ in escape count, never in entity bytes or content', () => {
    const refUnderscore = rt('a&#x41;_foo_');
    const decodedUnderscore = rt('aA_foo_');
    expect((refUnderscore.match(/\\/g) ?? []).length).toBe(2);
    expect((decodedUnderscore.match(/\\/g) ?? []).length).toBe(1);

    const refAmp = rt('a&amp;*.y.*');
    const decodedAmp = rt('a&*.y.*');
    expect((refAmp.match(/\\/g) ?? []).length).toBe(2);
    expect((decodedAmp.match(/\\/g) ?? []).length).toBe(0);
  });
});
