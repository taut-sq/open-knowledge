import { describe, expect, test } from 'bun:test';
import type { JSONContent } from '@tiptap/core';
import { sharedExtensions } from '../extensions/shared.ts';
import { protectFromMdx } from './autolink-void-html-guard.ts';
import { MarkdownManager } from './index.ts';
import { mdastToHtml } from './mdast-to-html.ts';
import { assertByteStable } from './round-trip-asserts.test-helper.ts';

const mdManager = new MarkdownManager({ extensions: sharedExtensions });

function roundTrip(md: string): string {
  return mdManager.serialize(mdManager.parse(md));
}

function collectText(node: JSONContent): string {
  let out = node.type === 'text' && typeof node.text === 'string' ? node.text : '';
  for (const child of node.content ?? []) out += collectText(child);
  return out;
}

function renderedAsLiteralText(md: string): boolean {
  const text = collectText(mdManager.parse(md));
  return text.includes('<img') || text.includes('<video') || text.includes('<audio');
}

describe('R23: autolink regression fix', () => {
  test('autolink <https://example.com> parses without error', () => {
    expect(() => mdManager.parse('Visit <https://example.com>.\n')).not.toThrow();
  });

  test('autolink round-trips', () => {
    const md = 'Visit <https://example.com>.\n';
    const output = roundTrip(md);
    expect(output).toContain('https://example.com');
  });
});

describe('R23: void HTML regression fix', () => {
  test('<br> parses without error', () => {
    expect(() => mdManager.parse('Line one<br>Line two.\n')).not.toThrow();
  });

  test('<br> round-trips', () => {
    const md = 'Line one<br>Line two.\n';
    const output = roundTrip(md);
    expect(output).toContain('<br>');
  });

  test('<hr> parses without error', () => {
    expect(() => mdManager.parse('Above\n\n<hr>\n\nBelow\n')).not.toThrow();
  });

  test('<img> parses without error', () => {
    expect(() => mdManager.parse('<img src="photo.jpg">\n')).not.toThrow();
  });

  test('<br/> self-closing parses without error', () => {
    expect(() => mdManager.parse('Line<br/>break.\n')).not.toThrow();
  });
});

describe('R23: self-closing media tags render at any length', () => {
  const longAlt = 'a lone sailboat on calm rippled water under high cirrus clouds '.repeat(6);

  test('long-alt <img/> is not literal text', () => {
    const md = `<img src="./photo.jpg" alt="${longAlt}" width="320" />\n`;
    expect(md.length).toBeGreaterThan(256);
    expect(renderedAsLiteralText(md)).toBe(false);
  });

  test('data-URI <img/> is not literal text', () => {
    expect(
      renderedAsLiteralText(`<img src="data:image/png;base64,${'A'.repeat(800)}" alt="x" />\n`),
    ).toBe(false);
  });

  test('long <video/> and <audio/> are not literal text', () => {
    expect(renderedAsLiteralText(`<video src="v.mp4" controls aria-label="${longAlt}" />\n`)).toBe(
      false,
    );
    expect(renderedAsLiteralText(`<audio src="a.mp3" controls aria-label="${longAlt}" />\n`)).toBe(
      false,
    );
  });

  test('bare void <img> (no slash) stays literal text regardless of length', () => {
    expect(renderedAsLiteralText(`<img src="x.png" alt="${longAlt}">\n`)).toBe(true);
  });

  test('two long self-closing <img/> separated by a caption both render', () => {
    const md = `## Photos\n\n<img src="./a.jpg" alt="${longAlt}" width="320" />\n\n*caption*\n\n<img src="./b.jpg" alt="${longAlt}" width="480" />\n`;
    expect(renderedAsLiteralText(md)).toBe(false);
  });

  test('long self-closing <img/> round-trips with src and alt intact', () => {
    const md = `<img src="./photo.jpg" alt="${longAlt}" width="320" />\n`;
    const out = roundTrip(md);
    expect(out).toContain('./photo.jpg');
    expect(out).toContain('high cirrus');
  });
});

