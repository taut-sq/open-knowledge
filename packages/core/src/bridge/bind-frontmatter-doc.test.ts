
import { describe, expect, test } from 'bun:test';
import * as Y from 'yjs';
import type { FrontmatterDocProvider, FrontmatterSnapshot } from './bind-frontmatter-doc.ts';
import { bindFrontmatterDoc, FORM_WRITE_ORIGIN, touchesFmRegion } from './bind-frontmatter-doc.ts';
import { detectFmRegion, MAX_FM_REGION_BYTES, readFmMap } from './frontmatter-region.ts';

function makeProvider(initial = ''): FrontmatterDocProvider & {
  emitSynced: () => void;
} {
  const document = new Y.Doc();
  if (initial) {
    document.getText('source').insert(0, initial);
  }
  const handlers = new Set<() => void>();
  return {
    document,
    on(event, listener) {
      if (event === 'synced') handlers.add(listener);
    },
    off(event, listener) {
      if (event === 'synced') handlers.delete(listener);
    },
    emitSynced() {
      for (const h of handlers) h();
    },
  };
}

function readYTextFm(provider: FrontmatterDocProvider): string {
  return detectFmRegion(provider.document.getText('source').toString()).fenced;
}

describe('bindFrontmatterDoc — patch()', () => {
  test('valid patch writes the YAML region and reports applied keys', () => {
    const provider = makeProvider();
    const binding = bindFrontmatterDoc(provider);

    const result = binding.patch({ title: 'Hello', count: 3, draft: true });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.appliedKeys.sort()).toEqual(['count', 'draft', 'title']);
    }
    const map = readFmMap(provider.document.getText('source').toString());
    expect(map).toEqual({ title: 'Hello', count: 3, draft: true });
  });

  test('null value deletes the key', () => {
    const provider = makeProvider();
    const binding = bindFrontmatterDoc(provider);
    binding.patch({ title: 'Hello', tag: 'a' });

    const result = binding.patch({ tag: null });

    expect(result.ok).toBe(true);
    expect(readFmMap(provider.document.getText('source').toString())).toEqual({ title: 'Hello' });
  });

  test('deleting every key removes the FM fences', () => {
    const provider = makeProvider();
    const binding = bindFrontmatterDoc(provider);
    binding.patch({ title: 'Hello', status: 'draft' });
    expect(readYTextFm(provider)).not.toBe('');

    const result = binding.patch({ title: null, status: null });

    expect(result.ok).toBe(true);
    expect(provider.document.getText('source').toString()).toBe('');
    expect(readYTextFm(provider)).toBe('');
    expect(binding.current().map).toEqual({});
    expect(binding.current().keys).toEqual([]);
  });

  test('updating an existing key does NOT reorder properties (FR2)', () => {
    const provider = makeProvider();
    const binding = bindFrontmatterDoc(provider);
    binding.patch({ title: 'Hello', cluster: 'X', tags: ['a'] });

    binding.patch({ title: 'Goodbye' });

    expect(binding.current().keys).toEqual(['title', 'cluster', 'tags']);
  });

  test('new keys append at the end (D15 / FR8)', () => {
    const provider = makeProvider();
    const binding = bindFrontmatterDoc(provider);
    binding.patch({ title: 'Hello' });
    binding.patch({ status: 'draft' });

    expect(binding.current().keys).toEqual(['title', 'status']);
  });

  test('invalid value returns SCHEMA_INVALID without mutating Y.Text', () => {
    const provider = makeProvider();
    const binding = bindFrontmatterDoc(provider);
    binding.patch({ title: 'Hello' });

    const result = binding.patch({ count: Symbol('nope') as unknown as number });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('SCHEMA_INVALID');
    }
    expect(readFmMap(provider.document.getText('source').toString())).toEqual({ title: 'Hello' });
  });

  test('nested object value is accepted and round-trips through Y.Text', () => {
    const provider = makeProvider();
    const binding = bindFrontmatterDoc(provider);

    const result = binding.patch({
      name: 'skill',
      metadata: { version: '1.0.0', author: 'Inkeep' },
    });

    expect(result.ok).toBe(true);
    const map = readFmMap(provider.document.getText('source').toString());
    expect(map).toEqual({
      name: 'skill',
      metadata: { version: '1.0.0', author: 'Inkeep' },
    });
  });

  test('reserved key "frontmatter" is rejected', () => {
    const provider = makeProvider();
    const binding = bindFrontmatterDoc(provider);

    const result = binding.patch({ frontmatter: 'bypass attempt' });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('SCHEMA_INVALID');
      if (result.error.code === 'SCHEMA_INVALID') {
        expect(result.error.issues[0]?.path).toEqual(['frontmatter']);
        expect(result.error.issues[0]?.issueCode).toBe('reserved_key');
      }
    }
    expect(readYTextFm(provider)).toBe('');
  });

  test('writes are stamped with FORM_WRITE_ORIGIN', () => {
    const provider = makeProvider();
    const binding = bindFrontmatterDoc(provider);

    let observedOrigin: unknown = null;
    provider.document.getText('source').observe((_event, transaction) => {
      observedOrigin = transaction.origin;
    });

    binding.patch({ title: 'Hello' });

    expect(observedOrigin).toBe(FORM_WRITE_ORIGIN);
  });

  test('region exceeding MAX_FM_REGION_BYTES is refused', () => {
    const provider = makeProvider();
    const binding = bindFrontmatterDoc(provider);

    const huge = 'x'.repeat(MAX_FM_REGION_BYTES + 1);
    const result = binding.patch({ pad: huge });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('SCHEMA_INVALID');
      if (result.error.code === 'SCHEMA_INVALID') {
        expect(result.error.issues[0]?.issueCode).toBe('region_too_large');
      }
    }
  });

  test('disposed binding rejects further patches', () => {
    const provider = makeProvider();
    const binding = bindFrontmatterDoc(provider);
    binding.dispose();

    const result = binding.patch({ title: 'Hello' });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('WRITE_ERROR');
    }
    expect(readYTextFm(provider)).toBe('');
  });
});

