
import { describe, expect, test } from 'bun:test';
import { PublishToGitHubDialog } from './PublishToGitHubDialog';
import SRC from './PublishToGitHubDialog?raw';

describe('PublishToGitHubDialog module', () => {
  test('exports PublishToGitHubDialog as a named function component', () => {
    expect(typeof PublishToGitHubDialog).toBe('function');
  });
});

describe('PublishToGitHubDialog — load-bearing structural guards', () => {
  test('uses the canonical Dialog primitives (Root, Content, Header, Body, Footer, Title)', () => {
    expect(SRC).toContain("from '@/components/ui/dialog'");
    expect(SRC).toContain('Dialog as DialogRoot');
    expect(SRC).toContain('DialogContent');
    expect(SRC).toContain('DialogHeader');
    expect(SRC).toContain('DialogBody');
    expect(SRC).toContain('DialogFooter');
    expect(SRC).toContain('DialogTitle');
  });

  test('imports decision-tree helpers from @/lib/share/publish-wizard', () => {
    expect(SRC).toContain("from '@/lib/share/publish-wizard'");
    expect(SRC).toContain('fetchPublishOwners');
    expect(SRC).toContain('fetchPublishNameCheck');
    expect(SRC).toContain('submitPublishRequest');
    expect(SRC).toContain('sanitizeRepoName');
    expect(SRC).toContain('resolveNameCheckStatus');
    expect(SRC).toContain('presentPublishError');
    expect(SRC).toContain('canSubmitPublish');
  });

  test('post-publish success view: pre-fetched URL field + Copy button + Done button', () => {
    expect(SRC).toContain('publishResult');
    expect(SRC).toContain('PublishSuccessView');
    expect(SRC).toContain('shareUrl');
    expect(SRC).toContain('shareUrlError');
    expect(SRC).toContain('data-testid="publish-success"');
    expect(SRC).toContain('data-testid="publish-share-url"');
    expect(SRC).toContain('data-testid="publish-copy-link"');
    expect(SRC).toContain('data-testid="publish-success-done"');
    expect(SRC).toContain('handleCopyShareLink');
    expect(SRC).not.toContain('copyPostPublishShareUrl');
  });

  test('share URL pre-fetch routes through requestShareConstructUrl + mapShareErrorToToast', () => {
    expect(SRC).toContain("from '@/lib/share/run-share-action'");
    expect(SRC).toContain('requestShareConstructUrl');
    expect(SRC).toContain('mapShareErrorToToast');
  });

  test('mounts AuthModal for the auth-required / reauth recovery branch', () => {
    expect(SRC).toContain("from '@/components/AuthModal'");
    expect(SRC).toContain('<AuthModal');
    expect(SRC).toContain('handleAuthSuccess');
  });

  test('reads contentDir via useWorkspace + activeDocName via useDocumentContext', () => {
    expect(SRC).toContain("from '@/lib/use-workspace'");
    expect(SRC).toContain('useWorkspace');
    expect(SRC).toContain("from '@/editor/DocumentContext'");
    expect(SRC).toContain('useDocumentContext');
  });

  test('iframe Permissions-Policy refusal surfaces a tailored toast (vs the generic fallback)', () => {
    expect(SRC).toContain('isPermissionsPolicyRefusal');
    expect(SRC).toContain('window.self !== window.top');
    expect(SRC).toContain('desktop app');
  });

  test('clipboard write goes through the clipboard adapter (Electron IPC + writeText fallback)', () => {
    expect(SRC).toContain("from '@/lib/share/clipboard-adapter'");
    expect(SRC).toContain('scheduleClipboardWrite');
    expect(SRC).not.toContain('navigator.clipboard.writeText');
  });

  test('SAML SSO surface routes through shell.openExternal (system browser) or window.open fallback', () => {
    expect(SRC).toContain('window.okDesktop?.shell?.openExternal');
    expect(SRC).toContain('window.open(');
  });

  test('Submit button is type="button" and disables when canSubmitPublish is false', () => {
    expect(SRC).toMatch(
      /<Button[\s\S]{0,400}?type="button"[\s\S]{0,400}?data-testid="publish-submit"/,
    );
    expect(SRC).toContain('canSubmitPublish');
  });

  test('Owner field, name field, visibility radio + description carry stable test-ids', () => {
    expect(SRC).toContain('data-testid="publish-owner-trigger"');
    expect(SRC).toContain('data-testid="publish-name"');
    expect(SRC).toContain('data-testid="publish-visibility-private"');
    expect(SRC).toContain('data-testid="publish-visibility-public"');
    expect(SRC).toContain('data-testid="publish-description"');
    expect(SRC).toContain('data-testid="publish-banner"');
  });

  test('Private visibility is the default (FR6) — initial state seeded by the open-effect', () => {
    expect(SRC).toMatch(/setVisibility\(['"]private['"]\)/);
  });

  test('Will be created as <name> preview is the FR6 inline preview surface', () => {
    expect(SRC).toContain('Will be created as');
  });

  test('Name-check debounce constant is set to the spec-required 500ms', () => {
    expect(SRC).toMatch(/NAME_CHECK_DEBOUNCE_MS\s*=\s*500/);
  });

  test('Re-arms transient state on open (FR consistency with CreateProjectDialog)', () => {
    const block = SRC.match(/if \(!open\) return;[\s\S]{0,1200}?\}, \[open\]\);/);
    expect(block).not.toBeNull();
    const body = block?.[0] ?? '';
    expect(body).toContain('setBanner(null)');
    expect(body).toContain('setSubmitting(false)');
    expect(body).toContain('setName(seededName)');
    expect(body).toContain('setPublishResult(null)');
    expect(body).toContain('setCopying(false)');
    expect(body).toContain('setShareUrl(null)');
    expect(body).toContain('setShareUrlError(null)');
  });

  test('No React Compiler escape hatches (memo / useMemo / useCallback / forwardRef)', () => {
    expect(SRC).not.toMatch(/\bforwardRef\b/);
    expect(SRC).not.toMatch(/\buseMemo\b/);
    expect(SRC).not.toMatch(/\buseCallback\b/);
    expect(SRC).not.toMatch(/\bmemo\(/);
  });

  test('No inline style props (Tailwind via className per code-style rule)', () => {
    expect(SRC).not.toMatch(/\bstyle=\{\{/);
  });

  test('Name-check indicator container is an aria-live region for status announcements (WCAG 4.1.3)', () => {
    expect(SRC).toMatch(/aria-live="polite"[\s\S]{0,800}?<NameCheckIndicator/);
  });
});