describe('R23: invalid JSX opener recovery', () => {
  test('literal <50ms in prose parses without error', () => {
    expect(() => mdManager.parse('Warm replay when nothing changed is <50ms.\n')).not.toThrow();
  });

  test('literal <50ms in prose remains literal text in parsed content', () => {
    const json = mdManager.parse('Warm replay when nothing changed is <50ms.\n');
    expect(json.content?.[0]?.type).toBe('paragraph');
    expect(json.content?.[0]?.content?.[0]?.text).toBe(
      'Warm replay when nothing changed is <50ms.',
    );
  });

  test('comparison prose 2 < 5 remains literal text in parsed content', () => {
    const json = mdManager.parse('Comparison: 2 < 5 and 7 > 3.\n');
    expect(json.content?.[0]?.type).toBe('paragraph');
    expect(json.content?.[0]?.content?.[0]?.text).toBe('Comparison: 2 < 5 and 7 > 3.');
  });
});

describe('R23 guard: exhaustive < context coverage', () => {
  const mustNotThrow: Array<[string, string]> = [
    ['<https://example.com>', 'autolink https'],
    ['<mailto:a@b.com>', 'autolink mailto'],
    ['<ftp://files.x/p>', 'autolink ftp'],

    ['<br>', 'void br'],
    ['<hr>', 'void hr'],
    ['<img src="x">', 'void img with attr'],
    ['<br/>', 'self-closing br'],
    ['<br />', 'self-closing br with space'],

    ['<div>content</div>', 'div block'],
    ['<span>inline</span>', 'span inline'],
    ['<p>paragraph</p>', 'p tag'],

    ['<Callout>body</Callout>', 'paired MDX'],
    ['<Note>text</Note>', 'paired MDX inline'],
    ['<Icon />', 'self-closing MDX'],
    ['<Widget\n  title="hello"\n/>', 'multi-line self-closing JSX'],
    ['<Card\n  variant="warning"\n  />', 'multi-line self-closing with trailing space'],
    ['<Image src="https://example.com?a=1&b=2" />', 'self-closing with URL in attr'],
    ['<Chart data="https://api.example.com/v1" />', 'self-closing with URL path in attr'],
    ['<Link href="/path/to/page" />', 'self-closing with relative path in attr'],

    ['<', 'bare < at EOF'],
    ['< ', 'bare < + space'],
    ['<\n', 'bare < + newline'],
    ['a<b', 'inline <letter'],
    ['a < b', '< with spaces (comparison)'],
    ['<foo', 'unclosed <lowercase'],
    ['<foo bar', 'unclosed <lowercase with text'],
    ['<Foo', 'unclosed <Uppercase'],
    ['<foo>', 'lowercase tag (closed)'],

    ['<!-- comment -->', 'HTML comment'],
    ['<!-- <nested> -->', 'HTML comment with angle brackets'],
    ['<!--\nmultiline\n-->', 'multiline HTML comment'],

    ['<b>bold</b> and <foo unclosed', 'valid HTML + bare <'],
    ['if (x < y) return', 'code-like comparison'],
    ['a < b && c > d', 'double comparison'],
    ['<Callout>see <https://url></Callout>', 'MDX + autolink inside'],
    ['<Note>has <br> inside</Note>', 'MDX + void HTML inside'],

    ['<<<', 'triple <'],
    ['<><>', 'empty angle pairs'],
    ['<{expr}>', 'JSX expression-like'],
    ['< Component >', 'space after < (not JSX)'],
    ['<_private>', 'underscore start (mdx claims _)'],
    ['<$special>', 'dollar start (mdx claims $)'],
    ['<_', 'bare underscore-start unclosed'],
    ['<$', 'bare dollar-start unclosed'],

    ['The value is <unknown at this time', 'prose with <word'],
    ['Use Ctrl+< to go back', 'keyboard shortcut'],
    ['Template: <placeholder>', 'template-like'],
    ['Compare: 3 <foo> 5', 'comparison with word in angles'],

    ['</', 'bare </ at EOF'],
    ['</foo', 'incomplete close tag'],
    ['</Callout', 'incomplete uppercase close tag'],

    ['{', 'bare { at EOF'],
    ['{ ', 'bare { + space'],
    ['text {', 'text then bare {'],
    ['{ unclosed', 'unclosed {'],
    ['a{b', 'inline {letter'],
    ['{a', 'bare {letter at EOF'],
    ['{{', 'double {'],
    ['{{{', 'triple {'],
    ['{a{b', 'nested unmatched {'],

    ['{expression}', 'valid MDX expression'],
    ['{/* comment */}', 'MDX comment expression'],
    ['{}', 'empty MDX expression'],
    ['{123}', 'numeric MDX expression'],
    ['{true}', 'boolean MDX expression'],
    ['{{}}', 'nested matched braces'],

    ['<foo and {bar', 'bare < and bare { together'],
    ['<Callout>{content}</Callout>', 'MDX with expression inside'],
    ['{expression} and <br>', 'expression + void HTML'],
  ];

  for (const [input, label] of mustNotThrow) {
    test(`does not throw: ${label}`, () => {
      expect(() => mdManager.parse(input)).not.toThrow();
    });
  }
});

