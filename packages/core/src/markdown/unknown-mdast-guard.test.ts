import { describe, expect, test } from 'bun:test';
import type { Root as MdastRoot } from 'mdast';
import { VFile } from 'vfile';
import { unknownMdastGuardPlugin } from './unknown-mdast-guard.ts';

describe('unknownMdastGuardPlugin (R8 wildcard)', () => {
  test('leaves known mdast types unchanged', () => {
    const tree: MdastRoot = {
      type: 'root',
      children: [
        {
          type: 'paragraph',
          children: [{ type: 'text', value: 'hello' }],
          position: makePos(0, 5),
        },
      ],
    };
    const file = new VFile('hello');
    unknownMdastGuardPlugin()(tree, file);
    expect(tree.children[0]?.type).toBe('paragraph');
    // biome-ignore lint/suspicious/noExplicitAny: test inspects mdast shape
    expect((tree.children[0] as any).children[0].type).toBe('text');
  });

  test('replaces unknown top-level type with rawMdxFallbackMdast', () => {
    const src = '$$math$$';
    const tree = {
      type: 'root',
      children: [
        {
          type: 'someFutureType',
          position: makePos(0, src.length),
        },
      ],
    } as unknown as MdastRoot;
    unknownMdastGuardPlugin()(tree, new VFile(src));
    // biome-ignore lint/suspicious/noExplicitAny: test inspects mdast shape
    const child = tree.children[0] as any;
    expect(child.type).toBe('rawMdxFallbackMdast');
    expect(child.originalType).toBe('someFutureType');
    expect(child.value).toBe('$$math$$');
    expect(child.position.start.offset).toBe(0);
    expect(child.position.end.offset).toBe(src.length);
  });

  test('replaces unknown nested inline type (inside paragraph)', () => {
    const src = 'hello [[?]] world';
    const tree = {
      type: 'root',
      children: [
        {
          type: 'paragraph',
          position: makePos(0, src.length),
          children: [
            { type: 'text', value: 'hello ', position: makePos(0, 6) },
            { type: 'brandNewInlineType', position: makePos(6, 11) },
            { type: 'text', value: ' world', position: makePos(11, 17) },
          ],
        },
      ],
    } as unknown as MdastRoot;
    unknownMdastGuardPlugin()(tree, new VFile(src));
    // biome-ignore lint/suspicious/noExplicitAny: test inspects mdast shape
    const para = tree.children[0] as any;
    expect(para.type).toBe('paragraph');
    expect(para.children[0].type).toBe('text');
    expect(para.children[1].type).toBe('rawMdxFallbackMdast');
    expect(para.children[1].originalType).toBe('brandNewInlineType');
    expect(para.children[1].value).toBe('[[?]]');
    expect(para.children[2].type).toBe('text');
  });

  test('unknown type with no position degrades without fabricating type-name content', () => {
    const tree = {
      type: 'root',
      children: [{ type: 'typeWithoutPosition' }],
    } as unknown as MdastRoot;
    unknownMdastGuardPlugin()(tree, new VFile(''));
    // biome-ignore lint/suspicious/noExplicitAny: test inspects mdast shape
    const child = tree.children[0] as any;
    expect(child.type).toBe('rawMdxFallbackMdast');
    expect(child.originalType).toBe('typeWithoutPosition');
    expect(child.value).not.toBe('typeWithoutPosition');
    expect(child.value).toBe('');
    expect(child.unresolvedPosition).toBe(true);
  });

  test('does not recurse into a node it just replaced', () => {
    const src = '<<outer>> <<inner>>';
    const tree = {
      type: 'root',
      children: [
        {
          type: 'unknownOuter',
          position: makePos(0, src.length),
          children: [{ type: 'unknownInner', position: makePos(10, 19) }],
        },
      ],
    } as unknown as MdastRoot;
    unknownMdastGuardPlugin()(tree, new VFile(src));
    // biome-ignore lint/suspicious/noExplicitAny: test inspects mdast shape
    const outer = tree.children[0] as any;
    expect(outer.type).toBe('rawMdxFallbackMdast');
    expect(outer.originalType).toBe('unknownOuter');
    expect(outer.children).toBeUndefined();
    expect(outer.value).toBe(src);
  });

  test('recognizes known extended types (math, inlineMath, rawMdxFallbackMdast)', () => {
    const tree = {
      type: 'root',
      children: [
        { type: 'math', value: 'x^2', position: makePos(0, 3) },
        {
          type: 'paragraph',
          children: [{ type: 'inlineMath', value: 'y', position: makePos(4, 5) }],
        },
      ],
    } as unknown as MdastRoot;
    unknownMdastGuardPlugin()(tree, new VFile('x^2 y'));
    // biome-ignore lint/suspicious/noExplicitAny: test inspects mdast shape
    expect((tree.children[0] as any).type).toBe('math');
    // biome-ignore lint/suspicious/noExplicitAny: test inspects mdast shape
    expect((tree.children[1] as any).children[0].type).toBe('inlineMath');
  });

  test('end-to-end: synthetic unknown-type mdast does NOT throw whole-doc — block-level fallback', async () => {
    const { MarkdownManager } = await import('./index.ts');
    const { sharedExtensions } = await import('../extensions/shared.ts');
    const mgr = new MarkdownManager({ extensions: sharedExtensions });

    const md = '# Heading\n\nparagraph\n\n## Section\n';
    const result = mgr.parseWithFallback(md);
    expect(result.content?.length).toBeGreaterThan(1);
    expect(result.content?.[0]?.type).toBe('heading');
  });
});

