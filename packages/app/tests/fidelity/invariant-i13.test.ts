import { describe, expect, test } from 'bun:test';
import { normalizeBridge } from '@inkeep/open-knowledge-core';
import type { JSONContent } from '@tiptap/core';
import * as fc from 'fast-check';
import {
  loadBuiltInFixtures,
  loadIndentedJsxFixtures,
} from '../../../core/src/markdown/fixtures/index.ts';
import { assertAcrossSeeds, mdManager, NUM_RUNS } from './helpers';

function walkJsxComponents(node: JSONContent, mutate: (n: JSONContent) => void): void {
  if (node.type === 'jsxComponent') mutate(node);
  if (node.content) {
    for (const child of node.content) walkJsxComponents(child, mutate);
  }
}

function dirtyRoundTrip(
  md: string,
  propMutation?: (props: Record<string, unknown>) => void,
): string {
  const json = mdManager.parse(md);
  walkJsxComponents(json, (node) => {
    if (!node.attrs) return;
    node.attrs.sourceDirty = true;
    if (propMutation) {
      const props = (node.attrs.props ?? {}) as Record<string, unknown>;
      propMutation(props);
      node.attrs.props = props;
    }
  });
  return mdManager.serialize(json);
}

const fixtures = loadBuiltInFixtures();
const blockFixtures = fixtures.filter((f) => !f.componentName.includes('-inline-'));

type PropEdit =
  | { kind: 'set-string'; key: string; value: string }
  | { kind: 'set-boolean'; key: string; value: boolean }
  | { kind: 'set-identifier-expr'; key: string; ident: string }
  | { kind: 'delete'; key: string };