describe('R6a: safeText idempotency for §2.4 ambiguous chars', () => {
  const CHARS_AC = ['\\', '*', '_', '#', '<', '>', '{', '}'];

  for (const c of CHARS_AC) {
    test(`round-trip stable — bare "${c}"`, () => {
      const r1 = roundTrip(c);
      const r2 = roundTrip(r1);
      expect(r2).toBe(r1);
    });

    test(`round-trip stable — escaped "\\${c}"`, () => {
      const r1 = roundTrip(`\\${c}`);
      const r2 = roundTrip(r1);
      expect(r2).toBe(r1);
    });
  }

  test('double-escape stable (5 rounds) — "\\{"', () => {
    let s = '\\{';
    const outputs: string[] = [];
    for (let i = 0; i < 5; i++) {
      s = roundTrip(s);
      outputs.push(s);
    }
    expect(new Set(outputs).size).toBe(1);
  });

  test('double-escape stable (5 rounds) — "\\\\{"', () => {
    let s = '\\\\{';
    const outputs: string[] = [];
    for (let i = 0; i < 5; i++) {
      s = roundTrip(s);
      outputs.push(s);
    }
    expect(new Set(outputs).size).toBe(1);
  });

  test('CDATA-shaped HTML block idempotent (R6 Finding 4)', () => {
    const cdata =
      '<![CDATA[\nfunction matchwo(a,b)\n{\n  if (a < b && a < 0) then {\n    return 1;\n\n  } else {\n\n    return 0;\n  }\n}\n]]>\nokay\n';
    const r1 = roundTrip(cdata);
    const r2 = roundTrip(r1);
    expect(r2).toBe(r1);
    const countBs = (s: string) => (s.match(/\\\\/g) ?? []).length;
    expect(countBs(r2)).toBe(countBs(r1));
  });

  test('escaped brace in MDX-adjacent context preserves escape', () => {
    const md = 'prose \\{expression}\n';
    const r1 = roundTrip(md);
    const r2 = roundTrip(r1);
    expect(r2).toBe(r1);
    expect(r1).toContain('\\{');
  });

  test('unmatched brace still protected (no crash) — fix does not regress R23', () => {
    expect(() => mdManager.parse('prose {unclosed\n')).not.toThrow();
    expect(() => mdManager.parse('unclosed}\nprose\n')).not.toThrow();
    expect(() => mdManager.parse('{nested {unclosed\n')).not.toThrow();
  });

  test('literal backslash before matched pair is still a literal', () => {
    expect(() => mdManager.parse('\\\\{a}\n')).not.toThrow();
  });
});