describe('bindFrontmatterDoc — rename()', () => {
  test('renames in place, preserving order (FR2)', () => {
    const provider = makeProvider();
    const binding = bindFrontmatterDoc(provider);
    binding.patch({ title: 'Hello', cluster: 'X', tags: ['a'] });

    const result = binding.rename('cluster', 'group');

    expect(result.ok).toBe(true);
    expect(binding.current().keys).toEqual(['title', 'group', 'tags']);
    expect(binding.current().map).toEqual({ title: 'Hello', group: 'X', tags: ['a'] });
  });

  test('refuses unknown source key', () => {
    const provider = makeProvider();
    const binding = bindFrontmatterDoc(provider);
    binding.patch({ title: 'Hello' });

    const result = binding.rename('cluster', 'group');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('SCHEMA_INVALID');
    }
  });

  test('refuses target collision when allowDuplicate is false', () => {
    const provider = makeProvider();
    const binding = bindFrontmatterDoc(provider);
    binding.patch({ title: 'Hello', status: 'draft' });

    const result = binding.rename('status', 'title');

    expect(result.ok).toBe(false);
  });

  test('admits duplicate target when allowDuplicate is true (D17/D18)', () => {
    const provider = makeProvider();
    const binding = bindFrontmatterDoc(provider);
    binding.patch({ title: 'Hello', status: 'draft' });

    const result = binding.rename('status', 'title', { allowDuplicate: true });

    expect(result.ok).toBe(true);
    expect(binding.current().keys).toEqual(['title', 'title']);
  });
});

describe('bindFrontmatterDoc — reorder()', () => {
  test('reorders to the requested permutation (FR4)', () => {
    const provider = makeProvider();
    const binding = bindFrontmatterDoc(provider);
    binding.patch({ a: 1, b: 2, c: 3 });

    const result = binding.reorder(['c', 'a', 'b']);

    expect(result.ok).toBe(true);
    expect(binding.current().keys).toEqual(['c', 'a', 'b']);
    expect(binding.current().map).toEqual({ a: 1, b: 2, c: 3 });
  });

  test('refuses non-permutation list', () => {
    const provider = makeProvider();
    const binding = bindFrontmatterDoc(provider);
    binding.patch({ a: 1, b: 2 });

    const result = binding.reorder(['a', 'b', 'c']);

    expect(result.ok).toBe(false);
  });
});

