
import { describe, expect, test } from 'bun:test';
import { ShareButton } from './ShareButton';
import SRC from './ShareButton?raw';

describe('ShareButton module', () => {
  test('exports ShareButton as a named function component', () => {
    expect(typeof ShareButton).toBe('function');
  });
});

describe('ShareButton — load-bearing structural guards', () => {
  test('delegates orchestration to runShareAction (helper carries the unit-tested decision tree)', () => {
    expect(SRC).toContain("from '@/lib/share/run-share-action'");
    expect(SRC).toContain('runShareAction');
  });

  test('takes a discriminated ShareTargetInput (doc|folder) | null via props (not a self-read of activeDocName)', () => {
    expect(SRC).toContain('ShareTargetInput');
    expect(SRC).toContain("from '@/lib/share/run-share-action'");
    expect(SRC).toMatch(/input\s*:\s*ShareTargetInput\s*\|\s*null/);
    expect(SRC).not.toContain('useDocumentContext');
  });

  test('reads hasRemote via useGitSyncStatusDetailed (no extra fetch)', () => {
    expect(SRC).toContain("from '@/hooks/use-git-sync-status'");
    expect(SRC).toContain('useGitSyncStatusDetailed');
    expect(SRC).toContain('hasRemote');
  });

  test('writes the share URL through the clipboard adapter (Electron IPC + writeText fallback)', () => {
    expect(SRC).toContain("from '@/lib/share/clipboard-adapter'");
    expect(SRC).toContain('scheduleClipboardWrite');
    expect(SRC).not.toContain('navigator.clipboard.writeText');
  });

  test('uses sonner toast for the success + error notifications', () => {
    expect(SRC).toContain("from 'sonner'");
    expect(SRC).toContain('toast.success');
    expect(SRC).toContain('toast.error');
  });

  test('clipboard-failed result surfaces a Popover with the URL as a manual-copy fallback', () => {
    expect(SRC).toContain("from '@/components/ui/popover'");
    expect(SRC).toContain('PopoverAnchor');
    expect(SRC).toContain('PopoverContent');
    expect(SRC).toContain('clipboardFailedUrl');
    expect(SRC).toContain('data-testid="share-button-fallback-popover"');
    expect(SRC).toContain('data-testid="share-button-fallback-url"');
    expect(SRC).toContain('Link ready but could not copy to clipboard.');
  });

  test('does NOT wrap its labeled trigger in a redundant Tooltip (visible "Share" text is the affordance)', () => {
    expect(SRC).not.toContain("from '@/components/ui/tooltip'");
    expect(SRC).not.toContain('<TooltipContent>');
    expect(SRC).toContain('<Trans>Share</Trans>');
  });

  test('Button carries a kind-aware aria-label so the icon-bearing affordance is screen-reader navigable', () => {
    expect(SRC).toMatch(/aria-label=\{[\s\S]*?t`Share folder`[\s\S]*?t`Share doc`[\s\S]*?\}/);
  });

  test('renders the Share2 icon from lucide-react', () => {
    expect(SRC).toContain("from 'lucide-react'");
    expect(SRC).toContain('Share2');
  });

  test('Button gets data-testid="share-button" for downstream Playwright coverage', () => {
    expect(SRC).toContain('data-testid="share-button"');
  });

  test('busy flag disables the button so double-clicks cannot fire two requests', () => {
    expect(SRC).toMatch(/setBusy\(true\)/);
    expect(SRC).toMatch(/setBusy\(false\)/);
  });


  test('no React Compiler escape hatches (forwardRef / memo / useMemo / useCallback)', () => {
    expect(SRC).not.toMatch(/\bforwardRef\b/);
    expect(SRC).not.toMatch(/\buseMemo\b/);
    expect(SRC).not.toMatch(/\buseCallback\b/);
    expect(SRC).not.toMatch(/\bmemo\(/);
  });

  test('no inline style props (Tailwind className per code-style rule)', () => {
    expect(SRC).not.toMatch(/\bstyle=\{\{/);
  });
});
