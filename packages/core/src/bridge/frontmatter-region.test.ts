
import { describe, expect, test } from 'bun:test';
import {
  applyPatchToFm,
  applyPathDeleteToFm,
  applyPathRenameToFm,
  applyPathReorderSeqToFm,
  applyPathReorderToFm,
  applyPathSetToFm,
  parseFmRegion,
} from './frontmatter-region.ts';

describe('parseFmRegion — mixed-scalar array coercion', () => {
  test('flow array with integer element coerces to string and surfaces no parseError', () => {
    const yaml = 'tags: [travel, spain, 2026]\n';
    const result = parseFmRegion(yaml);
    expect(result.parseError).toBeUndefined();
    expect(result.map).not.toBeNull();
    expect(result.map?.tags).toEqual(['travel', 'spain', '2026']);
  });

  test('flow array with boolean element coerces to string and surfaces no parseError', () => {
    const yaml = 'tags: [travel, true, spain]\n';
    const result = parseFmRegion(yaml);
    expect(result.parseError).toBeUndefined();
    expect(result.map).not.toBeNull();
    expect(result.map?.tags).toEqual(['travel', 'true', 'spain']);
  });

  test('flow array with float element coerces to string and surfaces no parseError', () => {
    const yaml = 'tags: [travel, 2.5, spain]\n';
    const result = parseFmRegion(yaml);
    expect(result.parseError).toBeUndefined();
    expect(result.map).not.toBeNull();
    expect(result.map?.tags).toEqual(['travel', '2.5', 'spain']);
  });

  test('block array with integer element coerces to string and surfaces no parseError', () => {
    const yaml = 'tags:\n  - travel\n  - spain\n  - 2026\n';
    const result = parseFmRegion(yaml);
    expect(result.parseError).toBeUndefined();
    expect(result.map).not.toBeNull();
    expect(result.map?.tags).toEqual(['travel', 'spain', '2026']);
  });

  test('flow array of all-string elements still parses cleanly (control)', () => {
    const yaml = 'tags: [travel, spain, "2026"]\n';
    const result = parseFmRegion(yaml);
    expect(result.parseError).toBeUndefined();
    expect(result.map).not.toBeNull();
    expect(result.map?.tags).toEqual(['travel', 'spain', '2026']);
  });

  test('null array element is rejected (out of scope per FrontmatterValueSchema)', () => {
    const yaml = 'tags: [travel, ~, spain]\n';
    const result = parseFmRegion(yaml);
    expect(result.parseError).toBeDefined();
    expect(result.map).toBeNull();
  });

  test("user's reported fixture (8-element flow array with unquoted year) coerces and parses", () => {
    const yaml = 'tags: [travel, spain, barcelona, mallorca, palma, balearics, sailing, 2026]\n';
    const result = parseFmRegion(yaml);
    expect(result.parseError).toBeUndefined();
    expect(result.map).not.toBeNull();
    expect(result.map?.tags).toEqual([
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

describe('parseFmRegion — recursive value contract (nested objects + arrays of objects)', () => {
  test('nested mapping parses into a populated map with no parseError', () => {
    const yaml = 'name: skill\nmetadata:\n  version: 1.0.0\n  author: Inkeep\n';
    const result = parseFmRegion(yaml);
    expect(result.parseError).toBeUndefined();
    expect(result.map).toEqual({
      name: 'skill',
      metadata: { version: '1.0.0', author: 'Inkeep' },
    });
  });

  test('array-of-objects parses without parseError; object elements are not String-coerced', () => {
    const yaml = 'items:\n  - title: a\n  - title: b\n';
    const result = parseFmRegion(yaml);
    expect(result.parseError).toBeUndefined();
    expect(result.map?.items).toEqual([{ title: 'a' }, { title: 'b' }]);
  });

  test('arbitrarily deep nesting (map in list in map) survives the recursive schema', () => {
    const yaml = 'outer:\n  inner:\n    - leaf: ok\n';
    const result = parseFmRegion(yaml);
    expect(result.parseError).toBeUndefined();
    expect(result.map).toEqual({ outer: { inner: [{ leaf: 'ok' }] } });
  });

  test('genuinely malformed YAML still sets parseError (yaml@2 parse error)', () => {
    const result = parseFmRegion('title: foo: bar');
    expect(result.parseError).toBeDefined();
    expect(result.map).toBeNull();
  });

  test('non-mapping top-level value still sets parseError', () => {
    const result = parseFmRegion('- one\n- two');
    expect(result.parseError).toBeDefined();
    expect(result.map).toBeNull();
  });
});

describe('applyPatchToFm — array style preservation', () => {

  test('flow-style input preserves flow style when patch replaces the array', () => {
    const fenced = '---\ntags: [travel, spain, 2026]\n---\n';
    const result = applyPatchToFm(fenced, { tags: ['travel', 'spain', '2026', 'paris'] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.nextFenced).toContain('tags: [');
  });

  test('block-style input preserves block style when patch replaces the array', () => {
    const fenced = '---\ntags:\n  - travel\n  - spain\n  - "2026"\n---\n';
    const result = applyPatchToFm(fenced, { tags: ['travel', 'spain', '2026', 'paris'] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.nextFenced).toMatch(/tags:\s*\n\s*-\s/);
  });
});

describe('applyPatchToFm — nested write semantics (whole-subtree merge)', () => {
  test('nested object value replaces the subtree, preserving sibling top-level keys', () => {
    const fenced =
      '---\nname: skill\nmetadata:\n  version: 1.0.0\n  author: Inkeep\ndescription: hello\n---\n';
    const result = applyPatchToFm(fenced, {
      metadata: { version: '2.0.0', author: 'Inkeep' },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(parseFmRegion(result.nextFenced.replace(/^---\n|---\n$/g, '')).map).toEqual({
      name: 'skill',
      metadata: { version: '2.0.0', author: 'Inkeep' },
      description: 'hello',
    });
  });

  test('null deletes a nested-object subtree key', () => {
    const fenced =
      '---\nname: skill\nmetadata:\n  version: 1.0.0\n  author: Inkeep\ndescription: hello\n---\n';
    const result = applyPatchToFm(fenced, { metadata: null });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.nextFenced).not.toContain('metadata');
    expect(result.nextFenced).toContain('name: skill');
    expect(result.nextFenced).toContain('description: hello');
  });

  test('non-object scalar replaces an existing object subtree (whole-subtree replace)', () => {
    const fenced = '---\nmetadata:\n  version: 1.0.0\n  author: Inkeep\n---\n';
    const result = applyPatchToFm(fenced, { metadata: 'inline' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.nextFenced).toMatch(/metadata:\s*inline/);
  });

  test('nested object replaces an existing scalar', () => {
    const fenced = '---\nname: skill\n---\n';
    const result = applyPatchToFm(fenced, {
      name: { kind: 'skill', detail: 'x' },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(parseFmRegion(result.nextFenced.replace(/^---\n|---\n$/g, '')).map).toEqual({
      name: { kind: 'skill', detail: 'x' },
    });
  });

  test('arbitrarily-deep nested set builds the full subtree at any depth', () => {
    const fenced = '---\nname: skill\n---\n';
    const result = applyPatchToFm(fenced, {
      outer: { inner: { leaf: 'ok' } },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(parseFmRegion(result.nextFenced.replace(/^---\n|---\n$/g, '')).map).toEqual({
      name: 'skill',
      outer: { inner: { leaf: 'ok' } },
    });
  });

  test('preserves comments on untouched sibling keys when editing a nested subtree', () => {
    const fenced =
      '---\n# leading comment\nname: skill\n# metadata block\nmetadata:\n  version: 1.0.0\n# trailing comment on description\ndescription: hello\n---\n';
    const result = applyPatchToFm(fenced, {
      metadata: { version: '2.0.0' },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.nextFenced).toContain('# leading comment');
    expect(result.nextFenced).toContain('# trailing comment on description');
    expect(result.nextFenced).toContain('name: skill');
    expect(result.nextFenced).toContain('description: hello');
  });

  test('flow-style nested map survives a whole-subtree replacement', () => {
    const fenced = '---\nmetadata: {version: 1.0, author: Inkeep}\n---\n';
    const result = applyPatchToFm(fenced, {
      metadata: { version: '2.0', author: 'Inkeep' },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.nextFenced).toContain('metadata: {');
  });

  test('block-style nested map stays in block style on replacement', () => {
    const fenced = '---\nmetadata:\n  version: 1.0\n  author: Inkeep\n---\n';
    const result = applyPatchToFm(fenced, {
      metadata: { version: '2.0', author: 'Inkeep' },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.nextFenced).toMatch(/metadata:\s*\n\s+version:/);
  });

  test('idempotence: applying the same nested patch twice is byte-stable', () => {
    const fenced = '---\nname: skill\nmetadata:\n  version: 1.0.0\n  author: Inkeep\n---\n';
    const first = applyPatchToFm(fenced, {
      metadata: { version: '2.0.0', author: 'Inkeep' },
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = applyPatchToFm(first.nextFenced, {
      metadata: { version: '2.0.0', author: 'Inkeep' },
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.nextFenced).toBe(first.nextFenced);
  });

  test('total function: pathological nested input returns a parse_failed error, never throws', () => {
    const fenced = '---\nname: skill\n---\n';
    const result = applyPatchToFm(fenced, {
      metadata: { stamp: new Date() as unknown as string },
    });
    expect(result.ok).toBe(false);
  });
});

describe('applyPathRenameToFm — path-addressed nested rename', () => {
  test('renames a top-level key when path has one element', () => {
    const fenced = '---\nname: skill\ndescription: hello\n---\n';
    const result = applyPathRenameToFm(fenced, ['name'], 'title');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.nextFenced).toContain('title: skill');
    expect(result.nextFenced).toContain('description: hello');
    expect(result.nextFenced).not.toContain('name:');
  });

  test('renames a nested leaf preserving sibling nested keys + comments', () => {
    const fenced =
      '---\nname: skill\nmetadata:\n  # before version\n  version: 1.0.0\n  author: Inkeep\n  repository: https://example.com\n---\n';
    const result = applyPathRenameToFm(fenced, ['metadata', 'version'], 'semver');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.nextFenced).toContain('semver: 1.0.0');
    expect(result.nextFenced).toContain('author: Inkeep');
    expect(result.nextFenced).toContain('repository: https://example.com');
    expect(result.nextFenced).toContain('# before version');
    expect(result.nextFenced).not.toContain('version: 1.0.0');
  });

  test('renames a deeply nested leaf at depth 3', () => {
    const fenced = '---\nouter:\n  inner:\n    leaf: ok\n    other: keep\n---\n';
    const result = applyPathRenameToFm(fenced, ['outer', 'inner', 'leaf'], 'tip');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.nextFenced).toContain('tip: ok');
    expect(result.nextFenced).toContain('other: keep');
  });

  test('preserves source position of the renamed Pair (siblings stay in order)', () => {
    const fenced = '---\nmetadata:\n  version: 1.0.0\n  author: Inkeep\n  license: MIT\n---\n';
    const result = applyPathRenameToFm(fenced, ['metadata', 'author'], 'maintainer');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const versionIdx = result.nextFenced.indexOf('version:');
    const maintainerIdx = result.nextFenced.indexOf('maintainer:');
    const licenseIdx = result.nextFenced.indexOf('license:');
    expect(versionIdx).toBeLessThan(maintainerIdx);
    expect(maintainerIdx).toBeLessThan(licenseIdx);
  });

  test('rejects rename when last path segment is numeric (sequence index)', () => {
    const fenced = '---\nitems:\n  - a\n  - b\n---\n';
    const result = applyPathRenameToFm(fenced, ['items', 0], 'x');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('invalid_path');
  });

  test('rejects unknown leaf', () => {
    const fenced = '---\nmetadata:\n  version: 1.0.0\n---\n';
    const result = applyPathRenameToFm(fenced, ['metadata', 'missing'], 'x');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('unknown_key');
  });

  test('rejects nested target collision by default', () => {
    const fenced = '---\nmetadata:\n  version: 1.0.0\n  author: Inkeep\n---\n';
    const result = applyPathRenameToFm(fenced, ['metadata', 'version'], 'author');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('duplicate_target');
  });

  test('allowDuplicate admits a colliding rename', () => {
    const fenced = '---\nmetadata:\n  version: 1.0.0\n  author: Inkeep\n---\n';
    const result = applyPathRenameToFm(fenced, ['metadata', 'version'], 'author', {
      allowDuplicate: true,
    });
    expect(result.ok).toBe(true);
  });

  test('top-level rename to reserved "frontmatter" is rejected', () => {
    const fenced = '---\nname: skill\n---\n';
    const result = applyPathRenameToFm(fenced, ['name'], 'frontmatter');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('reserved_key');
  });

  test('nested rename to "frontmatter" is allowed (only the top-level slot is reserved)', () => {
    const fenced = '---\nmetadata:\n  version: 1.0.0\n---\n';
    const result = applyPathRenameToFm(fenced, ['metadata', 'version'], 'frontmatter');
    expect(result.ok).toBe(true);
  });

  test('renaming through a scalar intermediate fails with unknown_key', () => {
    const fenced = '---\nname: skill\n---\n';
    const result = applyPathRenameToFm(fenced, ['name', 'child'], 'x');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('unknown_key');
  });

  test('empty path is rejected', () => {
    const fenced = '---\nname: skill\n---\n';
    const result = applyPathRenameToFm(fenced, [], 'x');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('invalid_path');
  });

  test('no-op rename to same key returns the input unchanged', () => {
    const fenced = '---\nmetadata:\n  version: 1.0.0\n---\n';
    const result = applyPathRenameToFm(fenced, ['metadata', 'version'], 'version');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.nextFenced).toBe(fenced);
  });
});

describe('applyPathReorderToFm — path-addressed nested reorder', () => {
  test('reorders top-level keys when path is empty (delegates to applyReorderToFm)', () => {
    const fenced = '---\nname: skill\ndescription: hello\nmetadata: {}\n---\n';
    const result = applyPathReorderToFm(fenced, [], ['metadata', 'name', 'description']);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const metaIdx = result.nextFenced.indexOf('metadata:');
    const nameIdx = result.nextFenced.indexOf('name:');
    const descIdx = result.nextFenced.indexOf('description:');
    expect(metaIdx).toBeLessThan(nameIdx);
    expect(nameIdx).toBeLessThan(descIdx);
  });

  test('reorders nested keys preserving sibling top-level keys', () => {
    const fenced =
      '---\nname: skill\nmetadata:\n  version: 1.0.0\n  author: Inkeep\n  license: MIT\n---\n';
    const result = applyPathReorderToFm(fenced, ['metadata'], ['license', 'author', 'version']);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const licenseIdx = result.nextFenced.indexOf('license:');
    const authorIdx = result.nextFenced.indexOf('author:');
    const versionIdx = result.nextFenced.indexOf('version:');
    expect(licenseIdx).toBeLessThan(authorIdx);
    expect(authorIdx).toBeLessThan(versionIdx);
    expect(result.nextFenced).toContain('name: skill');
  });

  test('reorders deeply nested children', () => {
    const fenced = '---\nouter:\n  inner:\n    a: 1\n    b: 2\n    c: 3\n---\n';
    const result = applyPathReorderToFm(fenced, ['outer', 'inner'], ['c', 'a', 'b']);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const cIdx = result.nextFenced.indexOf('c:');
    const aIdx = result.nextFenced.indexOf('a:');
    const bIdx = result.nextFenced.indexOf('b:');
    expect(cIdx).toBeLessThan(aIdx);
    expect(aIdx).toBeLessThan(bIdx);
  });

  test('rejects a non-permutation of current keys', () => {
    const fenced = '---\nmetadata:\n  version: 1.0.0\n  author: Inkeep\n---\n';
    const result = applyPathReorderToFm(fenced, ['metadata'], ['version', 'missing']);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('reorder_mismatch');
  });

  test('rejects when target is not a map', () => {
    const fenced = '---\nname: skill\n---\n';
    const result = applyPathReorderToFm(fenced, ['name'], ['x']);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('invalid_path');
  });

  test('rejects reorder targeting a sequence (not a map)', () => {
    const fenced = '---\nitems:\n  - a\n  - b\n---\n';
    const result = applyPathReorderToFm(fenced, ['items'], ['a', 'b']);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('invalid_path');
  });

  test('idempotent reorder to the same order is byte-stable', () => {
    const fenced = '---\nmetadata:\n  version: 1.0.0\n  author: Inkeep\n---\n';
    const result = applyPathReorderToFm(fenced, ['metadata'], ['version', 'author']);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.nextFenced).toBe(fenced);
  });

  test('preserves comments on the reordered map', () => {
    const fenced =
      '---\nmetadata:\n  # before version\n  version: 1.0.0\n  # before author\n  author: Inkeep\n---\n';
    const result = applyPathReorderToFm(fenced, ['metadata'], ['author', 'version']);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.nextFenced).toContain('# before version');
    expect(result.nextFenced).toContain('# before author');
  });
});

describe('applyPathReorderSeqToFm — array-of-objects reorder semantics', () => {
  test('permutes items at the array path; sibling keys + per-item content survive', () => {
    const fenced =
      '---\ntitle: doc\ncontributors:\n  - name: A\n    role: lead\n  - name: B\n    role: review\n  - name: C\n    role: author\n---\n';
    const result = applyPathReorderSeqToFm(fenced, ['contributors'], [2, 0, 1]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const parsed = parseFmRegion(result.nextFenced.replace(/^---\n/, '').replace(/---\n$/, ''));
    expect(parsed.parseError).toBeUndefined();
    expect(parsed.map?.contributors).toEqual([
      { name: 'C', role: 'author' },
      { name: 'A', role: 'lead' },
      { name: 'B', role: 'review' },
    ]);
    expect(parsed.map?.title).toBe('doc');
  });

  test('identity permutation is a no-op (byte-stable)', () => {
    const fenced = '---\nlist:\n  - { x: 1 }\n  - { x: 2 }\n---\n';
    const result = applyPathReorderSeqToFm(fenced, ['list'], [0, 1]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.nextFenced).toBe(fenced);
  });

  test('preserves per-item line comments after reorder', () => {
    const fenced = '---\nitems:\n  # before A\n  - name: A\n  # before B\n  - name: B\n---\n';
    const result = applyPathReorderSeqToFm(fenced, ['items'], [1, 0]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.nextFenced).toContain('# before A');
    expect(result.nextFenced).toContain('# before B');
  });

  test('rejects non-permutation (wrong length)', () => {
    const fenced = '---\nlist:\n  - { x: 1 }\n  - { x: 2 }\n  - { x: 3 }\n---\n';
    const result = applyPathReorderSeqToFm(fenced, ['list'], [0, 1]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('reorder_mismatch');
  });

  test('rejects non-permutation (duplicate index)', () => {
    const fenced = '---\nlist:\n  - { x: 1 }\n  - { x: 2 }\n---\n';
    const result = applyPathReorderSeqToFm(fenced, ['list'], [0, 0]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('reorder_mismatch');
  });

  test('rejects non-permutation (out-of-range index)', () => {
    const fenced = '---\nlist:\n  - { x: 1 }\n  - { x: 2 }\n---\n';
    const result = applyPathReorderSeqToFm(fenced, ['list'], [0, 2]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('reorder_mismatch');
  });

  test('rejects when target at path is not a sequence (map instead)', () => {
    const fenced = '---\nmetadata:\n  version: 1.0\n---\n';
    const result = applyPathReorderSeqToFm(fenced, ['metadata'], [0]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('invalid_path');
  });

  test('rejects when target at path is missing (parent does not exist)', () => {
    const fenced = '---\ntitle: doc\n---\n';
    const result = applyPathReorderSeqToFm(fenced, ['nope'], [0]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('invalid_path');
  });

  test('rejects empty path (whole document)', () => {
    const fenced = '---\ntitle: doc\n---\n';
    const result = applyPathReorderSeqToFm(fenced, [], [0]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('invalid_path');
  });

  test('reorder of a deeply-nested array preserves siblings at every depth', () => {
    const fenced =
      '---\nproject:\n  name: ok\n  authors:\n    - name: A\n    - name: B\n  release: alpha\n---\n';
    const result = applyPathReorderSeqToFm(fenced, ['project', 'authors'], [1, 0]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const parsed = parseFmRegion(result.nextFenced.replace(/^---\n/, '').replace(/---\n$/, ''));
    expect(parsed.map?.project).toEqual({
      name: 'ok',
      authors: [{ name: 'B' }, { name: 'A' }],
      release: 'alpha',
    });
  });

  test('reorder result re-applied (twice) is byte-stable (idempotence)', () => {
    const fenced = '---\nlist:\n  - { x: 1 }\n  - { x: 2 }\n  - { x: 3 }\n---\n';
    const once = applyPathReorderSeqToFm(fenced, ['list'], [2, 0, 1]);
    expect(once.ok).toBe(true);
    if (!once.ok) return;
    const twice = applyPathReorderSeqToFm(once.nextFenced, ['list'], [0, 1, 2]);
    expect(twice.ok).toBe(true);
    if (!twice.ok) return;
    expect(twice.nextFenced).toBe(once.nextFenced);
  });
});

describe('applyPathSetToFm / applyPathDeleteToFm — path validation + value errors', () => {
  const fenced = '---\nname: skill\nitems:\n  - a\n  - b\n---\n';

  test('empty path is rejected as invalid_path', () => {
    const result = applyPathSetToFm(fenced, [], 'x');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('invalid_path');
  });

  test('negative integer index is rejected as invalid_path', () => {
    const result = applyPathSetToFm(fenced, ['items', -1], 'x');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('invalid_path');
  });

  test('non-integer (float) index is rejected as invalid_path', () => {
    const result = applyPathSetToFm(fenced, ['items', 1.5], 'x');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('invalid_path');
  });

  test('reserved top-level key is rejected as reserved_key', () => {
    const result = applyPathSetToFm(fenced, ['frontmatter'], 'x');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('reserved_key');
  });

  test('a structurally-valid path with a non-conforming value reports invalid_value (not invalid_path)', () => {
    const result = applyPathSetToFm(fenced, ['name'], Symbol('nope') as unknown as string);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('invalid_value');
      if (result.error.kind === 'invalid_value') expect(result.error.key).toBe('name');
    }
  });

  test('valid nested set adds the leaf and preserves the sibling', () => {
    const result = applyPathSetToFm('---\nmeta:\n  a: 1\n---\n', ['meta', 'b'], 'two');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.nextFenced).toContain('a: 1');
    expect(result.nextFenced).toContain('b: two');
  });

  test('deletePath validates the path the same way', () => {
    expect(applyPathDeleteToFm(fenced, []).ok).toBe(false);
    const neg = applyPathDeleteToFm(fenced, ['items', -1]);
    expect(neg.ok).toBe(false);
    if (!neg.ok) expect(neg.error.kind).toBe('invalid_path');
  });

  test('deletePath on an absent leaf is an idempotent no-op', () => {
    const result = applyPathDeleteToFm(fenced, ['nope']);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.nextFenced).toBe(fenced);
  });
});