describe('bindFrontmatterDoc — patchPath() / deletePath() (Q-T9 local addressing)', () => {
  test('patchPath sets a nested leaf, preserving sibling top-level keys', () => {
    const provider = makeProvider();
    const binding = bindFrontmatterDoc(provider);
    binding.patch({
      name: 'skill',
      description: 'd',
      metadata: { version: '1.0', author: 'Inkeep' },
    });

    const result = binding.patchPath(['metadata', 'version'], '2.0');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.path).toEqual(['metadata', 'version']);
    }
    expect(binding.current().map).toEqual({
      name: 'skill',
      description: 'd',
      metadata: { version: '2.0', author: 'Inkeep' },
    });
  });

  test('patchPath preserves sibling nested keys at the same depth (single-leaf set)', () => {
    const provider = makeProvider();
    const binding = bindFrontmatterDoc(provider);
    binding.patch({
      metadata: { version: '1.0', author: 'A', license: 'MIT' },
    });

    const result = binding.patchPath(['metadata', 'version'], '2.0');

    expect(result.ok).toBe(true);
    expect(binding.current().map).toEqual({
      metadata: { version: '2.0', author: 'A', license: 'MIT' },
    });
  });

  test('patchPath creates missing intermediate maps', () => {
    const provider = makeProvider();
    const binding = bindFrontmatterDoc(provider);
    binding.patch({ name: 'skill' });

    const result = binding.patchPath(['metadata', 'version'], '1.0');

    expect(result.ok).toBe(true);
    expect(binding.current().map).toEqual({
      name: 'skill',
      metadata: { version: '1.0' },
    });
  });

  test('patchPath at depth >=3 creates parent chain', () => {
    const provider = makeProvider();
    const binding = bindFrontmatterDoc(provider);

    const result = binding.patchPath(['a', 'b', 'c', 'd'], 'leaf');

    expect(result.ok).toBe(true);
    expect(binding.current().map).toEqual({
      a: { b: { c: { d: 'leaf' } } },
    });
  });

  test('patchPath single-element path reduces to a top-level set (append on new key)', () => {
    const provider = makeProvider();
    const binding = bindFrontmatterDoc(provider);
    binding.patch({ title: 'Hello' });

    const result = binding.patchPath(['cluster'], 'X');

    expect(result.ok).toBe(true);
    expect(binding.current().map).toEqual({ title: 'Hello', cluster: 'X' });
    expect(binding.current().keys).toEqual(['title', 'cluster']);
  });

  test('patchPath single-element path updates in place (no reorder on update)', () => {
    const provider = makeProvider();
    const binding = bindFrontmatterDoc(provider);
    binding.patch({ title: 'Hello', cluster: 'X' });

    binding.patchPath(['title'], 'World');

    expect(binding.current().keys).toEqual(['title', 'cluster']);
    expect(binding.current().map.title).toBe('World');
  });

  test('patchPath sets an array leaf value', () => {
    const provider = makeProvider();
    const binding = bindFrontmatterDoc(provider);
    binding.patch({ name: 'doc' });

    const result = binding.patchPath(['tags'], ['alpha', 'beta']);

    expect(result.ok).toBe(true);
    expect(binding.current().map).toEqual({ name: 'doc', tags: ['alpha', 'beta'] });
  });

  test('patchPath sets nested object leaf value (whole-subtree replace at leaf)', () => {
    const provider = makeProvider();
    const binding = bindFrontmatterDoc(provider);
    binding.patch({ metadata: { version: '1.0', author: 'A' } });

    const result = binding.patchPath(['metadata'], { version: '2.0' });

    expect(result.ok).toBe(true);
    expect(binding.current().map).toEqual({ metadata: { version: '2.0' } });
  });

  test('patchPath into an existing seq item by index', () => {
    const provider = makeProvider('---\nauthors:\n  - name: A\n  - name: B\n---\n');
    const binding = bindFrontmatterDoc(provider);

    const result = binding.patchPath(['authors', 0, 'role'], 'lead');

    expect(result.ok).toBe(true);
    expect(binding.current().map).toEqual({
      authors: [{ name: 'A', role: 'lead' }, { name: 'B' }],
    });
  });

  test('patchPath through a scalar intermediate returns parse_failed (WRITE_ERROR)', () => {
    const provider = makeProvider();
    const binding = bindFrontmatterDoc(provider);
    binding.patch({ a: 'string-value' });

    const result = binding.patchPath(['a', 'b'], 'x');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('WRITE_ERROR');
    }
    expect(binding.current().map).toEqual({ a: 'string-value' });
  });

  test('patchPath empty path is rejected with SCHEMA_INVALID / invalid_path', () => {
    const provider = makeProvider();
    const binding = bindFrontmatterDoc(provider);

    const result = binding.patchPath([], 'x');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('SCHEMA_INVALID');
      if (result.error.code === 'SCHEMA_INVALID') {
        expect(result.error.issues[0]?.issueCode).toBe('invalid_path');
      }
    }
  });

  test('patchPath rejects reserved top-level key "frontmatter"', () => {
    const provider = makeProvider();
    const binding = bindFrontmatterDoc(provider);

    const result = binding.patchPath(['frontmatter', 'nested'], 'x');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('SCHEMA_INVALID');
      if (result.error.code === 'SCHEMA_INVALID') {
        expect(result.error.issues[0]?.issueCode).toBe('reserved_key');
      }
    }
  });

  test('patchPath admits nested "frontmatter" key (only top-level slot is reserved)', () => {
    const provider = makeProvider();
    const binding = bindFrontmatterDoc(provider);

    const result = binding.patchPath(['metadata', 'frontmatter'], 'allowed');

    expect(result.ok).toBe(true);
    expect(binding.current().map).toEqual({ metadata: { frontmatter: 'allowed' } });
  });

  test('patchPath invalid leaf value (Symbol) returns SCHEMA_INVALID without mutating Y.Text', () => {
    const provider = makeProvider();
    const binding = bindFrontmatterDoc(provider);
    binding.patch({ metadata: { version: '1.0' } });

    const result = binding.patchPath(['metadata', 'count'], Symbol('nope') as unknown as number);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('SCHEMA_INVALID');
    }
    expect(binding.current().map).toEqual({ metadata: { version: '1.0' } });
  });

  test('patchPath stamps writes with FORM_WRITE_ORIGIN', () => {
    const provider = makeProvider();
    const binding = bindFrontmatterDoc(provider);

    let observedOrigin: unknown = null;
    provider.document.getText('source').observe((_event, transaction) => {
      observedOrigin = transaction.origin;
    });

    binding.patchPath(['metadata', 'version'], '1.0');

    expect(observedOrigin).toBe(FORM_WRITE_ORIGIN);
  });

  test('patchPath preserves flow style on nested map subtree replace', () => {
    const provider = makeProvider('---\nmetadata: {version: 1.0, author: A}\n---\n');
    const binding = bindFrontmatterDoc(provider);

    const result = binding.patchPath(['metadata'], { version: '2.0', author: 'B' });

    expect(result.ok).toBe(true);
    const fenced = readYTextFm(provider);
    expect(fenced).toContain('{ version: "2.0"');
    expect(fenced).toContain('author: B }');
  });

  test('patchPath preserves sibling comments inside the nested map (single-leaf set)', () => {
    const provider = makeProvider(
      '---\nname: hello\nmetadata:\n  # version comment\n  version: 1.0\n  author: A\n---\n',
    );
    const binding = bindFrontmatterDoc(provider);

    const result = binding.patchPath(['metadata', 'author'], 'B');

    expect(result.ok).toBe(true);
    const fenced = readYTextFm(provider);
    expect(fenced).toContain('# version comment');
    expect(fenced).toContain('version: 1.0');
    expect(fenced).toContain('author: B');
  });

  test('patchPath disposed binding returns WRITE_ERROR', () => {
    const provider = makeProvider();
    const binding = bindFrontmatterDoc(provider);
    binding.dispose();

    const result = binding.patchPath(['metadata', 'version'], '1.0');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('WRITE_ERROR');
    }
  });

  test('deletePath removes a single nested leaf, leaves sibling siblings + parent map', () => {
    const provider = makeProvider();
    const binding = bindFrontmatterDoc(provider);
    binding.patch({
      name: 'skill',
      metadata: { version: '1.0', author: 'A', license: 'MIT' },
    });

    const result = binding.deletePath(['metadata', 'author']);

    expect(result.ok).toBe(true);
    expect(binding.current().map).toEqual({
      name: 'skill',
      metadata: { version: '1.0', license: 'MIT' },
    });
  });

  test('deletePath does NOT prune emptied parent maps (documented rule)', () => {
    const provider = makeProvider();
    const binding = bindFrontmatterDoc(provider);
    binding.patch({ metadata: { version: '1.0' } });

    const result = binding.deletePath(['metadata', 'version']);

    expect(result.ok).toBe(true);
    expect(binding.current().map).toEqual({ metadata: {} });
  });

  test('deletePath single-element path removes a top-level key', () => {
    const provider = makeProvider();
    const binding = bindFrontmatterDoc(provider);
    binding.patch({ title: 'Hello', cluster: 'X' });

    const result = binding.deletePath(['cluster']);

    expect(result.ok).toBe(true);
    expect(binding.current().map).toEqual({ title: 'Hello' });
    expect(binding.current().keys).toEqual(['title']);
  });

  test('deletePath on absent leaf is an idempotent no-op (Result.ok)', () => {
    const provider = makeProvider();
    const binding = bindFrontmatterDoc(provider);
    binding.patch({ metadata: { version: '1.0' } });

    const result = binding.deletePath(['metadata', 'absent']);

    expect(result.ok).toBe(true);
    expect(binding.current().map).toEqual({ metadata: { version: '1.0' } });
  });

  test('deletePath through a scalar intermediate is an idempotent no-op (getIn returns undefined)', () => {
    const provider = makeProvider();
    const binding = bindFrontmatterDoc(provider);
    binding.patch({ a: 'string-value' });

    const result = binding.deletePath(['a', 'b']);

    expect(result.ok).toBe(true);
    expect(binding.current().map).toEqual({ a: 'string-value' });
  });

  test('deletePath empty path is rejected with SCHEMA_INVALID', () => {
    const provider = makeProvider();
    const binding = bindFrontmatterDoc(provider);

    const result = binding.deletePath([]);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('SCHEMA_INVALID');
    }
  });

  test('deletePath rejects reserved top-level key "frontmatter"', () => {
    const provider = makeProvider();
    const binding = bindFrontmatterDoc(provider);

    const result = binding.deletePath(['frontmatter']);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('SCHEMA_INVALID');
      if (result.error.code === 'SCHEMA_INVALID') {
        expect(result.error.issues[0]?.issueCode).toBe('reserved_key');
      }
    }
  });

  test('deletePath stamps writes with FORM_WRITE_ORIGIN', () => {
    const provider = makeProvider();
    const binding = bindFrontmatterDoc(provider);
    binding.patch({ metadata: { version: '1.0' } });

    let observedOrigin: unknown = null;
    provider.document.getText('source').observe((_event, transaction) => {
      observedOrigin = transaction.origin;
    });

    binding.deletePath(['metadata', 'version']);

    expect(observedOrigin).toBe(FORM_WRITE_ORIGIN);
  });

  test('deletePath disposed binding returns WRITE_ERROR', () => {
    const provider = makeProvider();
    const binding = bindFrontmatterDoc(provider);
    binding.dispose();

    const result = binding.deletePath(['metadata', 'version']);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('WRITE_ERROR');
    }
  });

  test('patchPath then deletePath round-trip leaves an empty parent map (not pruned)', () => {
    const provider = makeProvider();
    const binding = bindFrontmatterDoc(provider);

    binding.patchPath(['metadata', 'version'], '1.0');
    expect(binding.current().map).toEqual({ metadata: { version: '1.0' } });

    binding.deletePath(['metadata', 'version']);
    expect(binding.current().map).toEqual({ metadata: {} });

    binding.deletePath(['metadata']);
    expect(binding.current().map).toEqual({});
  });

  test('patchPath updates do NOT touch siblings or trailing comments (depth-2 leaf set)', () => {
    const provider = makeProvider(
      '---\nname: hello\nmetadata:\n  version: 1.0\n  author: A\n# trailing\n---\nbody\n',
    );
    const binding = bindFrontmatterDoc(provider);

    binding.patchPath(['metadata', 'version'], '2.0');

    const fenced = readYTextFm(provider);
    expect(fenced).toContain('# trailing');
    expect(fenced).toContain('author: A');
    expect(fenced).toContain('version: "2.0"');
    expect(fenced).toContain('name: hello');
  });
});

