import { describe, expect, test } from 'bun:test';
import type { JSONContent } from '@tiptap/core';
import { sharedExtensions } from '../extensions/shared.ts';
import {
  loadIndentedJsxFixtures,
  loadLargeEmbedFixtures,
  loadPrd6955Before,
  loadPrd6955CorruptedTriplicated,
} from '../markdown/fixtures/index.ts';
import { MarkdownManager } from '../markdown/index.ts';
import { assertContentPreservation } from './merge-three-way.ts';

const mm = new MarkdownManager({ extensions: sharedExtensions });

function dirtyRoundTrip(md: string): string {
  const json = mm.parse(md);
  const walk = (node: JSONContent): void => {
    if (node.type === 'jsxComponent' && node.attrs) node.attrs.sourceDirty = true;
    if (node.content) for (const c of node.content) walk(c);
  };
  walk(json);
  return mm.serialize(json);
}

function maxBodyLineOccurrence(doc: string): number {
  const counts = new Map<string, number>();
  for (const raw of doc.split('\n')) {
    const line = raw.trim();
    if (line.length < 16) continue;
    if (line.startsWith('<') || line.startsWith('```') || line.startsWith('|')) continue;
    counts.set(line, (counts.get(line) ?? 0) + 1);
  }
  let max = 0;
  for (const c of counts.values()) if (c > max) max = c;
  return max;
}

function countJsxComponents(md: string): number {
  let count = 0;
  const walk = (node: JSONContent): void => {
    if (node.type === 'jsxComponent') count++;
    if (node.content) for (const c of node.content) walk(c);
  };
  walk(mm.parse(md));
  return count;
}

describe('O1 — indented-JSX dirty drain stays within byte budget + no duplication', () => {
  for (const { name, source } of loadIndentedJsxFixtures()) {
    test(`${name}: a dirty drain stays within a small byte budget (no bloat)`, () => {
      const out = dirtyRoundTrip(source);
      expect(Buffer.byteLength(out)).toBeLessThanOrEqual(
        Math.ceil(Buffer.byteLength(source) * 1.5) + 64,
      );
    });

    test(`${name}: a dirty drain duplicates no substantive body line`, () => {
      expect(maxBodyLineOccurrence(dirtyRoundTrip(source))).toBeLessThanOrEqual(1);
    });
  }
});

describe('O1 — large-embed clean round-trip budget (the dirty flip is a no-op here)', () => {
  for (const { name, source } of loadLargeEmbedFixtures()) {
    test(`${name}: has no jsxComponent node, so the dirty flip is a no-op`, () => {
      expect(countJsxComponents(source)).toBe(0);
      expect(dirtyRoundTrip(source)).toBe(mm.serialize(mm.parse(source)));
    });

    test(`${name}: a clean round-trip stays within budget and duplicates no body line`, () => {
      const out = mm.serialize(mm.parse(source));
      expect(Buffer.byteLength(out)).toBeLessThanOrEqual(
        Math.ceil(Buffer.byteLength(source) * 1.5) + 64,
      );
      expect(maxBodyLineOccurrence(out)).toBeLessThanOrEqual(1);
    });
  }
});

describe('O1 static occurrence-count oracle (AC-C3) — pins the PRD-6955 triplication', () => {
  test('the clean BEFORE capture has no triplicated body line', () => {
    expect(maxBodyLineOccurrence(loadPrd6955Before())).toBeLessThan(3);
  });

  test('the CORRUPTED capture trips the oracle (a body line occurs >= 3x)', () => {
    const corrupted = maxBodyLineOccurrence(loadPrd6955CorruptedTriplicated());
    expect(corrupted).toBeGreaterThanOrEqual(3);
    expect(corrupted).toBeGreaterThan(maxBodyLineOccurrence(loadPrd6955Before()));
  });
});

describe('assertContentPreservation is BLIND to pure duplication (documents the deferred B4 gap)', () => {
  test('a 2x-duplicated merge result does NOT throw today (the blindness)', () => {
    const body = 'alpha line one\nbravo line two\ncharlie line three';
    const duplicated = `${body}\n${body}`;
    expect(() => assertContentPreservation(body, body, body, duplicated)).not.toThrow();
  });

  test.skip('a 2x-duplicated merge result throws once the B4 growth guard lands', () => {
    const body = 'alpha line one\nbravo line two\ncharlie line three';
    const duplicated = `${body}\n${body}`;
    expect(() => assertContentPreservation(body, body, body, duplicated)).toThrow();
  });
});