const stringAttrValueArb = fc.stringMatching(/^[a-zA-Z0-9 _./:#-]{1,40}$/);

const propEditArb: fc.Arbitrary<PropEdit> = fc.oneof(
  fc.record({
    kind: fc.constant('set-string' as const),
    key: fc.oneof(
      fc.constantFrom('title', 'type', 'href', 'src', 'alt', 'value', 'name'),
      fc.stringMatching(/^[a-z][a-zA-Z0-9]{0,8}$/),
    ),
    value: stringAttrValueArb,
  }),
  fc.record({
    kind: fc.constant('set-boolean' as const),
    key: fc.constantFrom('disabled', 'external', 'hidden', 'open'),
    value: fc.boolean(),
  }),
  fc.record({
    kind: fc.constant('set-identifier-expr' as const),
    key: fc.constantFrom('items', 'data', 'value'),
    ident: fc.constantFrom('values', 'items', 'data', 'myVar'),
  }),
  fc.record({
    kind: fc.constant('delete' as const),
    key: fc.constantFrom('title', 'href', 'disabled', 'color'),
  }),
);

function applyEdit(props: Record<string, unknown>, edit: PropEdit): void {
  switch (edit.kind) {
    case 'set-string':
      props[edit.key] = edit.value;
      break;
    case 'set-boolean':
      props[edit.key] = edit.value;
      break;
    case 'set-identifier-expr':
      props[edit.key] = { type: 'expression', value: edit.ident };
      break;
    case 'delete':
      delete props[edit.key];
      break;
  }
}

const COMPAT_FIXTURE_PREFIXES = ['Callout-gfm-', 'Callout-obsidian-', 'Accordion-details-'];
const isCompatFixture = (componentName: string): boolean =>
  COMPAT_FIXTURE_PREFIXES.some((prefix) => componentName.startsWith(prefix));

describe('I13 — JSX edited idempotence (γ dirty-path PBT)', () => {
  const canonicalFixtures = blockFixtures.filter((f) => !isCompatFixture(f.componentName));
  const perFixtureRuns = Math.max(50, Math.floor(NUM_RUNS / canonicalFixtures.length));

  for (const fixture of canonicalFixtures) {
    test(`${fixture.componentName}: idempotent under synthetic prop edits`, () => {
      assertAcrossSeeds(
        fc.property(fc.array(propEditArb, { minLength: 0, maxLength: 3 }), (edits) => {
          const firstOutput = dirtyRoundTrip(fixture.blockForm, (props) => {
            for (const edit of edits) applyEdit(props, edit);
          });
          const secondOutput = dirtyRoundTrip(firstOutput);
          expect(secondOutput).toBe(firstOutput);
        }),
        { numRuns: perFixtureRuns },
      );
    });
  }
});

describe('I13 — NG12 probe cases: idempotent under synthetic prop edits', () => {
  test('pristine dirty-path produces idempotent output across fixtures', () => {
    for (const fixture of blockFixtures) {
      const firstOutput = dirtyRoundTrip(fixture.blockForm);
      const secondOutput = dirtyRoundTrip(firstOutput);
      expect(secondOutput).toBe(firstOutput);
    }
  });
});

interface IndentedJsxCase {
  name: string;
  source: string;
}

const INDENTED_JSX_CLASS: IndentedJsxCase[] = [
  {
    name: 'Steps/Step (fumadocs)',
    source: [
      '<Steps>',
      '  <Step>',
      '    ### Open the clone dialog',
      '',
      '    From the Navigator window, select **Clone from GitHub**.',
      '  </Step>',
      '',
      '  <Step>',
      '    ### Choose a repository',
      '',
      '    Paste a repository URL or `owner/repo` shorthand.',
      '  </Step>',
      '</Steps>',
      '',
    ].join('\n'),
  },
  {
    name: 'Tabs/Tab (fumadocs)',
    source: [
      '<Tabs items={["npm", "bun"]}>',
      '  <Tab value="npm">',
      '    ### Install with npm',
      '',
      '    Run `npm install` in the project root.',
      '  </Tab>',
      '',
      '  <Tab value="bun">',
      '    ### Install with bun',
      '',
      '    Run `bun install` instead.',
      '  </Tab>',
      '</Tabs>',
      '',
    ].join('\n'),
  },
  {
    name: 'custom component (indented children)',
    source: [
      '<MyBox title="Notes">',
      '  ### Things to remember',
      '',
      '  - First point',
      '  - Second point',
      '',
      '  A closing paragraph with **emphasis**.',
      '</MyBox>',
      '',
    ].join('\n'),
  },
  {
    name: 'depth-3 nested components',
    source: [
      '<Outer>',
      '  <Middle>',
      '    <Inner>',
      '      ### Triple-nested heading',
      '',
      '      Body paragraph at depth 3.',
      '    </Inner>',
      '  </Middle>',
      '</Outer>',
      '',
    ].join('\n'),
  },
  ...loadIndentedJsxFixtures(),
];

describe('I13 — indented-children MDX JSX bridge fixed-point (PRD-7110)', () => {
  for (const { name, source } of INDENTED_JSX_CLASS) {
    test(`${name}: γ dirty round-trip stays within normalizeBridge tolerance`, () => {
      expect(normalizeBridge(dirtyRoundTrip(source))).toBe(normalizeBridge(source));
    });

    test(`${name}: γ dirty round-trip reaches a byte-stable serializer fixed point`, () => {
      const once = dirtyRoundTrip(source);
      expect(dirtyRoundTrip(once)).toBe(once);
    });

    test(`${name}: repeated dirty drains stay a within-tolerance fixed point (no byte growth)`, () => {
      const normalizedSource = normalizeBridge(source);
      const first = dirtyRoundTrip(source);
      expect(normalizeBridge(first)).toBe(normalizedSource);
      let cur = first;
      for (let i = 1; i < 6; i++) {
        cur = dirtyRoundTrip(cur);
        expect(normalizeBridge(cur)).toBe(normalizedSource);
        expect(cur).toBe(first);
      }
    });
  }
});

function findJsxContainer(root: JSONContent, componentName: string): JSONContent | undefined {
  let found: JSONContent | undefined;
  const visit = (n: JSONContent): void => {
    if (found) return;
    if (n.type === 'jsxComponent' && n.attrs?.componentName === componentName) found = n;
    else n.content?.forEach(visit);
  };
  visit(root);
  return found;
}

function structurallyEditAndSerialize(md: string, edit: (root: JSONContent) => void): string {
  const json = mdManager.parse(md);
  edit(json);
  walkJsxComponents(json, (node) => {
    if (node.attrs) node.attrs.sourceDirty = true;
  });
  return mdManager.serialize(json);
}

function occurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

function markerOrder(md: string, markers: readonly string[]): string[] {
  return markers
    .map((m) => ({ m, idx: md.indexOf(m) }))
    .filter(({ idx }) => idx >= 0)
    .sort((a, b) => a.idx - b.idx)
    .map(({ m }) => m);
}

const O3_THREE_STEP = [
  '<Steps>',
  '',
  '<Step>',
  '',
  'Alpha marker body.',
  '',
  '</Step>',
  '',
  '<Step>',
  '',
  'Bravo marker body.',
  '',
  '</Step>',
  '',
  '<Step>',
  '',
  'Charlie marker body.',
  '',
  '</Step>',
  '',
  '</Steps>',
  '',
].join('\n');

const O3_MARKERS = ['Alpha marker body.', 'Bravo marker body.', 'Charlie marker body.'] as const;

describe('I13 — structural child-edit invariant (PRD-7110)', () => {
  function assertEditedFixedPoint(editedMd: string): void {
    expect(dirtyRoundTrip(editedMd)).toBe(editedMd);
    expect(normalizeBridge(dirtyRoundTrip(editedMd))).toBe(normalizeBridge(editedMd));
  }

  test('swap: siblings reorder, each marker once, correct order, fixed point', () => {
    const edited = structurallyEditAndSerialize(O3_THREE_STEP, (root) => {
      const kids = findJsxContainer(root, 'Steps')?.content;
      if (!kids) throw new Error('Steps container not found');
      [kids[0], kids[2]] = [kids[2], kids[0]];
    });
    for (const m of O3_MARKERS) expect(occurrences(edited, m)).toBe(1);
    expect(markerOrder(edited, O3_MARKERS)).toEqual([
      'Charlie marker body.',
      'Bravo marker body.',
      'Alpha marker body.',
    ]);
    assertEditedFixedPoint(edited);
  });

  test('delete: one sibling removed, remaining markers once, order preserved, fixed point', () => {
    const edited = structurallyEditAndSerialize(O3_THREE_STEP, (root) => {
      const kids = findJsxContainer(root, 'Steps')?.content;
      if (!kids) throw new Error('Steps container not found');
      kids.splice(1, 1);
    });
    expect(occurrences(edited, 'Bravo marker body.')).toBe(0);
    expect(occurrences(edited, 'Alpha marker body.')).toBe(1);
    expect(occurrences(edited, 'Charlie marker body.')).toBe(1);
    expect(markerOrder(edited, O3_MARKERS)).toEqual(['Alpha marker body.', 'Charlie marker body.']);
    assertEditedFixedPoint(edited);
  });

  test('insert: new sibling appended, all markers once, order preserved, fixed point', () => {
    const all = [...O3_MARKERS, 'Delta marker body.'];
    const edited = structurallyEditAndSerialize(O3_THREE_STEP, (root) => {
      const kids = findJsxContainer(root, 'Steps')?.content;
      if (!kids) throw new Error('Steps container not found');
      kids.push({
        type: 'jsxComponent',
        attrs: {
          componentName: 'Step',
          kind: 'element',
          attributes: [],
          props: {},
          sourceDirty: true,
        },
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Delta marker body.' }] }],
      });
    });
    for (const m of all) expect(occurrences(edited, m)).toBe(1);
    expect(markerOrder(edited, all)).toEqual(all);
    assertEditedFixedPoint(edited);
  });

  test('closing-tag edit (componentName rename) re-emits open+close, no sibling reorder/duplication', () => {
    const edited = structurallyEditAndSerialize(O3_THREE_STEP, (root) => {
      const target = findJsxContainer(root, 'Steps')?.content?.[1];
      if (!target?.attrs) throw new Error('Step[1] not found');
      target.attrs.componentName = 'Stage';
    });
    expect(edited).toContain('<Stage>');
    expect(edited).toContain('</Stage>');
    for (const m of O3_MARKERS) expect(occurrences(edited, m)).toBe(1);
    expect(markerOrder(edited, O3_MARKERS)).toEqual([
      'Alpha marker body.',
      'Bravo marker body.',
      'Charlie marker body.',
    ]);
    assertEditedFixedPoint(edited);
  });
});

describe('I13 — reconstructAttrs overlays non-JSON preserved expressions (PRD-7110)', () => {
  test('a genuine edit overlays a non-JSON preserved expression attr (not kept)', () => {
    const source = '<MyBox data={someVar}>\n\n  Body paragraph.\n\n</MyBox>\n';
    const edited = dirtyRoundTrip(source, (props) => {
      props.data = 'literal string';
    });
    expect(edited).toContain('data="literal string"');
    expect(edited).not.toContain('someVar');
  });
});

describe('I13 — reconstructAttrs keeps unchanged JSON expression attrs verbatim (PRD-7110)', () => {
  test('an unchanged JSON-array expression attr is preserved byte-for-byte (not recompacted)', () => {
    const source = '<MyBox items={["npm", "bun"]}>\n\n  Body paragraph.\n\n</MyBox>\n';
    const out = dirtyRoundTrip(source, (props) => {
      props.items = ['npm', 'bun'];
    });
    expect(out).toContain('items={["npm", "bun"]}');
    expect(out).not.toContain('items={["npm","bun"]}');
  });
});

describe('I13 — quoted-attr × indented-children composition (PRD-7110)', () => {
  test('a quote-bearing string attr is rewritten to expression form on the delegated indented path', () => {
    const source = ['<Note>', '  ### Main heading', '', '  Body paragraph.', '</Note>', ''].join(
      '\n',
    );
    const once = dirtyRoundTrip(source, (props) => {
      props.label = 'the "main" point';
    });
    expect(once).toContain('label={"the \\"main\\" point"}');
    expect(once).toContain('\n  ### Main heading');
    expect(dirtyRoundTrip(once)).toBe(once);
  });
});

describe('I13 — string-attr entity divergence on the delegation path (PRD-7110)', () => {
  test('`&` in a string attr is emitted verbatim (not entity-encoded) and stays within tolerance', () => {
    const source = '<Note title="Q&A Section">\n  Body paragraph.\n</Note>\n';
    const out = dirtyRoundTrip(source);
    expect(out).toContain('title="Q&A Section"');
    expect(out).not.toContain('&#x26;');
    expect(out).not.toContain('&amp;');
    expect(normalizeBridge(out)).toBe(normalizeBridge(source));
  });
});

interface DetailsCase {
  name: string;
  source: string;
}

const DETAILS_CANONICAL_CLASS: DetailsCase[] = [
  {
    name: 'heading + continuation paragraph',
    source: [
      '<details>',
      '<summary>Open the clone dialog</summary>',
      '',
      '### Clone from GitHub',
      '',
      'From the Navigator window, select **Clone from GitHub**.',
      '',
      '</details>',
      '',
    ].join('\n'),
  },
  {
    name: 'heading + list + emphasis paragraph',
    source: [
      '<details open>',
      '<summary>Notes</summary>',
      '',
      '### Things to remember',
      '',
      '- First point',
      '- Second point',
      '',
      'A closing paragraph with **emphasis**.',
      '',
      '</details>',
      '',
    ].join('\n'),
  },
];

describe('I13 — HTML-boundary <details> bridge fixed-point (PRD-7110 sibling)', () => {
  for (const { name, source } of DETAILS_CANONICAL_CLASS) {
    test(`${name}: γ dirty round-trip stays within normalizeBridge tolerance`, () => {
      expect(normalizeBridge(dirtyRoundTrip(source))).toBe(normalizeBridge(source));
    });

    test(`${name}: γ dirty round-trip reaches a byte-stable serializer fixed point`, () => {
      const once = dirtyRoundTrip(source);
      expect(dirtyRoundTrip(once)).toBe(once);
    });

    test(`${name}: dirty path keeps the <details> body flush-left (depth 0)`, () => {
      const out = dirtyRoundTrip(source);
      expect(out).toContain('\n\n### ');
      expect(out).not.toContain('\n\n  ### ');
    });
  }

  test('non-canonical indented body de-indents to a CONVERGENT fixed point (no amplification)', () => {
    const indented = [
      '<details>',
      '<summary>Title</summary>',
      '',
      '  ### Indented heading',
      '',
      '  Indented body paragraph.',
      '',
      '</details>',
      '',
    ].join('\n');
    const once = dirtyRoundTrip(indented);
    expect(dirtyRoundTrip(once)).toBe(once);
    expect(once).toContain('\n\n### Indented heading');
  });
});