describe('bindFrontmatterDoc — current()', () => {
  test('returns empty snapshot when there is no FM region', () => {
    const provider = makeProvider();
    const binding = bindFrontmatterDoc(provider);
    expect(binding.current()).toEqual({ map: {}, keys: [], parseError: undefined });
  });

  test('reflects the YAML region after writes', () => {
    const provider = makeProvider();
    const binding = bindFrontmatterDoc(provider);
    binding.patch({ title: 'Hello', tags: ['a'] });
    expect(binding.current().map).toEqual({ title: 'Hello', tags: ['a'] });
  });

  test('surfaces parseError when YAML region is malformed', () => {
    const provider = makeProvider('---\n: : : invalid\n---\nbody\n');
    const binding = bindFrontmatterDoc(provider);
    const snapshot = binding.current();
    expect(snapshot.parseError).toBeDefined();
  });

  test('surfaces no parseError when frontmatter has a mixed-scalar array', () => {
    const fixture =
      '---\n' +
      'title: Sample\n' +
      'tags: [travel, spain, barcelona, mallorca, palma, balearics, sailing, 2026]\n' +
      '---\nbody\n';
    const provider = makeProvider(fixture);
    const binding = bindFrontmatterDoc(provider);
    const snapshot = binding.current();
    expect(snapshot.parseError).toBeUndefined();
    expect(snapshot.map.tags).toEqual([
      'travel',
      'spain',
      'barcelona',
      'mallorca',
      'palma',
      'balearics',
      'sailing',
      '2026',
    ]);
  });
});

