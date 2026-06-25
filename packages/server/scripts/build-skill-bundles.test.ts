import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  BUNDLE_IDS,
  buildPackSkills,
  buildSkillBundles,
  checkSharedContentByteEquality,
  composeSkill,
  defaultPaths,
  type SkillBundlePaths,
} from './build-skill-bundles.ts';

const cleanup: string[] = [];
afterEach(() => {
  while (cleanup.length > 0) {
    const p = cleanup.pop();
    if (p) {
      try {
        rmSync(p, { recursive: true, force: true });
      } catch {
      }
    }
  }
});

function fixture(opts: {
  discovery: string;
  project: string;
  shared?: Record<string, string>;
}): SkillBundlePaths {
  const root = mkdtempSync(join(tmpdir(), 'ok-skill-compose-'));
  cleanup.push(root);
  const skillsDir = join(root, 'skills');
  for (const bundle of BUNDLE_IDS) mkdirSync(join(skillsDir, bundle), { recursive: true });
  mkdirSync(join(skillsDir, '_shared'), { recursive: true });
  writeFileSync(join(skillsDir, 'discovery', 'SKILL.md'), opts.discovery);
  writeFileSync(join(skillsDir, 'project', 'SKILL.md'), opts.project);
  for (const [name, body] of Object.entries(opts.shared ?? {})) {
    writeFileSync(join(skillsDir, '_shared', name), body);
  }
  return { skillsDir, distDir: join(root, 'dist', 'assets', 'skills') };
}

describe('composeSkill', () => {
  test('text with no placeholders passes through unchanged', () => {
    const { composed, placeholders } = composeSkill('# Title\n\nbody.\n', () => 'X');
    expect(composed).toBe('# Title\n\nbody.\n');
    expect(placeholders).toEqual([]);
  });

  test('resolves a single placeholder', () => {
    const { composed, placeholders } = composeSkill(
      'before {{> _shared/snip.md }} after',
      (name) => (name === 'snip.md' ? 'SNIPPET' : '??'),
    );
    expect(composed).toBe('before SNIPPET after');
    expect(placeholders).toEqual(['snip.md']);
  });

  test('resolves multiple distinct placeholders and dedupes the name list', () => {
    const { composed, placeholders } = composeSkill(
      '{{> _shared/a.md }} / {{> _shared/b.md }} / {{> _shared/a.md }}',
      (name) => name.toUpperCase(),
    );
    expect(composed).toBe('A.MD / B.MD / A.MD');
    expect(placeholders).toEqual(['a.md', 'b.md']);
  });

  test('tolerates extra whitespace inside the placeholder', () => {
    const { composed } = composeSkill('{{>_shared/x.md}}|{{>   _shared/x.md   }}', () => 'Y');
    expect(composed).toBe('Y|Y');
  });
});

describe('buildSkillBundles', () => {
  test('composes both bundles into dist/<bundle>/SKILL.md', () => {
    const paths = fixture({
      discovery: 'discovery: {{> _shared/intro.md }}\n',
      project: 'project: {{> _shared/intro.md }}\n',
      shared: { 'intro.md': 'SHARED-INTRO' },
    });
    const built = buildSkillBundles(paths);
    expect(built.map((b) => b.bundle).sort()).toEqual(['discovery', 'project']);
    for (const b of built) {
      expect(existsSync(b.outputPath)).toBe(true);
      expect(readFileSync(b.outputPath, 'utf-8')).toContain('SHARED-INTRO');
      expect(readFileSync(b.outputPath, 'utf-8')).not.toContain('{{>');
      expect(b.placeholders).toEqual(['intro.md']);
    }
  });

  test('identity transform when no placeholders are used (v1 case)', () => {
    const paths = fixture({ discovery: '# d\n', project: '# p\n' });
    const built = buildSkillBundles(paths);
    const discovery = built.find((b) => b.bundle === 'discovery');
    expect(discovery?.placeholders).toEqual([]);
    expect(readFileSync(discovery?.outputPath ?? '', 'utf-8')).toBe('# d\n');
  });

  test('throws when a referenced _shared file is absent', () => {
    const paths = fixture({
      discovery: '{{> _shared/missing.md }}',
      project: '# p\n',
    });
    expect(() => buildSkillBundles(paths)).toThrow(/missing\.md/);
  });
});

