
import { describe, expect, test } from 'bun:test';
import type { RenderWarning, WriteWarning } from '@inkeep/open-knowledge-core';
import {
  formatAdvisoryBriefs,
  formatAdvisoryLines,
  formatRenderWarningsBrief,
  formatRenderWarningsLine,
  parseAdvisoryWarnings,
} from './advisory-warnings.ts';

function mermaidWarning(overrides: Partial<RenderWarning> = {}): RenderWarning {
  return {
    kind: 'mermaid-parse-error',
    fenceIndex: 1,
    fenceFirstLine: 'sequenceDiagram',
    message: 'Parse error on line 2:\n...A->>B: hi; the\n--------^',
    line: 2,
    ...overrides,
  };
}

const DIVERGENCE: WriteWarning = {
  kind: 'content-divergence',
  intendedBytes: 100,
  actualBytes: 98,
  byteDelta: -2,
};

const RECONCILED: WriteWarning = {
  kind: 'disk-edit-reconciled',
  intendedBytes: 50,
  actualBytes: 80,
  byteDelta: 30,
};

describe('parseAdvisoryWarnings', () => {
  test('parses a valid mixed array and rejects absent/empty/malformed payloads', () => {
    expect(parseAdvisoryWarnings([mermaidWarning(), DIVERGENCE, RECONCILED])).toHaveLength(3);
    expect(parseAdvisoryWarnings(undefined)).toBeUndefined();
    expect(parseAdvisoryWarnings([])).toBeUndefined();
    expect(parseAdvisoryWarnings([{ kind: 'something-else' }])).toBeUndefined();
    expect(parseAdvisoryWarnings('not-an-array')).toBeUndefined();
  });

  test('unrecognized entries drop individually, keeping recognized siblings', () => {
    const parsed = parseAdvisoryWarnings([
      mermaidWarning(),
      { kind: 'future-fence-kind', payload: true },
      DIVERGENCE,
    ]);
    expect(parsed).toHaveLength(2);
    expect(parsed?.map((w) => w.kind)).toEqual(['mermaid-parse-error', 'content-divergence']);
  });
});

describe('formatAdvisoryLines', () => {
  test('one line per integrity entry plus one grouped render line', () => {
    const lines = formatAdvisoryLines([
      DIVERGENCE,
      RECONCILED,
      mermaidWarning(),
      mermaidWarning({ fenceIndex: 2 }),
    ]);
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain('Content divergence');
    expect(lines[1]).toContain('reconciled');
    expect(lines[2]).toContain('2 mermaid fences');
  });

  test('integrity-only and render-only arrays each produce their own lines', () => {
    expect(formatAdvisoryLines([DIVERGENCE])).toHaveLength(1);
    expect(formatAdvisoryLines([mermaidWarning()])).toHaveLength(1);
  });

  test('single render failure inlines locator, line number, and mermaid message', () => {
    const [line] = formatAdvisoryLines([mermaidWarning()]);
    expect(line).toContain('⚠');
    expect(line).toContain('fence 1');
    expect(line).toContain('sequenceDiagram');
    expect(line).toContain('(line 2)');
    expect(line).toContain('Parse error on line 2:');
    expect(line).toContain('will not render');
  });

  test('empty fence body renders the (empty fence) locator, not ("")', () => {
    const [line] = formatAdvisoryLines([mermaidWarning({ fenceFirstLine: '' })]);
    expect(line).toContain('(empty fence)');
    expect(line).not.toContain('("")');
  });

  test('no line number omits the (line N) qualifier', () => {
    const [line] = formatAdvisoryLines([mermaidWarning({ line: undefined })]);
    expect(line).toContain('fence 1');
    expect(line).not.toContain('(line ');
    expect(line).toContain('will not render');
  });
});

describe('formatAdvisoryBriefs', () => {
  test('mixed advisories produce per-family briefs', () => {
    const briefs = formatAdvisoryBriefs([RECONCILED, mermaidWarning()]);
    expect(briefs).toHaveLength(2);
    expect(briefs[0]).toContain('reconciled');
    expect(briefs[1]).toContain('1 mermaid fence will not render');
    expect(briefs[1]).not.toContain('fences');
  });

  test('plural form for multiple render warnings', () => {
    const briefs = formatAdvisoryBriefs([mermaidWarning(), mermaidWarning({ fenceIndex: 2 })]);
    expect(briefs[0]).toContain('2 mermaid fences');
  });
});

describe('render-family bounds phrasing', () => {
  test('a full page of 10 entries reads as 10+ (server caps render entries)', () => {
    const warnings = Array.from({ length: 10 }, (_, i) => mermaidWarning({ fenceIndex: i + 1 }));
    expect(formatRenderWarningsLine(warnings)).toContain('10+');
    expect(formatRenderWarningsBrief(warnings)).toContain('10+');
  });
});