describe('bindFrontmatterDoc — subscribe()', () => {
  test('listener fires on patch', () => {
    const provider = makeProvider();
    const binding = bindFrontmatterDoc(provider);
    const calls: FrontmatterSnapshot[] = [];
    binding.subscribe((snapshot) => {
      calls.push(snapshot);
    });

    binding.patch({ title: 'Hello' });

    expect(calls.length).toBeGreaterThan(0);
    expect(calls.at(-1)?.map).toEqual({ title: 'Hello' });
  });

  test('content-equality bailout: body-only edits do not fire (D20)', () => {
    const provider = makeProvider('---\ntitle: Hello\n---\nbody\n');
    const binding = bindFrontmatterDoc(provider);
    let calls = 0;
    binding.subscribe(() => {
      calls += 1;
    });
    const callsBefore = calls;

    const ytext = provider.document.getText('source');
    ytext.insert(ytext.length, '\nmore body\n');

    expect(calls).toBe(callsBefore);
  });

  test('content-equality bailout: body-only edits do not fire with NESTED frontmatter', () => {
    const provider = makeProvider(
      '---\nname: skill\nmetadata:\n  version: 1.0.0\n  author: Inkeep\n---\nbody\n',
    );
    const binding = bindFrontmatterDoc(provider);
    let calls = 0;
    binding.subscribe(() => {
      calls += 1;
    });
    const callsBefore = calls;

    const ytext = provider.document.getText('source');
    ytext.insert(ytext.length, '\nmore body\n');

    expect(calls).toBe(callsBefore);
  });

  test('listener fires on provider synced', () => {
    const provider = makeProvider();
    const binding = bindFrontmatterDoc(provider);
    let calls = 0;
    binding.subscribe(() => {
      calls += 1;
    });

    provider.emitSynced();

    expect(calls).toBe(1);
  });

  test('unsubscribe stops further fires', () => {
    const provider = makeProvider();
    const binding = bindFrontmatterDoc(provider);
    let calls = 0;
    const unsub = binding.subscribe(() => {
      calls += 1;
    });

    binding.patch({ title: 'A' });
    const before = calls;
    unsub();
    binding.patch({ title: 'B' });

    expect(calls).toBe(before);
  });
});

describe('bindFrontmatterDoc — dispose()', () => {
  test('removes Y.Text observer + provider listener', () => {
    const provider = makeProvider();
    const binding = bindFrontmatterDoc(provider);
    let calls = 0;
    binding.subscribe(() => {
      calls += 1;
    });
    binding.dispose();

    binding.patch({ title: 'after-dispose' });
    provider.emitSynced();

    expect(calls).toBe(0);
  });

  test('idempotent', () => {
    const provider = makeProvider();
    const binding = bindFrontmatterDoc(provider);
    binding.dispose();
    expect(() => binding.dispose()).not.toThrow();
  });
});

describe('touchesFmRegion — pure delta inspector', () => {
  const event = (delta: Array<{ retain?: number; insert?: string; delete?: number }>) =>
    ({ delta }) as Parameters<typeof touchesFmRegion>[0];

  test('closed FM present: insert inside region triggers re-parse', () => {
    expect(touchesFmRegion(event([{ retain: 5 }, { insert: 'x' }]), 30, false)).toBe(true);
  });

  test('closed FM present: insert past region bails out', () => {
    expect(touchesFmRegion(event([{ retain: 30 }, { insert: 'x' }]), 30, false)).toBe(false);
  });

  test('closed FM present: delete inside region triggers re-parse', () => {
    expect(touchesFmRegion(event([{ retain: 10 }, { delete: 5 }]), 30, false)).toBe(true);
  });

  test('closed FM present: delete past region bails out', () => {
    expect(touchesFmRegion(event([{ retain: 30 }, { delete: 5 }]), 30, false)).toBe(false);
  });

  test('no FM, no open fence: body-only insert bails out (the optimization)', () => {
    expect(touchesFmRegion(event([{ retain: 42 }, { insert: 'x' }]), 0, false)).toBe(false);
  });

  test('no FM, no open fence: insert at byte 0 triggers re-parse', () => {
    expect(touchesFmRegion(event([{ insert: '---\n' }]), 0, false)).toBe(true);
  });

  test('no FM, no open fence: insert inside the leading-byte window triggers re-parse', () => {
    expect(touchesFmRegion(event([{ retain: 2 }, { insert: '-' }]), 0, false)).toBe(true);
  });

  test('no FM, no open fence: delete at byte 0 triggers re-parse', () => {
    expect(touchesFmRegion(event([{ delete: 3 }]), 0, false)).toBe(true);
  });

  test('no FM, no open fence: delete past leading window bails out', () => {
    expect(touchesFmRegion(event([{ retain: 50 }, { delete: 5 }]), 0, false)).toBe(false);
  });

  test('no FM, no open fence: insert at retain=4 (last byte in window) triggers re-parse', () => {
    expect(touchesFmRegion(event([{ retain: 4 }, { insert: 'x' }]), 0, false)).toBe(true);
  });

  test('no FM, no open fence: insert at retain=5 (at threshold) bails out', () => {
    expect(touchesFmRegion(event([{ retain: 5 }, { insert: 'x' }]), 0, false)).toBe(false);
  });

  test('open fence prefix: any edit triggers re-parse (could close the fence)', () => {
    expect(touchesFmRegion(event([{ retain: 100 }, { insert: 'x' }]), 0, true)).toBe(true);
    expect(touchesFmRegion(event([{ retain: 100 }, { delete: 1 }]), 0, true)).toBe(true);
  });

  test('embedded objects in inserts respect the threshold', () => {
    expect(
      touchesFmRegion(
        event([{ retain: 50 }, { insert: { embed: true } as unknown as string }]),
        0,
        false,
      ),
    ).toBe(false);
    expect(
      touchesFmRegion(
        event([{ retain: 2 }, { insert: { embed: true } as unknown as string }]),
        0,
        false,
      ),
    ).toBe(true);
  });
});

