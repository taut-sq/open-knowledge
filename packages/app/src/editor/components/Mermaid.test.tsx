import { describe, expect, mock, test } from 'bun:test';
import { renderToString } from 'react-dom/server';
import { renderLinguiTemplate } from '@/test-utils/lingui-mock';
import * as actualLinguiReactMacro from '../../../tests/lingui-macro-shim';

mock.module('@lingui/react/macro', () => ({
  ...actualLinguiReactMacro,
  Trans: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useLingui: () => ({ t: renderLinguiTemplate }),
}));

const {
  extractEdgeInfo,
  extractSourceNodeId,
  findEdgeLabelInSource,
  findLabelInSource,
  findSequenceMessageInSource,
  MermaidView,
  rewriteSequenceParticipant,
  spliceNewLabel,
} = await import('./Mermaid.tsx');

describe('MermaidView — placeholder branch', () => {
  test('empty chart renders the placeholder shell', () => {
    const html = renderToString(<MermaidView chart="" />);
    expect(html).toContain('class="mermaid mermaid-placeholder"');
    expect(html).toContain('data-component-type="mermaid"');
  });

  test('whitespace-only chart treated as empty', () => {
    const html = renderToString(<MermaidView chart="   " />);
    expect(html).toContain('mermaid-placeholder');
  });

  test('undefined chart treated as empty', () => {
    const html = renderToString(<MermaidView />);
    expect(html).toContain('mermaid-placeholder');
  });
});

describe('MermaidView — pre-render mount state', () => {
  test('non-empty chart starts in idle/rendering state under renderToString', () => {
    const html = renderToString(<MermaidView chart="graph TD; A-->B;" />);
    expect(html).toContain('data-component-type="mermaid"');
  });
});

describe('extractSourceNodeId', () => {
  test('parses `flowchart-<id>-<counter>` shape', () => {
    expect(extractSourceNodeId('mermaid-_r_cu_-flowchart-A-0')).toBe('A');
    expect(extractSourceNodeId('mermaid-_r_cu_-flowchart-Z-1')).toBe('Z');
  });

  test('preserves internal hyphens in the source id', () => {
    expect(extractSourceNodeId('mermaid-scope-flowchart-A-B-3')).toBe('A-B');
  });

  test('returns null when the element id is not a flowchart node', () => {
    expect(extractSourceNodeId('mermaid-_r_cu_-actor0')).toBeNull();
    expect(extractSourceNodeId('random-svg-id')).toBeNull();
  });
});

describe('findLabelInSource', () => {
  const chart = [
    'graph TD',
    '  A[Mobile app]-->Z',
    '  B[Web app]-->Z',
    '  Z(GraphQL API)-->E[REST API]',
    '  E-.->F{{Cache}}',
    '  F-->G((End))',
  ].join('\n');

  test('locates a `[Label]` shape', () => {
    const m = findLabelInSource(chart, 'A', 'Mobile app');
    if (!m) throw new Error('expected a match');
    expect(m.open).toBe('[');
    expect(m.close).toBe(']');
    expect(m.wasQuoted).toBe(false);
    expect(chart.slice(m.start, m.end)).toBe('Mobile app');
  });

  test('locates a `(Label)` shape', () => {
    const m = findLabelInSource(chart, 'Z', 'GraphQL API');
    expect(m?.open).toBe('(');
    expect(m?.close).toBe(')');
  });

  test('locates a `{{Label}}` shape before `{Label}` (open-length wins)', () => {
    const m = findLabelInSource(chart, 'F', 'Cache');
    expect(m?.open).toBe('{{');
    expect(m?.close).toBe('}}');
  });

  test('locates a `((Label))` shape before `(Label)` (open-length wins)', () => {
    const m = findLabelInSource(chart, 'G', 'End');
    expect(m?.open).toBe('((');
    expect(m?.close).toBe('))');
  });

  test('word-boundary check rejects a suffix-match on longer node ids', () => {
    const noBoundary = 'graph TD\n  AB[Web app]-->Z\n';
    expect(findLabelInSource(noBoundary, 'B', 'Web app')).toBeNull();
  });

  test('quoted label form matches when source uses `"..."`', () => {
    const quoted = 'graph TD\n  Z["API [gateway]"]-->E\n';
    const m = findLabelInSource(quoted, 'Z', 'API [gateway]');
    if (!m) throw new Error('expected a match');
    expect(m.wasQuoted).toBe(true);
    expect(quoted.slice(m.start, m.end)).toBe('"API [gateway]"');
  });

  test('returns null when no matching shape+label is found', () => {
    expect(findLabelInSource(chart, 'A', 'Not the label')).toBeNull();
    expect(findLabelInSource(chart, 'Missing', 'Mobile app')).toBeNull();
  });
});

