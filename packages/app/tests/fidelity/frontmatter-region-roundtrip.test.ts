import { describe, expect, test } from 'bun:test';
import {
  applyPatchToFm,
  applyPathReorderToFm,
  applyPathSetToFm,
  applyRenameToFm,
  applyReorderToFm,
  parseFencedFmRegion,
} from '@inkeep/open-knowledge-core';
import * as fc from 'fast-check';
import { Document as YamlDocument } from 'yaml';

const MAX_KEY_BYTES = 32;
const MAX_VALUE_BYTES = 64;

const safeKey = fc
  .string({ minLength: 1, maxLength: MAX_KEY_BYTES })
  .filter((s) => /^[A-Za-z][A-Za-z0-9_-]*$/.test(s) && s !== 'frontmatter');

const stringValue = fc
  .string({ minLength: 1, maxLength: MAX_VALUE_BYTES })
  .filter(
    (s) =>
      /^[A-Za-z][A-Za-z0-9 ._-]*$/.test(s) &&
      !s.endsWith(' ') &&
      !['true', 'false', 'null', '~', 'yes', 'no', 'on', 'off'].includes(s.toLowerCase()),
  );

const numberValue = fc.integer({ min: -1000, max: 1000 });
const booleanValue = fc.boolean();
const listValue = fc.array(stringValue, { minLength: 1, maxLength: 5 });

const valueArbitrary = fc.oneof(stringValue, numberValue, booleanValue, listValue);

const fmMapArbitrary = fc.uniqueArray(safeKey, { minLength: 1, maxLength: 6 }).chain((keys) =>
  fc.tuple(...keys.map(() => valueArbitrary)).map((values) => {
    const map: Record<string, unknown> = {};
    keys.forEach((k, i) => {
      map[k] = values[i];
    });
    return { keys, map };
  }),
);

function buildFenced(keys: string[], map: Record<string, unknown>): string {
  const lines: string[] = ['---'];
  for (const key of keys) {
    const v = map[key];
    if (Array.isArray(v)) {
      lines.push(`${key}:`);
      for (const item of v) lines.push(`  - ${item}`);
    } else {
      lines.push(`${key}: ${v}`);
    }
  }
  lines.push('---');
  return `${lines.join('\n')}\n`;
}