describe('bindFrontmatterDoc — no-FM body-edit perf bailout', () => {
  function spyOnYTextToString(ytext: Y.Text): { reads: () => number; restore: () => void } {
    const original = ytext.toString.bind(ytext);
    let count = 0;
    ytext.toString = function spied() {
      count += 1;
      return original();
    } as typeof ytext.toString;
    return {
      reads: () => count,
      restore: () => {
        ytext.toString = original;
      },
    };
  }

  test('body-only edits on a no-FM doc do not call ytext.toString()', () => {
    const provider = makeProvider('plain body content with no frontmatter\n');
    const binding = bindFrontmatterDoc(provider);
    const ytext = provider.document.getText('source');
    const spy = spyOnYTextToString(ytext);
    let calls = 0;
    binding.subscribe(() => {
      calls += 1;
    });

    for (let i = 0; i < 25; i++) {
      ytext.insert(ytext.length, String(i % 10));
    }

    expect(calls).toBe(0);
    expect(spy.reads()).toBe(0);
    spy.restore();
    binding.dispose();
  });

  test('inserting an FM block at byte 0 fires the listener', () => {
    const provider = makeProvider('plain body\n');
    const binding = bindFrontmatterDoc(provider);
    const calls: FrontmatterSnapshot[] = [];
    binding.subscribe((s) => {
      calls.push(s);
    });

    const ytext = provider.document.getText('source');
    ytext.insert(0, '---\ntitle: Hello\n---\n');

    expect(calls.length).toBeGreaterThan(0);
    expect(calls.at(-1)?.map).toEqual({ title: 'Hello' });
  });

  test('open fence prefix without closing fence: body edits still re-parse', () => {
    const provider = makeProvider('---\ntitle: Hello\n');
    const binding = bindFrontmatterDoc(provider);
    const ytext = provider.document.getText('source');
    const spy = spyOnYTextToString(ytext);
    let calls = 0;
    binding.subscribe(() => {
      calls += 1;
    });

    ytext.insert(ytext.length, '---\n');

    expect(spy.reads()).toBeGreaterThan(0);
    expect(calls).toBeGreaterThan(0);
    expect(binding.current().map).toEqual({ title: 'Hello' });
    spy.restore();
    binding.dispose();
  });

  test('transition no-prefix → open-prefix updates the cached flag', () => {
    const provider = makeProvider('hello\n');
    const binding = bindFrontmatterDoc(provider);
    const ytext = provider.document.getText('source');

    ytext.insert(0, '---\n');
    expect(binding.current().map).toEqual({});

    const spy = spyOnYTextToString(ytext);
    let calls = 0;
    binding.subscribe(() => {
      calls += 1;
    });
    ytext.insert(ytext.length, '---\n');

    expect(spy.reads()).toBeGreaterThan(0);
    expect(calls).toBeGreaterThan(0);
    spy.restore();
    binding.dispose();
  });

  test('transition open-prefix → no-prefix restores bailout', () => {
    const provider = makeProvider('---\nhello\n');
    const binding = bindFrontmatterDoc(provider);
    const ytext = provider.document.getText('source');

    ytext.delete(0, 4);

    const spy = spyOnYTextToString(ytext);
    let calls = 0;
    binding.subscribe(() => {
      calls += 1;
    });
    ytext.insert(ytext.length, 'world');

    expect(spy.reads()).toBe(0);
    expect(calls).toBe(0);
    spy.restore();
    binding.dispose();
  });
});

describe('bindFrontmatterDoc — renamePath()', () => {
  function seedNested(): {
    provider: ReturnType<typeof makeProvider>;
    binding: ReturnType<typeof bindFrontmatterDoc>;
  } {
    const provider = makeProvider();
    const binding = bindFrontmatterDoc(provider);
    binding.patch({
      name: 'skill',
      metadata: { version: '1.0.0', author: 'Inkeep', license: 'MIT' },
    });
    return { provider, binding };
  }

  test('renames a nested key preserving sibling nested keys + top-level keys', () => {
    const { provider, binding } = seedNested();
    const result = binding.renamePath(['metadata', 'version'], 'semver');
    expect(result.ok).toBe(true);
    const fenced = readYTextFm(provider);
    expect(fenced).toContain('semver: 1.0.0');
    expect(fenced).toContain('author: Inkeep');
    expect(fenced).toContain('license: MIT');
    expect(fenced).toContain('name: skill');
    expect(fenced).not.toContain('version: 1.0.0');
    binding.dispose();
  });

  test('single-element path renames a top-level key (matches rename())', () => {
    const provider = makeProvider();
    const binding = bindFrontmatterDoc(provider);
    binding.patch({ name: 'skill', description: 'hello' });

    const result = binding.renamePath(['name'], 'title');
    expect(result.ok).toBe(true);
    expect(readFmMap(provider.document.getText('source').toString())).toEqual({
      title: 'skill',
      description: 'hello',
    });
    binding.dispose();
  });

  test('preserves nested source position so siblings keep their order', () => {
    const { provider, binding } = seedNested();
    binding.renamePath(['metadata', 'author'], 'maintainer');
    const fenced = readYTextFm(provider);
    const versionIdx = fenced.indexOf('version:');
    const maintainerIdx = fenced.indexOf('maintainer:');
    const licenseIdx = fenced.indexOf('license:');
    expect(versionIdx).toBeLessThan(maintainerIdx);
    expect(maintainerIdx).toBeLessThan(licenseIdx);
    binding.dispose();
  });

  test('unknown nested key returns SCHEMA_INVALID with unknown_key', () => {
    const { binding } = seedNested();
    const result = binding.renamePath(['metadata', 'missing'], 'x');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('SCHEMA_INVALID');
    if (result.error.code === 'SCHEMA_INVALID') {
      expect(result.error.issues[0]?.issueCode).toBe('unknown_key');
    }
    binding.dispose();
  });

  test('nested target collision returns SCHEMA_INVALID with duplicate_target', () => {
    const { binding } = seedNested();
    const result = binding.renamePath(['metadata', 'version'], 'author');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('SCHEMA_INVALID');
    if (result.error.code === 'SCHEMA_INVALID') {
      expect(result.error.issues[0]?.issueCode).toBe('duplicate_target');
    }
    binding.dispose();
  });

  test('allowDuplicate admits a nested colliding rename', () => {
    const { binding } = seedNested();
    const result = binding.renamePath(['metadata', 'version'], 'author', {
      allowDuplicate: true,
    });
    expect(result.ok).toBe(true);
    binding.dispose();
  });

  test('rejects numeric last segment (sequence index) as invalid_path', () => {
    const provider = makeProvider();
    const binding = bindFrontmatterDoc(provider);
    binding.patch({ items: ['a', 'b'] });

    const result = binding.renamePath(['items', 0], 'x');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('SCHEMA_INVALID');
    if (result.error.code === 'SCHEMA_INVALID') {
      expect(result.error.issues[0]?.issueCode).toBe('invalid_path');
    }
    binding.dispose();
  });

  test('empty path rejected with invalid_path', () => {
    const { binding } = seedNested();
    const result = binding.renamePath([], 'x');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('SCHEMA_INVALID');
    binding.dispose();
  });

  test('top-level rename to reserved frontmatter key rejected', () => {
    const provider = makeProvider();
    const binding = bindFrontmatterDoc(provider);
    binding.patch({ name: 'skill' });

    const result = binding.renamePath(['name'], 'frontmatter');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('SCHEMA_INVALID');
    if (result.error.code === 'SCHEMA_INVALID') {
      expect(result.error.issues[0]?.issueCode).toBe('reserved_key');
    }
    binding.dispose();
  });

  test('writes are stamped with FORM_WRITE_ORIGIN', () => {
    const { provider, binding } = seedNested();

    let observedOrigin: unknown = null;
    provider.document.getText('source').observe((_event, transaction) => {
      observedOrigin = transaction.origin;
    });

    binding.renamePath(['metadata', 'version'], 'semver');
    expect(observedOrigin).toBe(FORM_WRITE_ORIGIN);
    binding.dispose();
  });

  test('disposed binding rejects further renamePath calls', () => {
    const { binding } = seedNested();
    binding.dispose();

    const result = binding.renamePath(['metadata', 'version'], 'semver');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('WRITE_ERROR');
  });
});

