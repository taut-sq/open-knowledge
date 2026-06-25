
import { existsSync, realpathSync } from 'node:fs';
import { join, relative } from 'node:path';
import { resolveBundledSkillDir } from '../build-skill-zip.ts';
import { tracedCpSync, tracedMkdirSync, tracedRmSync } from '../fs-traced.ts';

const EDITOR_SKILL_DIRS: ReadonlyArray<{ label: string; rel: string }> = [
  { label: 'Claude Code', rel: '.claude/skills' },
  { label: 'Cursor', rel: '.cursor/skills' },
  { label: 'Codex', rel: '.agents/skills' },
];

const PLATFORM_SKILL_NAME = 'open-knowledge';

function isContained(parent: string, child: string): boolean {
  try {
    const rel = relative(realpathSync(parent), realpathSync(child));
    return rel === '' || (!rel.startsWith('..') && !rel.startsWith('/'));
  } catch {
    return false;
  }
}

export function installPackSkill(projectDir: string, packId: string): string[] {
  let sourceDir: string;
  try {
    sourceDir = resolveBundledSkillDir(`packs/${packId}`, { checkDesktop: true });
  } catch {
    return [];
  }

  const installed: string[] = [];
  for (const { label, rel } of EDITOR_SKILL_DIRS) {
    const skillsRoot = join(projectDir, rel);
    const platformSkill = join(skillsRoot, PLATFORM_SKILL_NAME, 'SKILL.md');
    if (!existsSync(platformSkill)) continue;
    if (existsSync(skillsRoot) && !isContained(projectDir, skillsRoot)) continue;

    const targetDir = join(skillsRoot, `open-knowledge-pack-${packId}`);
    try {
      tracedRmSync(targetDir, { recursive: true, force: true });
      tracedMkdirSync(skillsRoot, { recursive: true });
      tracedCpSync(sourceDir, targetDir, { recursive: true });
      installed.push(label);
    } catch {
    }
  }
  return installed;
}