describe('spliceNewLabel', () => {
  function locate(source: string, id: string, label: string) {
    const m = findLabelInSource(source, id, label);
    if (!m) throw new Error(`expected to find ${id}[${label}] in source`);
    return m;
  }

  test('replaces an unquoted label with an unquoted label', () => {
    const source = 'graph TD\n  A[Mobile app]-->Z\n';
    const match = locate(source, 'A', 'Mobile app');
    expect(spliceNewLabel(source, match, 'iOS app')).toContain('A[iOS app]');
  });

  test('adds quotes when the new label contains mermaid-syntactic chars', () => {
    const source = 'graph TD\n  Z[GraphQL API]-->E\n';
    const match = locate(source, 'Z', 'GraphQL API');
    const next = spliceNewLabel(source, match, 'API [gateway]');
    expect(next).toContain('Z["API [gateway]"]');
  });

  test('preserves quotes when source already used the quoted form', () => {
    const source = 'graph TD\n  Z["Original"]-->E\n';
    const match = locate(source, 'Z', 'Original');
    expect(spliceNewLabel(source, match, 'Plain')).toContain('Z["Plain"]');
  });

  test('encodes double quotes as `#quot;` entity refs inside a quoted label', () => {
    const source = 'graph TD\n  Z[Plain]-->E\n';
    const match = locate(source, 'Z', 'Plain');
    expect(spliceNewLabel(source, match, 'She said "hi"')).toContain(
      'Z["She said #quot;hi#quot;"]',
    );
  });

  test('quoted edge label round-trip preserves quoting through splice', () => {
    const source = 'flowchart LR\n  A -->|"multi word"| B\n';
    const m = findEdgeLabelInSource(source, 'A', 'B', 0, 'multi word');
    if (!m) throw new Error('expected a match');
    expect(m.wasQuoted).toBe(true);
    const out = spliceNewLabel(source, m, 'different phrase');
    expect(out).toContain('A -->|"different phrase"| B');
  });
});

describe('extractEdgeInfo', () => {
  test('parses `L_<from>_<to>_<counter>` shape', () => {
    expect(extractEdgeInfo('L_A_B_0')).toEqual({ from: 'A', to: 'B', index: 0 });
    expect(extractEdgeInfo('L_start_end_2')).toEqual({ from: 'start', to: 'end', index: 2 });
  });

  test('returns null for malformed ids', () => {
    expect(extractEdgeInfo('L_A_B')).toBeNull();
    expect(extractEdgeInfo('flowchart-A-0')).toBeNull();
  });
});

describe('findEdgeLabelInSource', () => {
  test('locates a pipe-form edge label (`A -->|Yes| B`)', () => {
    const source = 'flowchart LR\n  A -->|Yes| B\n  B -->|No| C\n';
    const m = findEdgeLabelInSource(source, 'A', 'B', 0, 'Yes');
    if (!m) throw new Error('expected a match');
    expect(source.slice(m.start, m.end)).toBe('Yes');
    expect(m.wasQuoted).toBe(false);
    expect(spliceNewLabel(source, m, 'Definitely')).toContain('A -->|Definitely| B');
  });

  test('locates an inline-form edge label (`A -- Yes --> B`)', () => {
    const source = 'flowchart LR\n  A -- Yes --> B\n  B -- No --> C\n';
    const m = findEdgeLabelInSource(source, 'A', 'B', 0, 'Yes');
    if (!m) throw new Error('expected a match');
    expect(source.slice(m.start, m.end)).toBe('Yes');
    expect(spliceNewLabel(source, m, 'OK')).toContain('A -- OK --> B');
  });

  test('locates a quoted pipe-form label', () => {
    const source = 'flowchart LR\n  A -->|"multi word"| B\n';
    const m = findEdgeLabelInSource(source, 'A', 'B', 0, 'multi word');
    if (!m) throw new Error('expected a match');
    expect(m.wasQuoted).toBe(true);
    expect(source.slice(m.start, m.end)).toBe('"multi word"');
  });

  test('index tie-breaks when the same label appears on parallel edges', () => {
    const source = ['flowchart LR', '  A -->|dup| B', '  A -->|dup| B'].join('\n');
    const m0 = findEdgeLabelInSource(source, 'A', 'B', 0, 'dup');
    const m1 = findEdgeLabelInSource(source, 'A', 'B', 1, 'dup');
    if (!m0 || !m1) throw new Error('expected both matches');
    expect(m0.start).toBeLessThan(m1.start);
    expect(source.slice(m0.start, m0.end)).toBe('dup');
    expect(source.slice(m1.start, m1.end)).toBe('dup');
  });

  test('returns null when no matching edge label exists', () => {
    const source = 'flowchart LR\n  A --> B\n';
    expect(findEdgeLabelInSource(source, 'A', 'B', 0, 'Yes')).toBeNull();
    expect(findEdgeLabelInSource(source, 'A', 'Z', 0, 'Yes')).toBeNull();
  });

  test('label offset is exact even when the label text matches the from-id', () => {
    const source = 'flowchart LR\n  A -->|A| B\n';
    const m = findEdgeLabelInSource(source, 'A', 'B', 0, 'A');
    if (!m) throw new Error('expected a match');
    expect(source.slice(m.start, m.end)).toBe('A');
    expect(spliceNewLabel(source, m, 'Renamed')).toContain('A -->|Renamed| B');
  });

  test('locates label in thick-arrow variant `==>`', () => {
    const source = 'flowchart LR\n  A -- Yes ==> B\n';
    const m = findEdgeLabelInSource(source, 'A', 'B', 0, 'Yes');
    if (!m) throw new Error('expected a match');
    expect(source.slice(m.start, m.end)).toBe('Yes');
  });

  test('locates label in dotted-arrow variant `-.->`', () => {
    const source = 'flowchart LR\n  A -- Yes -.-> B\n';
    const m = findEdgeLabelInSource(source, 'A', 'B', 0, 'Yes');
    if (!m) throw new Error('expected a match');
    expect(source.slice(m.start, m.end)).toBe('Yes');
  });

  test('parallel edges with mixed quoting map by source order, not pattern order', () => {
    const source = ['flowchart LR', '  A -->|Yes| B', '  A -->|"Yes"| B'].join('\n');
    const m0 = findEdgeLabelInSource(source, 'A', 'B', 0, 'Yes');
    const m1 = findEdgeLabelInSource(source, 'A', 'B', 1, 'Yes');
    if (!m0 || !m1) throw new Error('expected both matches');
    expect(m0.wasQuoted).toBe(false);
    expect(m1.wasQuoted).toBe(true);
    expect(m0.start).toBeLessThan(m1.start);
  });
});