describe('bindFrontmatterDoc — reorderPath()', () => {
  function seedNested(): {
    provider: ReturnType<typeof makeProvider>;
    binding: ReturnType<typeof bindFrontmatterDoc>;
  } {
    const provider = makeProvider();
    const binding = bindFrontmatterDoc(provider);
    binding.patch({
      name: 'skill',
      metadata: { version: '1.0.0', author: 'Inkeep', license: 'MIT' },
    });
    return { provider, binding };
  }

  test('reorders nested children preserving sibling top-level keys', () => {
    const { provider, binding } = seedNested();
    const result = binding.reorderPath(['metadata'], ['license', 'author', 'version']);
    expect(result.ok).toBe(true);
    const fenced = readYTextFm(provider);
    const licenseIdx = fenced.indexOf('license:');
    const authorIdx = fenced.indexOf('author:');
    const versionIdx = fenced.indexOf('version:');
    expect(licenseIdx).toBeLessThan(authorIdx);
    expect(authorIdx).toBeLessThan(versionIdx);
    expect(fenced).toContain('name: skill');
    binding.dispose();
  });

  test('empty path reorders top-level keys (matches reorder())', () => {
    const { provider, binding } = seedNested();
    const result = binding.reorderPath([], ['metadata', 'name']);
    expect(result.ok).toBe(true);
    const fenced = readYTextFm(provider);
    const metaIdx = fenced.indexOf('metadata:');
    const nameIdx = fenced.indexOf('name:');
    expect(metaIdx).toBeLessThan(nameIdx);
    binding.dispose();
  });

  test('rejects non-permutation with WRITE_ERROR (reorder_mismatch)', () => {
    const { binding } = seedNested();
    const result = binding.reorderPath(['metadata'], ['version', 'missing']);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('WRITE_ERROR');
    binding.dispose();
  });

  test('rejects when target is not a map (e.g. scalar leaf)', () => {
    const { binding } = seedNested();
    const result = binding.reorderPath(['name'], ['x']);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('SCHEMA_INVALID');
    binding.dispose();
  });

  test('writes are stamped with FORM_WRITE_ORIGIN', () => {
    const { provider, binding } = seedNested();

    let observedOrigin: unknown = null;
    provider.document.getText('source').observe((_event, transaction) => {
      observedOrigin = transaction.origin;
    });

    binding.reorderPath(['metadata'], ['author', 'version', 'license']);
    expect(observedOrigin).toBe(FORM_WRITE_ORIGIN);
    binding.dispose();
  });

  test('disposed binding rejects further reorderPath calls', () => {
    const { binding } = seedNested();
    binding.dispose();

    const result = binding.reorderPath(['metadata'], ['version', 'author', 'license']);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('WRITE_ERROR');
  });
});