describe('R23 guard: angle-bracket link destinations', () => {
  function findNodes(node: unknown, type: string): Array<Record<string, unknown>> {
    const out: Array<Record<string, unknown>> = [];
    const rec = node as Record<string, unknown>;
    if (rec && typeof rec === 'object') {
      if (rec.type === type) out.push(rec);
      const children = rec.children;
      if (Array.isArray(children)) {
        for (const child of children) out.push(...findNodes(child, type));
      }
    }
    return out;
  }

  const expectByteStable = (md: string): void => assertByteStable(roundTrip, md);

  test('[link](</my uri>) parses to a link node with the space-bearing url', () => {
    const tree = mdManager.parseToMdast('[link](</my uri>)\n');
    const links = findNodes(tree, 'link');
    expect(links.length).toBe(1);
    expect(links[0].url).toBe('/my uri');
  });

  test('the destination < is not PUA-protected when the resource forms', () => {
    const src = '[link](</my uri>)';
    expect(protectFromMdx(src)).toBe(src);
  });

  test('angle destination link renders href /my%20uri', () => {
    const html = mdastToHtml(mdManager.parseToMdast('[link](</my uri>)\n'));
    expect(html).toContain('href="/my%20uri"');
    expect(html).toContain('>link</a>');
  });

  test('angle destination link round-trips byte-identically and idempotently', () => {
    expectByteStable('[link](</my uri>)\n');
  });

  test('image form ![img](</a b.png>) parses to an image and round-trips', () => {
    const tree = mdManager.parseToMdast('![img](</a b.png>)\n');
    const images = [...findNodes(tree, 'image'), ...findNodes(tree, 'mdxJsxFlowElement')];
    expect(images.length).toBeGreaterThanOrEqual(1);
    expectByteStable('![img](</a b.png>)\n');
  });

  test('uppercase-name space-bearing destination forms a link', () => {
    const tree = mdManager.parseToMdast('[x](<My uri>)\n');
    const links = findNodes(tree, 'link');
    expect(links.length).toBe(1);
    expect(links[0].url).toBe('My uri');
    expectByteStable('[x](<My uri>)\n');
  });

  const mustStayGuarded: Array<[string, string]> = [
    ['[link](</my uri', 'mid-typing: unclosed destination'],
    ['[link](</my uri>', 'mid-typing: destination closed, resource open'],
    ['[link](</my uri> junk)', 'resource fails after destination'],
    ['x](</a b>)', 'no label-start before ]('],
    ['link](</a b>)', 'label-start deleted mid-edit'],
    ['a](<', 'bare ](< at EOF'],
    ['a](</', 'bare ](</ at EOF'],
    ['[x] y](</a b>)', 'label already closed before ]('],
    ['[[page]](</a b>)', 'wikilink-consumed brackets before ]('],
    ['[a\\](</b c>)', 'escaped ] cannot end a label'],
    ['`a[b` ](</x y>)', 'code-span-consumed [ before ]('],
    ['[^fn](</a b>)', 'footnote-shaped label'],
    ['[a][b](</c d>)', 'reference-link-shaped label'],
    ['[a](</x \\> y>)', 'escaped > inside destination'],
    ['[a](</x <i:j> k>)', 'autolink inside destination'],
    ['[a](<x\ny>)', 'destination spans a line ending'],
    ['[link](</my uri> "t")', 'title after destination'],
    ['[link]( </my uri>)', 'whitespace between ( and <'],
    ['[a](</b c> )', 'whitespace between > and )'],
    [`[a](<${' '.repeat(2000)}x y>)`, 'destination exceeding the scan cap'],
  ];

  for (const [input, label] of mustStayGuarded) {
    test(`does not throw: ${label}`, () => {
      expect(() => mdManager.parse(`${input}\n`)).not.toThrow();
    });
  }

  test('conservative rejections form no link and stay byte-stable', () => {
    for (const src of [
      '[link](</my uri> "t")\n',
      '[link]( </my uri>)\n',
      '[a](</b c> )\n',
      'x](</a b>)\n',
      'link](</a b>)\n',
    ]) {
      const links = findNodes(mdManager.parseToMdast(src), 'link');
      expect(links.length).toBe(0);
      expectByteStable(src);
    }
  });

  test('rejected destination < stays PUA-protected', () => {
    expect(protectFromMdx('x](</a b>)')).toContain('\uE000');
    expect(protectFromMdx('[link](</my uri')).toContain('\uE000');
  });

  test('no-space angle destinations keep their current byte-stable behavior', () => {
    expectByteStable('[t](<u>)\n');
    expectByteStable('[link](<foo%20bar>)\n');
    expectByteStable('[link](</no-space>)\n');
  });
});