describe('findSequenceMessageInSource', () => {
  const chart = [
    'sequenceDiagram',
    '  Alice->>Bob: hello world',
    '  Bob-->>Alice: hi back',
    '  Alice->>Bob: hello world',
  ].join('\n');

  test('locates a message body after `:`', () => {
    const m = findSequenceMessageInSource(chart, 'hi back');
    if (!m) throw new Error('expected a match');
    expect(chart.slice(m.start, m.end)).toBe('hi back');
    expect(spliceNewLabel(chart, m, 'hello!')).toContain('Bob-->>Alice: hello!');
  });

  test('occurrence tie-breaks between duplicate messages', () => {
    const m0 = findSequenceMessageInSource(chart, 'hello world', 0);
    const m1 = findSequenceMessageInSource(chart, 'hello world', 1);
    if (!m0 || !m1) throw new Error('expected both matches');
    expect(m0.start).toBeLessThan(m1.start);
  });

  test('returns null for unmatched messages', () => {
    expect(findSequenceMessageInSource(chart, 'not present')).toBeNull();
  });

  test('splicing a message with mermaid-syntactic chars does NOT add literal quotes', () => {
    const src = 'sequenceDiagram\n  Alice->>Bob: hello\n';
    const m = findSequenceMessageInSource(src, 'hello');
    if (!m) throw new Error('expected a match');
    const out = spliceNewLabel(src, m, 'Status [OK]');
    expect(out).toContain('Alice->>Bob: Status [OK]');
    expect(out).not.toContain('"Status [OK]"');
  });
});

describe('rewriteSequenceParticipant', () => {
  test('bare `participant X` gets an `as New` alias to preserve arrow refs', () => {
    const src = ['sequenceDiagram', '  participant Author', '  Author->>Bob: hi'].join('\n');
    const out = rewriteSequenceParticipant(src, 'Author', 'Alice');
    expect(out).toContain('participant Author as Alice');
    expect(out).toContain('Author->>Bob: hi');
  });

  test('bare + display with whitespace forces quoted alias', () => {
    const src = 'sequenceDiagram\n  participant Author\n';
    const out = rewriteSequenceParticipant(src, 'Author', 'Alice Smith');
    expect(out).toContain('participant Author as "Alice Smith"');
  });

  test('aliased quoted `X as "Display"` replaces in place', () => {
    const src = 'sequenceDiagram\n  participant A as "Author"\n  A->>Bob: hi';
    const out = rewriteSequenceParticipant(src, 'Author', 'Alice');
    expect(out).toContain('participant A as "Alice"');
    expect(out).toContain('A->>Bob: hi');
  });

  test('aliased unquoted `X as Display` replaces in place, adds quotes for special chars', () => {
    const src = 'sequenceDiagram\n  participant A as Author\n';
    const out = rewriteSequenceParticipant(src, 'Author', 'Two Words');
    expect(out).toContain('participant A as "Two Words"');
  });

  test('actor keyword also supported', () => {
    const src = 'sequenceDiagram\n  actor Author\n  Author->>Bob: hi';
    const out = rewriteSequenceParticipant(src, 'Author', 'Alice');
    expect(out).toContain('actor Author as Alice');
  });

  test('returns null when no participant matches', () => {
    const src = 'sequenceDiagram\n  participant Author\n';
    expect(rewriteSequenceParticipant(src, 'NotThere', 'Alice')).toBeNull();
  });
});