describe('bindFrontmatterDoc — reorderSeqPath()', () => {
  function seedAuthors(): {
    provider: ReturnType<typeof makeProvider>;
    binding: ReturnType<typeof bindFrontmatterDoc>;
  } {
    const provider = makeProvider();
    const binding = bindFrontmatterDoc(provider);
    binding.patch({
      title: 'doc',
      authors: [
        { name: 'A', role: 'lead' },
        { name: 'B', role: 'review' },
        { name: 'C', role: 'author' },
      ],
    });
    return { provider, binding };
  }

  test('permutes sequence items at path; sibling top-level keys survive', () => {
    const { binding } = seedAuthors();
    const result = binding.reorderSeqPath(['authors'], [2, 0, 1]);
    expect(result.ok).toBe(true);
    expect(binding.current().map).toEqual({
      title: 'doc',
      authors: [
        { name: 'C', role: 'author' },
        { name: 'A', role: 'lead' },
        { name: 'B', role: 'review' },
      ],
    });
    binding.dispose();
  });

  test('rejects non-permutation as WRITE_ERROR (reorder_mismatch)', () => {
    const { binding } = seedAuthors();
    const result = binding.reorderSeqPath(['authors'], [0, 1]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('WRITE_ERROR');
    binding.dispose();
  });

  test('rejects when target is not a sequence (map at path)', () => {
    const provider = makeProvider();
    const binding = bindFrontmatterDoc(provider);
    binding.patch({ metadata: { version: '1.0', author: 'X' } });
    const result = binding.reorderSeqPath(['metadata'], [0, 1]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('SCHEMA_INVALID');
    binding.dispose();
  });

  test('writes are stamped with FORM_WRITE_ORIGIN', () => {
    const { provider, binding } = seedAuthors();
    let observedOrigin: unknown = null;
    provider.document.getText('source').observe((_event, transaction) => {
      observedOrigin = transaction.origin;
    });
    binding.reorderSeqPath(['authors'], [2, 1, 0]);
    expect(observedOrigin).toBe(FORM_WRITE_ORIGIN);
    binding.dispose();
  });

  test('identity permutation is a no-op without Y.Text mutation', () => {
    const { provider, binding } = seedAuthors();
    const before = provider.document.getText('source').toString();
    const result = binding.reorderSeqPath(['authors'], [0, 1, 2]);
    expect(result.ok).toBe(true);
    const after = provider.document.getText('source').toString();
    expect(after).toBe(before);
    binding.dispose();
  });

  test('disposed binding rejects further reorderSeqPath calls', () => {
    const { binding } = seedAuthors();
    binding.dispose();
    const result = binding.reorderSeqPath(['authors'], [2, 0, 1]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('WRITE_ERROR');
  });
});

describe('bindFrontmatterDoc — array-of-objects item CRUD via patchPath/deletePath', () => {
  function seedAuthors(): {
    provider: ReturnType<typeof makeProvider>;
    binding: ReturnType<typeof bindFrontmatterDoc>;
  } {
    const provider = makeProvider();
    const binding = bindFrontmatterDoc(provider);
    binding.patch({ authors: [{ name: 'A' }, { name: 'B' }] });
    return { provider, binding };
  }

  test('add item appends a new empty object at end via patchPath at index = length', () => {
    const { binding } = seedAuthors();
    const result = binding.patchPath(['authors', 2], {});
    expect(result.ok).toBe(true);
    expect(binding.current().map).toEqual({
      authors: [{ name: 'A' }, { name: 'B' }, {}],
    });
    binding.dispose();
  });

  test('delete item splices the sequence (length decreases)', () => {
    const { binding } = seedAuthors();
    const result = binding.deletePath(['authors', 0]);
    expect(result.ok).toBe(true);
    expect(binding.current().map).toEqual({ authors: [{ name: 'B' }] });
    binding.dispose();
  });

  test('edit a field within an item leaves siblings intact', () => {
    const { binding } = seedAuthors();
    const result = binding.patchPath(['authors', 1, 'role'], 'editor');
    expect(result.ok).toBe(true);
    expect(binding.current().map).toEqual({
      authors: [{ name: 'A' }, { name: 'B', role: 'editor' }],
    });
    binding.dispose();
  });
});

describe('bindFrontmatterDoc — multi-client convergence', () => {
  test('two clients editing different keys (with shared baseline) converge via Y.Text', () => {
    const providerA = makeProvider();
    const bindingA = bindFrontmatterDoc(providerA);

    bindingA.patch({ title: 'Initial', cluster: 'X' });

    const providerB = makeProvider();
    Y.applyUpdate(providerB.document, Y.encodeStateAsUpdate(providerA.document));
    const bindingB = bindFrontmatterDoc(providerB);

    bindingA.patch({ title: 'Hello' });
    bindingB.patch({ cluster: 'Y' });

    Y.applyUpdate(providerA.document, Y.encodeStateAsUpdate(providerB.document));
    Y.applyUpdate(providerB.document, Y.encodeStateAsUpdate(providerA.document));

    expect(bindingA.current().map).toEqual(bindingB.current().map);

    bindingA.dispose();
    bindingB.dispose();
  });
});

describe('bindFrontmatterDoc — fence trailing whitespace (fm-delimiter hazard)', () => {
  test('current() recognizes an FM region whose fences carry trailing whitespace', () => {
    const provider = makeProvider('--- \ntitle: Hazard\n--- \n\nBody\n');
    const binding = bindFrontmatterDoc(provider);

    const snapshot = binding.current();

    expect(snapshot.parseError).toBeUndefined();
    expect(snapshot.map).toEqual({ title: 'Hazard' });
    expect(snapshot.keys).toEqual(['title']);
    binding.dispose();
  });

  test('an edit at byte >= 5 that completes a trailing-whitespace fence re-parses and notifies', () => {
    const seed = '--- \ntitle: Hazard\n';
    const provider = makeProvider(seed);
    const binding = bindFrontmatterDoc(provider);
    const snapshots: FrontmatterSnapshot[] = [];
    binding.subscribe((s) => snapshots.push(s));

    provider.document.getText('source').insert(seed.length, '---\n');

    expect(snapshots.length).toBeGreaterThan(0);
    expect(snapshots.at(-1)?.map).toEqual({ title: 'Hazard' });
    expect(binding.current().map).toEqual({ title: 'Hazard' });
    binding.dispose();
  });
});
