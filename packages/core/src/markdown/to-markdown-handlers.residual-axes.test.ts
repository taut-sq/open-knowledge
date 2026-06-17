
import { describe, expect, test } from 'bun:test';
import { sharedExtensions } from '../extensions/shared.ts';
import { MarkdownManager } from './index.ts';

const md = new MarkdownManager({ extensions: sharedExtensions });
const rt = (s: string): string => md.serialize(md.parse(s));

const expectByteExact = (src: string): void => {
  const expected = src.endsWith('\n') ? src : `${src}\n`;
  const once = rt(src);
  expect(once).toBe(expected);
  expect(rt(once)).toBe(expected);
};

describe('gfm-table: outer-pipe presence + dash-row padding', () => {
  test('pipe-less table round-trips byte-exact', () => {
    expectByteExact('col|val\n-|-\nalpha|99');
  });

  test('unpadded delimiter row keeps zero padding', () => {
    expectByteExact('|a|b|\n|-|-|\n|c|d|');
  });

  test('canonical padded table is unchanged', () => {
    expectByteExact('| a | b |\n| - | - |\n| c | d |');
  });

  test('leading-pipe-only style round-trips', () => {
    expectByteExact('|a|b\n|-|-\n|c|d');
  });

  test('alignment markers survive with zero padding', () => {
    expectByteExact('|a|b|\n|:-|-:|\n|c|d|');
  });

  test('mixed outer-pipe styles fall back to canonical (non-uniform: no capture)', () => {
    const out = rt('|a|b|\n-|-\nc|d');
    expect(out).toBe('|a|b|\n|-|-|\n|c|d|\n');
    expect(rt(out)).toBe(out);
  });

  test('stale outer-pipe capture with an emptied boundary cell falls back to piped form', () => {
    const json = md.parse('col|val\n-|-\nalpha|99');
    const firstRow = (
      json as unknown as {
        content: Array<{ type: string; content: Array<{ content: Array<unknown> }> }>;
      }
    ).content.find((n) => n.type === 'table');
    const firstCell = firstRow?.content[0]?.content[0] as { content?: unknown[] } | undefined;
    if (firstCell) firstCell.content = [];
    const out = md.serialize(json);
    expect(out.split('\n')[0]).toBe('||val|');
    expect(rt(out)).toBe(out);
  });
});

describe('list: marker spacing, ordinal replay, nested indent', () => {
  test('double-space marker spacing round-trips', () => {
    expectByteExact('-  item');
  });

  test('quad-space marker spacing round-trips', () => {
    expectByteExact('-    item');
  });

  test('all-ones ordered numbering is not force-incremented', () => {
    expectByteExact('1. a\n1. b');
  });

  test('descending-style numbering replays verbatim', () => {
    expectByteExact('3. a\n1. b\n1. c');
  });

  test('canonical incrementing numbering is unchanged', () => {
    expectByteExact('1. a\n2. b');
  });

  test('non-canonical nested-list indent round-trips', () => {
    expectByteExact('- a\n    - b');
  });

  test('canonical nested-list indent is unchanged', () => {
    expectByteExact('- a\n  - b');
  });

  test('three-level canonical nesting is idempotent (relative-indent capture)', () => {
    expectByteExact('- L1\n  - L2\n    - L3');
  });

  test('non-canonical indent on a doubly-nested list round-trips', () => {
    expectByteExact('- L1\n  - L2\n      - L3');
  });

  test('ordered marker spacing composes with ordinal replay', () => {
    expectByteExact('1.  a\n1.  b');
  });

  test('marker spacing of 5+ stays canonical (indented-code boundary)', () => {
    const out = rt('-     item');
    expect(rt(out)).toBe(out);
  });
});

describe('gfm-task: checkbox case', () => {
  test('uppercase [X] round-trips', () => {
    expectByteExact('- [X] done');
  });

  test('lowercase [x] round-trips', () => {
    expectByteExact('- [x] done');
  });

  test('unchecked task round-trips', () => {
    expectByteExact('- [ ] todo');
  });

  test('mixed-case task list round-trips per item', () => {
    expectByteExact('- [X] a\n- [x] b\n- [ ] c');
  });
});

describe('blockquote: marker-spacing counts', () => {
  test('double-space marker round-trips', () => {
    expectByteExact('>  quote');
  });

  test('triple-space marker round-trips', () => {
    expectByteExact('>   quote');
  });

  test('indented code inside a blockquote does not double its indent', () => {
    expectByteExact('>     code');
  });

  test('no-space marker still round-trips', () => {
    expectByteExact('>quote');
  });
});

describe('code-fence: closing length, leading indent, info padding', () => {
  test('longer closing fence round-trips', () => {
    expectByteExact('```\ncode\n````');
  });

  test('uniformly indented fence round-trips', () => {
    expectByteExact('  ```\n  code\n  ```');
  });

  test('info-string padding round-trips', () => {
    expectByteExact('```  js\ncode\n```');
  });

  test('single-space info padding round-trips', () => {
    expectByteExact('``` js\ncode\n```');
  });

  test('indent + info padding + closing length compose', () => {
    expectByteExact(' ```  ts\n code\n ````');
  });

  test('fence-recompute: synthesized value containing a closing run lengthens the fence', () => {
    const json = JSON.parse(JSON.stringify(md.parse('```\nplaceholder\n```')));
    const codeNode = (
      json as { content: Array<{ type: string; content?: Array<{ text?: string }> }> }
    ).content.find((n) => n.type === 'codeBlock');
    expect(codeNode).toBeDefined();
    if (codeNode?.content?.[0]) codeNode.content[0].text = 'a\n```\nb';
    const out = md.serialize(json as ReturnType<typeof md.parse>);
    expect(out).toBe('````\na\n```\nb\n````\n');
    expect(rt(out)).toBe(out);
  });
});