describe('rawMdxFallbackMdast content preservation', () => {

  test('positioned node without offsets: fallback carries the source bytes, not the type name', () => {
    const tableBlock = '| Species | Count |\n| --- | --- |\n| Coho | 2 |';
    const src = `# Title\n\n${tableBlock}\n`;
    const tree = {
      type: 'root',
      children: [
        {
          type: 'futureTableVariant',
          position: {
            start: { line: 3, column: 1 },
            end: { line: 5, column: 13 },
          },
        },
      ],
    } as unknown as MdastRoot;
    unknownMdastGuardPlugin()(tree, new VFile(src));
    // biome-ignore lint/suspicious/noExplicitAny: test inspects mdast shape
    const child = tree.children[0] as any;
    expect(child.type).toBe('rawMdxFallbackMdast');
    expect(child.originalType).toBe('futureTableVariant');
    expect(child.value).not.toBe('futureTableVariant');
    expect(child.value).toBe(tableBlock);
    expect(child.unresolvedPosition).toBe(false);
  });

  test('zero-width span with offsets: fallback content is the (empty) slice, not the type name', () => {
    const src = 'hello world';
    const tree = {
      type: 'root',
      children: [
        {
          type: 'phantomMarker',
          position: {
            start: { line: 1, column: 6, offset: 5 },
            end: { line: 1, column: 6, offset: 5 },
          },
        },
      ],
    } as unknown as MdastRoot;
    unknownMdastGuardPlugin()(tree, new VFile(src));
    // biome-ignore lint/suspicious/noExplicitAny: test inspects mdast shape
    const child = tree.children[0] as any;
    expect(child.type).toBe('rawMdxFallbackMdast');
    expect(child.value).toBe('');
    expect(child.unresolvedPosition).toBe(false);
  });

  test('offsets beyond the source bounds: fallback must not fabricate type-name content', () => {
    const src = 'short doc\n';
    const tree = {
      type: 'root',
      children: [
        {
          type: 'staleSpanType',
          position: {
            start: { line: 99, column: 1, offset: 5000 },
            end: { line: 99, column: 20, offset: 5019 },
          },
        },
      ],
    } as unknown as MdastRoot;
    unknownMdastGuardPlugin()(tree, new VFile(src));
    // biome-ignore lint/suspicious/noExplicitAny: test inspects mdast shape
    const child = tree.children[0] as any;
    expect(child.type).toBe('rawMdxFallbackMdast');
    expect(child.value).not.toBe('staleSpanType');
    expect(child.value).toBe('');
    expect(child.unresolvedPosition).toBe(true);
  });

  test('line/column-only position with line beyond EOF: degrades to empty, not the type name', () => {
    const src = 'first line\nsecond line\n';
    const tree = {
      type: 'root',
      children: [
        {
          type: 'lineBeyondEofType',
          position: {
            start: { line: 7, column: 1 },
            end: { line: 7, column: 5 },
          },
        },
      ],
    } as unknown as MdastRoot;
    unknownMdastGuardPlugin()(tree, new VFile(src));
    // biome-ignore lint/suspicious/noExplicitAny: test inspects mdast shape
    const child = tree.children[0] as any;
    expect(child.type).toBe('rawMdxFallbackMdast');
    expect(child.originalType).toBe('lineBeyondEofType');
    expect(child.value).not.toBe('lineBeyondEofType');
    expect(child.value).toBe('');
    expect(child.unresolvedPosition).toBe(true);
  });

  test('line/column-only position with column past the line end: degrades to empty, not the type name', () => {
    const src = 'alpha\nbeta\n';
    const tree = {
      type: 'root',
      children: [
        {
          type: 'overlongColumnType',
          position: {
            start: { line: 1, column: 1 },
            end: { line: 1, column: 99 },
          },
        },
      ],
    } as unknown as MdastRoot;
    unknownMdastGuardPlugin()(tree, new VFile(src));
    // biome-ignore lint/suspicious/noExplicitAny: test inspects mdast shape
    const child = tree.children[0] as any;
    expect(child.type).toBe('rawMdxFallbackMdast');
    expect(child.originalType).toBe('overlongColumnType');
    expect(child.value).not.toBe('overlongColumnType');
    expect(child.value).toBe('');
    expect(child.unresolvedPosition).toBe(true);
  });

  test('inverted span (end before start) with in-bounds offsets: degrades to empty, not the type name', () => {
    const src = 'hello world';
    const tree = {
      type: 'root',
      children: [
        {
          type: 'invertedSpanType',
          position: {
            start: { line: 1, column: 9, offset: 8 },
            end: { line: 1, column: 4, offset: 3 },
          },
        },
      ],
    } as unknown as MdastRoot;
    unknownMdastGuardPlugin()(tree, new VFile(src));
    // biome-ignore lint/suspicious/noExplicitAny: test inspects mdast shape
    const child = tree.children[0] as any;
    expect(child.type).toBe('rawMdxFallbackMdast');
    expect(child.originalType).toBe('invertedSpanType');
    expect(child.value).not.toBe('invertedSpanType');
    expect(child.value).toBe('');
    expect(child.unresolvedPosition).toBe(true);
  });

  test('mixed points (offset-bearing start, line/column-only end): fallback slices the exact bytes', () => {
    const directive = '::directive::';
    const src = `intro\n${directive}\noutro\n`;
    const tree = {
      type: 'root',
      children: [
        {
          type: 'mixedPointDirective',
          position: {
            start: { offset: 6 },
            end: { line: 2, column: 14 },
          },
        },
      ],
    } as unknown as MdastRoot;
    unknownMdastGuardPlugin()(tree, new VFile(src));
    // biome-ignore lint/suspicious/noExplicitAny: test inspects mdast shape
    const child = tree.children[0] as any;
    expect(child.type).toBe('rawMdxFallbackMdast');
    expect(child.originalType).toBe('mixedPointDirective');
    expect(child.value).not.toBe('mixedPointDirective');
    expect(child.value).toBe(directive);
    expect(child.unresolvedPosition).toBe(false);
  });

  test('composed mixed-point failure (resolvable offset start, line beyond EOF end): degrades to empty', () => {
    const src = 'intro\nbody text\n';
    const tree = {
      type: 'root',
      children: [
        {
          type: 'partiallyResolvableType',
          position: {
            start: { offset: 6 },
            end: { line: 99, column: 1 },
          },
        },
      ],
    } as unknown as MdastRoot;
    unknownMdastGuardPlugin()(tree, new VFile(src));
    // biome-ignore lint/suspicious/noExplicitAny: test inspects mdast shape
    const child = tree.children[0] as any;
    expect(child.type).toBe('rawMdxFallbackMdast');
    expect(child.originalType).toBe('partiallyResolvableType');
    expect(child.value).not.toBe('partiallyResolvableType');
    expect(child.value).toBe('');
    expect(child.unresolvedPosition).toBe(true);
  });

  test('line or column below 1: degrades to empty, not the type name', () => {
    const src = 'content line\n';
    const tree = {
      type: 'root',
      children: [
        {
          type: 'zeroLineType',
          position: {
            start: { line: 0, column: 1 },
            end: { line: 1, column: 8 },
          },
        },
        {
          type: 'zeroColumnType',
          position: {
            start: { line: 1, column: 0 },
            end: { line: 1, column: 8 },
          },
        },
      ],
    } as unknown as MdastRoot;
    unknownMdastGuardPlugin()(tree, new VFile(src));
    // biome-ignore lint/suspicious/noExplicitAny: test inspects mdast shape
    const zeroLine = tree.children[0] as any;
    expect(zeroLine.type).toBe('rawMdxFallbackMdast');
    expect(zeroLine.value).not.toBe('zeroLineType');
    expect(zeroLine.value).toBe('');
    expect(zeroLine.unresolvedPosition).toBe(true);
    // biome-ignore lint/suspicious/noExplicitAny: test inspects mdast shape
    const zeroColumn = tree.children[1] as any;
    expect(zeroColumn.type).toBe('rawMdxFallbackMdast');
    expect(zeroColumn.value).not.toBe('zeroColumnType');
    expect(zeroColumn.value).toBe('');
    expect(zeroColumn.unresolvedPosition).toBe(true);
  });
});

function makePos(startOffset: number, endOffset: number) {
  return {
    start: { line: 1, column: startOffset + 1, offset: startOffset },
    end: { line: 1, column: endOffset + 1, offset: endOffset },
  };
}
