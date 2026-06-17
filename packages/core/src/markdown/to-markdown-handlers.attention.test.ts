
import { describe, expect, test } from 'bun:test';
import type { JSONContent } from '@tiptap/core';
import type { Nodes } from 'mdast';
import { sharedExtensions } from '../extensions/shared.ts';
import { MarkdownManager } from './index.ts';
import { assertRoundTripIdempotent } from './round-trip-asserts.test-helper.ts';

const md = new MarkdownManager({ extensions: sharedExtensions });

const em = (t: string, sourceDelimiter: '*' | '_' = '*'): JSONContent => ({
  type: 'text',
  marks: [{ type: 'emphasis', attrs: { sourceDelimiter } }],
  text: t,
});
const strong = (t: string, sourceDelimiter: '**' | '__' = '**'): JSONContent => ({
  type: 'text',
  marks: [{ type: 'strong', attrs: { sourceDelimiter } }],
  text: t,
});
const text = (t: string): JSONContent => ({ type: 'text', text: t });
const paragraph = (...inline: JSONContent[]): JSONContent => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: inline }],
});

function allNodeTypes(markdown: string): string[] {
  const out: string[] = [];
  const walk = (node: Nodes): void => {
    out.push(node.type);
    if ('children' in node) {
      for (const child of node.children) {
        walk(child);
      }
    }
  };
  walk(md.parseToMdast(markdown));
  return out;
}

const expectByteStable = (out: string): void =>
  assertRoundTripIdempotent((s) => md.serialize(md.parse(s)), out);

describe('boundary-whitespace attention encode (WYSIWYG-shaped marks)', () => {
  test('emphasis with trailing space re-parses as emphasis via char-ref', () => {
    const out = md.serialize(paragraph(em('foo ')));
    expect(out).toBe('*foo&#x20;*\n');
    expect(allNodeTypes(out)).toContain('emphasis');
    expectByteStable(out);
  });

  test('emphasis with leading space does not degrade to a bullet list', () => {
    const out = md.serialize(paragraph(em(' foo')));
    expect(out).toBe('*&#x20;foo*\n');
    const types = allNodeTypes(out);
    expect(types).toContain('emphasis');
    expect(types).not.toContain('list');
    expectByteStable(out);
  });

  test('strong with trailing space re-parses as strong', () => {
    const out = md.serialize(paragraph(strong('foo ')));
    expect(out).toBe('**foo&#x20;**\n');
    expect(allNodeTypes(out)).toContain('strong');
    expectByteStable(out);
  });

  test('strong with leading space re-parses as strong', () => {
    const out = md.serialize(paragraph(strong(' foo')));
    expect(out).toBe('**&#x20;foo**\n');
    expect(allNodeTypes(out)).toContain('strong');
    expectByteStable(out);
  });

  test('underscore emphasis with trailing space keeps its delimiter form', () => {
    const out = md.serialize(paragraph(em('foo ', '_')));
    expect(out).toBe('_foo&#x20;_\n');
    expect(allNodeTypes(out)).toContain('emphasis');
    expectByteStable(out);
  });

  test('underscore strong with trailing space keeps its delimiter form', () => {
    const out = md.serialize(paragraph(strong('foo ', '__')));
    expect(out).toBe('__foo&#x20;__\n');
    expect(allNodeTypes(out)).toContain('strong');
    expectByteStable(out);
  });

  test('NBSP inside an emphasis boundary downgrades to an encoded space', () => {
    const out = md.serialize(paragraph(em('a\u00A0')));
    expect(out).toBe('*a&#x20;*\n');
    expect(allNodeTypes(out)).toContain('emphasis');
    expectByteStable(out);
  });

  test('whitespace-only emphasis survives', () => {
    const out = md.serialize(paragraph(em(' ')));
    expect(out).toBe('*&#x20;*\n');
    expect(allNodeTypes(out)).toContain('emphasis');
    expectByteStable(out);
  });

  test('trailing space emphasis flush against following text survives', () => {
    const out = md.serialize(paragraph(em('foo '), text('bar')));
    expect(out).toBe('*foo&#x20;*bar\n');
    expect(allNodeTypes(out)).toContain('emphasis');
    expectByteStable(out);
  });

  test('leading space emphasis flush against preceding text survives', () => {
    const out = md.serialize(paragraph(text('bar'), em(' foo')));
    expect(out).toBe('bar*&#x20;foo*\n');
    expect(allNodeTypes(out)).toContain('emphasis');
    expectByteStable(out);
  });

  test('whitespace on both the run boundary and its neighbor needs no outside encode', () => {
    const out = md.serialize(paragraph(text('a '), em(' x')));
    expect(out).toBe('a *&#x20;x*\n');
    expect(allNodeTypes(out)).toContain('emphasis');
    expectByteStable(out);
  });

  test('nested strong+emphasis with boundary space survives structurally', () => {
    const out = md.serialize(
      paragraph({
        type: 'text',
        marks: [
          { type: 'strong', attrs: { sourceDelimiter: '**' } },
          { type: 'emphasis', attrs: { sourceDelimiter: '*' } },
        ],
        text: 'x ',
      }),
    );
    expect(out).not.toMatch(/\\&/);
    const types = allNodeTypes(out);
    expect(types).toContain('strong');
    expect(types).toContain('emphasis');
    expectByteStable(out);
  });
});

describe('guard-irreducible adjacencies stay byte-identical to before', () => {
  test('letter before punctuation-fronted emphasis is left unencoded', () => {
    const out = md.serialize(paragraph(text('x'), em('.y.')));
    expect(out).toBe('x*.y.*\n');
    expect(out).not.toContain('&#');
  });

  test('letter after punctuation-tailed emphasis is left unencoded', () => {
    const out = md.serialize(paragraph(em('.y.'), text('z')));
    expect(out).toBe('*.y.*z\n');
    expect(out).not.toContain('&#');
  });

  test('intraword underscore emphasis is left unencoded', () => {
    const out = md.serialize(paragraph(text('a'), em('b', '_'), text('c')));
    expect(out).toBe('a_b_c\n');
    expect(out).not.toContain('&#');
  });

  test('underscore run with boundary space and letter neighbor is left unencoded', () => {
    const out = md.serialize(paragraph(em('foo ', '_'), text('bar')));
    expect(out).toBe('_foo _bar\n');
    expect(out).not.toContain('&#');
  });
});

describe('zero regression on already-valid boundaries', () => {
  test('plain emphasis and strong are byte-identical to before', () => {
    expect(md.serialize(paragraph(em('foo')))).toBe('*foo*\n');
    expect(md.serialize(paragraph(strong('foo')))).toBe('**foo**\n');
    expect(md.serialize(paragraph(em('foo', '_')))).toBe('_foo_\n');
    expect(md.serialize(paragraph(strong('foo', '__')))).toBe('__foo__\n');
  });

  test('parse-derived attention round-trips byte-identically', () => {
    const sources = [
      'x *y* z\n',
      '**a** b\n',
      'a _b_ c\n',
      '*.padded.* x\n',
      '.*foo*\n',
      'intra*word*em\n',
      '*&#x41;foo*\n',
    ];
    for (const src of sources) {
      expect(md.serialize(md.parse(src))).toBe(src);
    }
  });
});