describe('atx heading: leading indent + interior space', () => {
  test('leading indent round-trips', () => {
    expectByteExact('   # Heading');
  });

  test('interior spacing round-trips', () => {
    expectByteExact('#   Heading');
  });

  test('indent + interior compose', () => {
    expectByteExact('  #  Heading');
  });

  test('interior spacing composes with a closing hash run', () => {
    expectByteExact('#   Heading ##');
  });

  test('heading inside a list item does not capture the container pad', () => {
    expectByteExact('1. item\n\n   # heading in item');
  });
});

describe('gfm-strikethrough: delimiter run', () => {
  test('single-tilde form round-trips', () => {
    expectByteExact('~x~ y');
  });

  test('double-tilde form round-trips', () => {
    expectByteExact('~~x~~ y');
  });

  test('both forms coexist per node', () => {
    expectByteExact('~a~ and ~~b~~');
  });
});

describe('wikiLink: authored padding survives the trim', () => {
  test('padded target round-trips', () => {
    expectByteExact('[[ Page ]]');
  });

  test('padded target + alias round-trip', () => {
    expectByteExact('[[Page | alias ]]');
  });

  test('padded anchor round-trips', () => {
    expectByteExact('[[Page# Anchor ]]');
  });

  test('unpadded forms are unchanged', () => {
    expectByteExact('[[Page]]');
    expectByteExact('[[Page|alias]]');
    expectByteExact('[[Page#Anchor|alias]]');
  });

  test('stale raw segment is dropped after a target edit', () => {
    const json = JSON.parse(JSON.stringify(md.parse('[[ Page ]]')));
    const para = (json as { content: Array<{ content?: Array<Record<string, unknown>> }> })
      .content[0];
    const wiki = para.content?.find((n) => n.type === 'wikiLink') as
      | { attrs: Record<string, unknown> }
      | undefined;
    expect(wiki).toBeDefined();
    if (wiki) wiki.attrs.target = 'Renamed';
    const out = md.serialize(json as ReturnType<typeof md.parse>);
    expect(out).toBe('[[Renamed]]\n');
  });
});

describe('inline-code: authored disambiguation pad', () => {
  test('padded inline code round-trips', () => {
    expectByteExact('a ` y ` b');
  });

  test('the intra-block multi-axis non-vacuity witness round-trips', () => {
    expectByteExact('one  \ntwo with ` y ` pad');
  });

  test('unpadded inline code is unchanged', () => {
    expectByteExact('a `y` b');
  });

  test('structurally-required padding still applies without capture', () => {
    expectByteExact('a `` `tick `` b');
  });
});

describe('inline-code: pipe re-escape inside a table cell', () => {

  test('escaped pipe inside inline code in a cell round-trips byte-exact', () => {
    expectByteExact('| `a\\|b` |\n| - |');
  });

  test('the emitted bytes re-parse as a table, not a paragraph', () => {
    const out = rt('| `a\\|b` |\n| - |\n');
    expect(md.parseToMdast(out).children[0]?.type).toBe('table');
  });

  test('every pipe in a multi-pipe code span re-escapes', () => {
    expectByteExact('| `a\\|b\\|c` |\n| - |');
  });

  test('fence disambiguation composes with the cell escape', () => {
    expectByteExact('| ``a`\\|b`` |\n| - |');
  });

  test('inline code outside a table never gains the cell escape', () => {
    expectByteExact('`a|b`');
    expectByteExact('`a\\|b`');
  });

  test('plain-text cell pipe escape is unchanged', () => {
    expectByteExact('| a\\|b |\n| - |');
  });

  test('padded code with a pipe keeps the escape; the pad capture is a separate open residual', () => {
    expect(rt('| ` a\\|b ` |\n| - |\n')).toBe('| `a\\|b` |\n| - |\n');
  });
});

describe('guard-sentinel literal collision (escape alphabet)', () => {
  test('authored guard sentinels U+E000-E004 round-trip byte-exact', () => {
    expectByteExact('literal \uE000\uE001\uE002\uE003\uE004 chars');
  });

  test('sentinel adjacent to guarded syntax round-trips', () => {
    expectByteExact('x\uE000y and <https://example.com>');
  });

  test('sentinel inside a fence info string round-trips', () => {
    expectByteExact('```l\uE000ng\ncode\n```');
  });

  test('escape alphabet U+E005-E009 is the documented reserved range', () => {
    expect(rt('esc \uE005 char')).toBe('esc \uE000 char\n');
  });
});

describe('already-byte-identical constructs stay untouched', () => {
  test('%%-comment padding is unchanged', () => {
    expectByteExact('%% padded comment %%');
  });

  test('callout case is unchanged', () => {
    expectByteExact('> [!note]\n> body');
  });

  test('details-quote form is unchanged', () => {
    expectByteExact('<details>\n\n<summary>t</summary>\n\n</details>');
  });
});