describe('frontmatter-region — round-trip invariants', () => {
  test('I-rt-1: parse → serialize → parse is fixed-point', () => {
    fc.assert(
      fc.property(fmMapArbitrary, ({ keys, map }) => {
        const fenced = buildFenced(keys, map);
        const { doc, map: parsed1 } = parseFencedFmRegion(fenced);
        if (parsed1 === null) return; // invalid arbitrary, skip
        const reSer = doc.toString({ defaultKeyType: 'PLAIN', lineWidth: 0 });
        const { map: parsed2 } = parseFencedFmRegion(`---\n${reSer}---\n`);
        expect(parsed2).toEqual(parsed1);
      }),
      { numRuns: 50 },
    );
  });

  test('I-rt-2: applyPatchToFm with {} is a parse-stable no-op', () => {
    fc.assert(
      fc.property(fmMapArbitrary, ({ keys, map }) => {
        const fenced = buildFenced(keys, map);
        const result = applyPatchToFm(fenced, {});
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        const { map: parsedNext } = parseFencedFmRegion(result.nextFenced);
        const { map: parsedOrig } = parseFencedFmRegion(fenced);
        expect(parsedNext).toEqual(parsedOrig);
      }),
      { numRuns: 50 },
    );
  });

  test('I-rt-3: applyRenameToFm preserves source position (FR2)', () => {
    fc.assert(
      fc.property(
        fmMapArbitrary.filter(({ keys }) => keys.length >= 2),
        fc.integer({ min: 0, max: 5 }),
        fc
          .string({ minLength: 1, maxLength: MAX_KEY_BYTES })
          .filter((s) => /^[A-Za-z][A-Za-z0-9_-]*$/.test(s) && s !== 'frontmatter'),
        ({ keys, map }, idxRaw, newKey) => {
          const idx = idxRaw % keys.length;
          const oldKey = keys[idx];
          if (!oldKey || keys.includes(newKey)) return;
          const fenced = buildFenced(keys, map);
          const result = applyRenameToFm(fenced, oldKey, newKey);
          if (!result.ok) return;
          const { doc } = parseFencedFmRegion(result.nextFenced);
          const items = (doc.contents as { items?: { key?: { value?: string } | string }[] })
            ?.items;
          if (!items) return;
          const keyAtIdx = items[idx]?.key;
          const keyName = typeof keyAtIdx === 'string' ? keyAtIdx : keyAtIdx?.value;
          expect(keyName).toBe(newKey);
        },
      ),
      { numRuns: 50 },
    );
  });

  test('I-rt-4: applyReorderToFm with identity is a no-op', () => {
    fc.assert(
      fc.property(fmMapArbitrary, ({ keys, map }) => {
        const fenced = buildFenced(keys, map);
        const result = applyReorderToFm(fenced, keys);
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        const { map: parsedNext } = parseFencedFmRegion(result.nextFenced);
        expect(parsedNext).toEqual(map);
      }),
      { numRuns: 50 },
    );
  });

  test('I-rt-5: permutation lands the requested order', () => {
    fc.assert(
      fc.property(fmMapArbitrary, ({ keys, map }) => {
        if (keys.length < 2) return;
        const reversed = [...keys].reverse();
        const fenced = buildFenced(keys, map);
        const result = applyReorderToFm(fenced, reversed);
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        const { doc } = parseFencedFmRegion(result.nextFenced);
        const items =
          (doc.contents as { items?: { key?: { value?: string } | string }[] })?.items ?? [];
        const observedKeys = items.map((p) => {
          const k = p.key;
          return typeof k === 'string' ? k : k?.value;
        });
        expect(observedKeys).toEqual(reversed);
      }),
      { numRuns: 50 },
    );
  });

  test('I-rt-6: comment placement on a non-leading key survives a value patch (A1 probe)', () => {
    const fenced = '---\ntitle: Hello\n# pinned comment\nstatus: draft\n---\n';
    const result = applyPatchToFm(fenced, { status: 'published' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.nextFenced).toContain('# pinned comment');
    expect(result.nextFenced).toContain('status: published');
  });
});


const scalarArbitrary = fc.oneof(stringValue, numberValue, booleanValue);
const scalarListArbitrary = fc.array(stringValue, { minLength: 1, maxLength: 3 });

function nestedMapArbitraryAtDepth(depth: number): fc.Arbitrary<Record<string, unknown>> {
  return fc.uniqueArray(safeKey, { minLength: 1, maxLength: 3 }).chain((keys) =>
    fc.tuple(...keys.map(() => nestedValueArbitraryAtDepth(depth))).map((values) => {
      const map: Record<string, unknown> = {};
      keys.forEach((k, i) => {
        map[k] = values[i];
      });
      return map;
    }),
  );
}

function nestedValueArbitraryAtDepth(depth: number): fc.Arbitrary<unknown> {
  if (depth <= 0) return fc.oneof(scalarArbitrary, scalarListArbitrary);
  return fc.oneof(
    { arbitrary: scalarArbitrary, weight: 4 },
    { arbitrary: scalarListArbitrary, weight: 2 },
    { arbitrary: nestedMapArbitraryAtDepth(depth - 1), weight: 2 },
    {
      arbitrary: fc.array(nestedMapArbitraryAtDepth(depth - 1), { minLength: 1, maxLength: 2 }),
      weight: 1,
    },
  );
}

const nestedFmMapArbitrary = fc.uniqueArray(safeKey, { minLength: 1, maxLength: 4 }).chain((keys) =>
  fc.tuple(...keys.map(() => nestedValueArbitraryAtDepth(2))).map((values) => {
    const map: Record<string, unknown> = {};
    keys.forEach((k, i) => {
      map[k] = values[i];
    });
    return { keys, map };
  }),
);

function buildNestedFenced(map: Record<string, unknown>): string {
  const doc = new YamlDocument(map);
  const body = doc.toString({ defaultKeyType: 'PLAIN', lineWidth: 0 });
  return `---\n${body}---\n`;
}

describe('frontmatter-region — nested round-trip invariants (PRD-6947)', () => {
  test('I-rt-7: parse → serialize → parse is fixed-point at depth (nested maps + arrays of objects)', () => {
    fc.assert(
      fc.property(nestedFmMapArbitrary, ({ map }) => {
        const fenced = buildNestedFenced(map);
        const { doc, map: parsed1 } = parseFencedFmRegion(fenced);
        if (parsed1 === null) return;
        const reSer = doc.toString({ defaultKeyType: 'PLAIN', lineWidth: 0 });
        const { map: parsed2 } = parseFencedFmRegion(`---\n${reSer}---\n`);
        expect(parsed2).toEqual(parsed1);
      }),
      { numRuns: 40 },
    );
  });

  test('I-rt-8: applyPatchToFm with {} is parse-stable at depth', () => {
    fc.assert(
      fc.property(nestedFmMapArbitrary, ({ map }) => {
        const fenced = buildNestedFenced(map);
        const { map: parsedOrig } = parseFencedFmRegion(fenced);
        if (parsedOrig === null) return;
        const result = applyPatchToFm(fenced, {});
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        const { map: parsedNext } = parseFencedFmRegion(result.nextFenced);
        expect(parsedNext).toEqual(parsedOrig);
      }),
      { numRuns: 40 },
    );
  });

  test('I-rt-9: whole-subtree replacement is byte-stable on second application (idempotence at depth)', () => {
    fc.assert(
      fc.property(
        nestedFmMapArbitrary.filter(({ keys }) => keys.length >= 1),
        nestedValueArbitraryAtDepth(2),
        ({ keys, map }, newValue) => {
          const target = keys[0];
          if (!target) return;
          const fenced = buildNestedFenced(map);
          const first = applyPatchToFm(fenced, { [target]: newValue as never });
          if (!first.ok) return;
          const second = applyPatchToFm(first.nextFenced, { [target]: newValue as never });
          expect(second.ok).toBe(true);
          if (!second.ok) return;
          expect(second.nextFenced).toBe(first.nextFenced);
        },
      ),
      { numRuns: 30 },
    );
  });

  test('I-rt-10: whole-subtree replacement preserves untouched sibling top-level keys', () => {
    fc.assert(
      fc.property(
        nestedFmMapArbitrary.filter(({ keys }) => keys.length >= 2),
        nestedValueArbitraryAtDepth(2),
        ({ keys, map }, newValue) => {
          const target = keys[0];
          if (!target) return;
          const fenced = buildNestedFenced(map);
          const result = applyPatchToFm(fenced, { [target]: newValue as never });
          if (!result.ok) return;
          const { map: parsedNext } = parseFencedFmRegion(result.nextFenced);
          if (parsedNext === null) return;
          for (const sibling of keys.slice(1)) {
            expect(parsedNext[sibling]).toEqual(map[sibling] as never);
          }
        },
      ),
      { numRuns: 30 },
    );
  });

  test('I-rt-11: applyPathSetToFm at a nested leaf preserves siblings at every level (Q-T9 local API)', () => {
    fc.assert(
      fc.property(
        fc
          .tuple(
            fc.uniqueArray(safeKey, { minLength: 2, maxLength: 3 }),
            fc.uniqueArray(safeKey, { minLength: 2, maxLength: 3 }),
            scalarArbitrary,
            scalarArbitrary,
          )
          .map(([topKeys, nestedKeys, siblingValue, leafValue]) => ({
            topKeys,
            nestedKeys,
            siblingValue,
            leafValue,
          })),
        ({ topKeys, nestedKeys, siblingValue, leafValue }) => {
          const [parentKey, siblingTop] = topKeys;
          const [targetNested, siblingNested] = nestedKeys;
          if (!parentKey || !siblingTop || !targetNested || !siblingNested) return;
          const nested: Record<string, unknown> = {};
          for (const k of nestedKeys) nested[k] = siblingValue;
          const map: Record<string, unknown> = { [parentKey]: nested, [siblingTop]: siblingValue };
          const fenced = buildNestedFenced(map);
          const result = applyPathSetToFm(fenced, [parentKey, targetNested], leafValue);
          if (!result.ok) return;
          const { map: parsedNext } = parseFencedFmRegion(result.nextFenced);
          if (parsedNext === null) return;
          expect(parsedNext[siblingTop]).toEqual(siblingValue);
          const reparsedNested = parsedNext[parentKey] as Record<string, unknown>;
          expect(reparsedNested[siblingNested]).toEqual(siblingValue);
          expect(reparsedNested[targetNested]).toEqual(leafValue);
        },
      ),
      { numRuns: 30 },
    );
  });

  test('I-rt-12: applyPathReorderToFm with identity permutation at depth is parse-stable', () => {
    fc.assert(
      fc.property(
        fc.tuple(
          fc.uniqueArray(safeKey, { minLength: 1, maxLength: 2 }),
          fc.uniqueArray(safeKey, { minLength: 2, maxLength: 4 }),
          scalarArbitrary,
        ),
        ([topKeys, nestedKeys, value]) => {
          const parentKey = topKeys[0];
          if (!parentKey || nestedKeys.length < 2) return;
          const nested: Record<string, unknown> = {};
          for (const k of nestedKeys) nested[k] = value;
          const map: Record<string, unknown> = { [parentKey]: nested };
          const fenced = buildNestedFenced(map);
          const result = applyPathReorderToFm(fenced, [parentKey], nestedKeys);
          expect(result.ok).toBe(true);
          if (!result.ok) return;
          const { map: parsedNext } = parseFencedFmRegion(result.nextFenced);
          if (parsedNext === null) return;
          const reparsedNested = parsedNext[parentKey] as Record<string, unknown>;
          expect(Object.keys(reparsedNested)).toEqual(nestedKeys);
        },
      ),
      { numRuns: 30 },
    );
  });
});