describe('buildPackSkills', () => {
  test('composes each packs/<id>/SKILL.md into dist/packs/<id>/', () => {
    const paths = fixture({ discovery: '# d\n', project: '# p\n' });
    const packDir = join(paths.skillsDir, 'packs', 'demo-pack');
    mkdirSync(packDir, { recursive: true });
    writeFileSync(join(packDir, 'SKILL.md'), '# demo pack\n');
    expect(buildPackSkills(paths)).toEqual(['demo-pack']);
    const out = join(paths.distDir, 'packs', 'demo-pack', 'SKILL.md');
    expect(existsSync(out)).toBe(true);
    expect(readFileSync(out, 'utf-8')).toBe('# demo pack\n');
  });

  test('returns [] when there is no packs/ directory', () => {
    expect(buildPackSkills(fixture({ discovery: '# d\n', project: '# p\n' }))).toEqual([]);
  });

  test('repo assets — all eight starter packs are present to build', () => {
    const packsDir = join(defaultPaths().skillsDir, 'packs');
    const expected = [
      'codebase-wiki',
      'entity-vault',
      'knowledge-base',
      'okf',
      'plain-notes',
      'software-lifecycle',
      'worldbuilding',
      'writing-pipeline',
    ];
    for (const id of expected) {
      expect(existsSync(join(packsDir, id, 'SKILL.md'))).toBe(true);
    }
  });
});

describe('checkSharedContentByteEquality', () => {
  test('passes when placeholders resolve to byte-identical shared content', () => {
    const paths = fixture({
      discovery: 'd {{> _shared/s.md }}',
      project: 'p {{> _shared/s.md }}',
      shared: { 's.md': 'EXACT-BYTES' },
    });
    const result = checkSharedContentByteEquality(paths);
    expect(result).toEqual({ ok: true, violations: [] });
  });

  test('passes trivially when no bundle references a placeholder', () => {
    const paths = fixture({ discovery: '# d\n', project: '# p\n' });
    expect(checkSharedContentByteEquality(paths).ok).toBe(true);
  });

  test('flags a missing _shared file as a violation', () => {
    const paths = fixture({
      discovery: '{{> _shared/gone.md }}',
      project: '# p\n',
    });
    const result = checkSharedContentByteEquality(paths);
    expect(result.ok).toBe(false);
    expect(result.violations.join('\n')).toContain('gone.md');
  });
});

describe('repo assets — production guard', () => {
  test('checkSharedContentByteEquality passes against the real skill bundles', () => {
    const result = checkSharedContentByteEquality(defaultPaths());
    expect(result.violations).toEqual([]);
    expect(result.ok).toBe(true);
  });

  test('both real source bundles exist and the _shared directory is present', () => {
    const { skillsDir } = defaultPaths();
    for (const bundle of BUNDLE_IDS) {
      expect(existsSync(join(skillsDir, bundle, 'SKILL.md'))).toBe(true);
    }
    expect(existsSync(join(skillsDir, '_shared'))).toBe(true);
  });

  test('the two bundles carry distinct frontmatter name: values (shadow prevention)', () => {
    const { skillsDir } = defaultPaths();
    const discovery = readFileSync(join(skillsDir, 'discovery', 'SKILL.md'), 'utf-8');
    const project = readFileSync(join(skillsDir, 'project', 'SKILL.md'), 'utf-8');
    expect(/^name:\s*open-knowledge-discovery\s*$/m.test(discovery)).toBe(true);
    expect(/^name:\s*open-knowledge\s*$/m.test(project)).toBe(true);
  });
});
