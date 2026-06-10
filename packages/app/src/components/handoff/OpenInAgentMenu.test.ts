
import { describe, expect, test } from 'bun:test';
import SRC from './OpenInAgentMenu?raw';

describe('OpenInAgentMenu module surface', () => {
  test('exports the shell component', async () => {
    const mod = await import('./OpenInAgentMenu');
    expect(typeof mod.OpenInAgentMenu).toBe('function');
  });

  test('re-exports successToastForWebFallback for surface-level wiring', async () => {
    const mod = await import('./OpenInAgentMenu');
    expect(typeof mod.successToastForWebFallback).toBe('function');
    const itemMod = await import('./OpenInAgentMenuItem');
    expect(mod.successToastForWebFallback).toBe(itemMod.successToastForWebFallback);
  });
});

describe('OpenInAgentMenu source-level guards', () => {
  test('renders only the VISIBLE_TARGETS subset (cowork hidden from this surface)', () => {
    expect(SRC).toMatch(
      /installedTargets\s*=\s*VISIBLE_TARGETS\.filter\(\s*\(target\)\s*=>\s*states\[target\.id\]\?\.installed\s*===\s*true,?\s*\)/,
    );
  });

  test('claudeInstalled probe keys off the visible claude-code row', () => {
    expect(SRC).toMatch(/states\[['"]claude-code['"]\]\?\.installed\s*===\s*true/);
    expect(SRC).not.toContain("states['claude-cowork']");
  });

  test('preserves the always-visible Claude web fallback when !claudeInstalled', () => {
    expect(SRC).toContain('open-in-agent-claude-web-fallback');
    expect(SRC).toContain('Open in claude.ai');
    expect(SRC).toContain('!claudeInstalled && !isSelectionScope');
    expect(SRC).toContain('const isSelectionScope');
  });

  test('trigger shows a visible "Open with AI" label with NO aria-label override (WCAG 2.5.3)', () => {
    expect(SRC).toMatch(/<Trans>Open with AI<\/Trans>/);
    const triggerOpenTag = SRC.match(
      /<Button\b[\s\S]*?data-testid="open-in-agent-trigger"[\s\S]*?>/,
    );
    expect(triggerOpenTag).not.toBeNull();
    expect(triggerOpenTag?.[0]).not.toMatch(/aria-label/);
  });

  test('does NOT wrap its labeled trigger in a redundant Tooltip (visible "Open with AI" text is the affordance)', () => {
    expect(SRC).not.toContain("from '@/components/ui/tooltip'");
    expect(SRC).not.toContain('<TooltipContent>');
    expect(SRC).toContain('<Trans>Open with AI</Trans>');
  });

  test('opens from click on the Electron host (macOS drag region swallows pointerdown)', () => {
    expect(SRC).toMatch(/onClick=\{\s*isElectronHost/);
    expect(SRC).toMatch(/onPointerDown=\{\s*isElectronHost/);
    expect(SRC).toContain('sawPointerDownRef');
  });
});
