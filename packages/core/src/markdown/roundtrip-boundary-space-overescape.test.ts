
import { describe, expect, test } from 'bun:test';
import type { JSONContent } from '@tiptap/core';
import { sharedExtensions } from '../extensions/shared.ts';
import { MarkdownManager } from './index.ts';

const md = new MarkdownManager({ extensions: sharedExtensions });

const NBSP = '\u00A0';
const SPACE = ' ';
const TAB = '\t';

const strong = (t: string): JSONContent => ({
  type: 'text',
  marks: [{ type: 'strong', attrs: { sourceDelimiter: '**' } }],
  text: t,
});
const text = (t: string): JSONContent => ({ type: 'text', text: t });
const paragraph = (...inline: JSONContent[]): JSONContent => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: inline }],
});
const listItem = (...inline: JSONContent[]): JSONContent => ({
  type: 'doc',
  content: [
    {
      type: 'list',
      attrs: {
        ordered: false,
        start: 1,
        spread: false,
        bulletMarker: '-',
        listMarkerDelimiter: null,
      },
      content: [
        {
          type: 'listItem',
          attrs: { checked: null, spread: false },
          content: [{ type: 'paragraph', content: inline }],
        },
      ],
    },
  ],
});

const expectNoBoundaryOverEscape = (out: string): void => {
  expect(out).not.toContain('\\&#x20;');
  expect(out).not.toContain('\\&#x9;');
  expect(out).not.toMatch(/\\&#x?[0-9A-Fa-f]/);
};

describe('boundary whitespace must not over-escape — source NBSP round-trip (path i)', () => {
  const trailing: ReadonlyArray<readonly [string, string]> = [
    ['paragraph', `abc${NBSP}\n`],
    ['emphasis', `*a*${NBSP}\n`],
    ['strong', `**a**${NBSP}\n`],
    ['inline code', `\`a\`${NBSP}\n`],
    ['link', `[a](b)${NBSP}\n`],
    ['strikethrough', `~~a~~${NBSP}\n`],
    ['wiki-link', `[[a]]${NBSP}\n`],
    ['blockquote', `> a${NBSP}\n`],
    ['nested list item', `- x\n  - y${NBSP}\n`],
  ];
  for (const [label, src] of trailing) {
    test(`trailing NBSP after ${label}`, () => {
      expectNoBoundaryOverEscape(md.serialize(md.parse(src)));
    });
  }

  const leading: ReadonlyArray<readonly [string, string]> = [
    ['paragraph', `${NBSP}abc\n`],
    ['emphasis', `${NBSP}*a*\n`],
    ['strong', `${NBSP}**a**\n`],
    ['inline code', `${NBSP}\`a\`\n`],
    ['link', `${NBSP}[a](b)\n`],
    ['strikethrough', `${NBSP}~~a~~\n`],
    ['wiki-link', `${NBSP}[[a]]\n`],
    ['blockquote', `> ${NBSP}a\n`],
  ];
  for (const [label, src] of leading) {
    test(`leading NBSP before ${label}`, () => {
      expectNoBoundaryOverEscape(md.serialize(md.parse(src)));
    });
  }
});

describe('boundary whitespace must not over-escape — PM-doc text node (path ii)', () => {
  test('trailing regular space after strong', () => {
    expectNoBoundaryOverEscape(md.serialize(paragraph(strong('work.'), text(SPACE))));
  });
  test('leading regular space before strong', () => {
    expectNoBoundaryOverEscape(md.serialize(paragraph(text(SPACE), strong('bold'))));
  });
  test('trailing regular space after plain text', () => {
    expectNoBoundaryOverEscape(md.serialize(paragraph(text('abc'), text(SPACE))));
  });
  test('trailing regular space in list item', () => {
    expectNoBoundaryOverEscape(md.serialize(listItem(strong('x'), text(SPACE))));
  });

  test('trailing tab after strong', () => {
    expectNoBoundaryOverEscape(md.serialize(paragraph(strong('work.'), text(TAB))));
  });
  test('leading tab before strong', () => {
    expectNoBoundaryOverEscape(md.serialize(paragraph(text(TAB), strong('bold'))));
  });
  test('trailing tab in list item', () => {
    expectNoBoundaryOverEscape(md.serialize(listItem(strong('x'), text(TAB))));
  });
});

describe('guard: user-authored entities round-trip byte-identically (no over-correction)', () => {
  test('bare numeric entity', () => {
    expect(md.serialize(md.parse('a&#x41;b\n'))).toBe('a&#x41;b\n');
  });
  test('bare whitespace numeric entity (hex space)', () => {
    expect(md.serialize(md.parse('a&#x20;b\n'))).toBe('a&#x20;b\n');
  });
  test('bare whitespace numeric entity (decimal space)', () => {
    expect(md.serialize(md.parse('a&#32;b\n'))).toBe('a&#32;b\n');
  });
  test('bare whitespace numeric entity (hex tab)', () => {
    expect(md.serialize(md.parse('a&#x9;b\n'))).toBe('a&#x9;b\n');
  });
  test('bare named entity', () => {
    expect(md.serialize(md.parse('a&amp;b\n'))).toBe('a&amp;b\n');
  });
  test('escaped named entity', () => {
    expect(md.serialize(md.parse('a\\&ouml;b\n'))).toBe('a\\&ouml;b\n');
  });
  test('escaped non-whitespace numeric entity (hex)', () => {
    expect(md.serialize(md.parse('a\\&#x41;b\n'))).toBe('a\\&#x41;b\n');
  });
  test('escaped non-whitespace numeric entity (decimal)', () => {
    expect(md.serialize(md.parse('a\\&#65;b\n'))).toBe('a\\&#65;b\n');
  });
  test('user-authored escaped numeric entity (byte-identical to the corruption)', () => {
    expect(md.serialize(md.parse('Entity \\&#x20; stays.\n'))).toBe('Entity \\&#x20; stays.\n');
  });
});

describe('guard: heading / table asymmetry — a fix must not start encoding them', () => {
  test('ATX heading with trailing NBSP', () => {
    expect(md.serialize(md.parse(`# h${NBSP}\n`))).not.toContain('\\&#x20;');
  });
  test('table cell with trailing NBSP', () => {
    const tbl = `| a${NBSP} | b |\n| --- | --- |\n| c | d |\n`;
    expect(md.serialize(md.parse(tbl))).not.toContain('\\&#x20;');
  });
});
