
import { describe, expect, test } from 'bun:test';
import SRC from './ShareReceiveDialog?raw';
import METADATA_SRC from './share-metadata-rows?raw';

describe('ShareReceiveDialog — module shape', () => {
  test('exports the named component', () => {
    expect(SRC).toMatch(/export\s+function\s+ShareReceiveDialog\s*\(/);
  });
});

describe('ShareReceiveDialog — wiring', () => {
  test('imports the Dialog primitives from @/components/ui/dialog', () => {
    expect(SRC).toContain("from '@/components/ui/dialog'");
    expect(SRC).toContain('DialogRoot');
    expect(SRC).toContain('DialogContent');
    expect(SRC).toContain('DialogHeader');
    expect(SRC).toContain('DialogTitle');
    expect(SRC).toContain('DialogBody');
    expect(SRC).toContain('DialogFooter');
  });

  test('imports the receive-flow helpers (no Q1 lookup wrapper)', () => {
    expect(SRC).toContain("from '@/lib/share/receive-flow'");
    expect(SRC).toContain('buildCloneUrl');
    expect(SRC).toContain('canonicalGitHubRemoteUrl');
    expect(SRC).toContain('formatReceiveLog');
    expect(SRC).toContain('mapValidationToToast');
    expect(SRC).toContain('presentReceiveError');
  });

  test('imports the consent-flow state machine helpers', () => {
    expect(SRC).toContain("from '@/lib/share/consent-flow'");
    expect(SRC).toContain('applyOkInitOutcome');
    expect(SRC).toContain('applyOpenOutcome');
    expect(SRC).toContain('initialConsentFlowState');
    expect(SRC).toContain('markInitializing');
  });

  test('imports the receive-store + singleton', () => {
    expect(SRC).toContain("from '@/lib/share/receive-store'");
    expect(SRC).toContain('shareReceiveStore');
  });

  test('uses useSyncExternalStore against the store snapshot/subscribe', () => {
    expect(SRC).toContain('useSyncExternalStore');
    expect(SRC).toContain('store.subscribe');
    expect(SRC).toContain('store.getSnapshot');
  });
});

describe('ShareReceiveDialog — main-resolved payload contract (US-006 seam)', () => {
  test('gates surfaces on launcher-consent and launcher-miss payload kinds', () => {
    expect(SRC).toContain("'launcher-consent'");
    expect(SRC).toContain("'launcher-miss'");
  });

  test('does NOT re-run selectCandidate / runQ1Lookup in the renderer', () => {
    expect(SRC).not.toMatch(/\brunQ1Lookup\s*\(/);
    expect(SRC).not.toMatch(/\bselectCandidate\s*\(/);
    expect(SRC).not.toMatch(/\basQ1BridgeDeps\s*\(/);
  });

  test('does NOT host the branch-switch surface (moved to ShareBranchSwitchDialog)', () => {
    expect(SRC).not.toContain("from '@/lib/share/branch-switch-flow'");
    expect(SRC).not.toMatch(/\bapplyBranchInfo\s*\(/);
    expect(SRC).not.toMatch(/\bapplyCheckoutOutcome\s*\(/);
    expect(SRC).not.toMatch(/\bmarkSwitching\s*\(/);
    expect(SRC).not.toMatch(/\bawaitBranchSwitched\s*\(/);
    expect(SRC).not.toMatch(/\bbridge\.project\.runCheckout\s*\(/);
    expect(SRC).not.toMatch(/\bbridge\.project\.fetchBranchInfo\s*\(/);
    expect(SRC).not.toContain('share-receive-branch-switch-dialog');
    expect(SRC).not.toContain('share-receive-doc-missing-dialog');
  });

  test('reads payload.share + payload.candidatePath directly (no resolveSharePayload wrapper)', () => {
    expect(SRC).not.toMatch(/\bresolveSharePayload\s*\(/);
    expect(SRC).toMatch(/share\?\.\.|share\?\.owner|share\?\.repo|share\.owner|share\.repo/);
  });
});

describe('ShareReceiveDialog — launcher-consent surface', () => {
  test('seeds the consent flow from payload.candidatePath + payload.share', () => {
    expect(SRC).toContain('initialConsentFlowState');
    expect(SRC).toContain('candidatePath:');
    expect(SRC).toContain('targetPath:');
  });

  test('threads payload.parentProjectName so the "(a worktree of <name>)" caption renders', () => {
    expect(SRC).toContain('parentProjectName');
    expect(SRC).toContain('share-receive-consent-parent');
  });

  test('Initialize button is disabled in the error phase (no-retry terminal)', () => {
    expect(SRC).toContain('data-testid="share-receive-consent-initialize"');
    expect(SRC).toContain("disabled={initializing || consentState.phase === 'error'}");
  });

  test('Initialize handler runs okInit then dispatches bridge.project.open with pendingDeepLinkTarget + pendingBranch', () => {
    expect(SRC).toMatch(/bridge\.project[\s\n.]+okInit\(/);
    expect(SRC).toMatch(/bridge\.project[\s\n.]+open\(/);
    const idx = SRC.indexOf('function handleConsentInitialize');
    expect(idx).toBeGreaterThan(-1);
    const endIdx = SRC.indexOf('function handleConsentCancel', idx);
    expect(endIdx).toBeGreaterThan(idx);
    const handlerBody = SRC.slice(idx, endIdx);
    expect(handlerBody).toContain('pendingDeepLinkTarget');
    expect(handlerBody).toContain('pendingBranch');
  });
});

describe('ShareReceiveDialog — launcher-miss surface', () => {
  test('renders Q2 clone + locate cards', () => {
    expect(SRC).toContain('data-testid="share-receive-dialog"');
    expect(SRC).toContain('data-testid="share-receive-clone"');
    expect(SRC).toContain('data-testid="share-receive-local"');
  });

  test('Q2 picker path uses bridge.dialog.openFolder + bridge.share.validateLocalFolder', () => {
    expect(SRC).toContain('bridge.dialog.openFolder()');
    expect(SRC).toContain('bridge.share.validateLocalFolder');
  });

  test('cloneController prop seam carries the streamlined auth + clone surface', () => {
    expect(SRC).toContain('cloneController');
    expect(SRC).toContain('ShareReceiveCloneController');
    expect(SRC).toContain('getAuthStatus');
    expect(SRC).toContain('runClone');
    expect(SRC).toContain('startSignIn');
    expect(SRC).toContain('toast.info');
  });

  test('Clone button disables until auth check resolves with authenticated', () => {
    expect(SRC).toMatch(/authStatus\?\.authenticated === true/);
    expect(SRC).toContain('Connect to clone');
    expect(SRC).toContain('Cloning...');
    expect(SRC).toContain('data-testid="share-receive-signin"');
    expect(SRC).toContain('data-testid="share-receive-auth-banner"');
  });
});

describe('ShareReceiveDialog — non-launcher kinds (toast-only)', () => {
  test('non-launcher payloads (unsupported-version / invalid) route through toast.error + store.dismiss', () => {
    expect(SRC).toContain("from 'sonner'");
    expect(SRC).toContain('toast.error');
    expect(SRC).toContain('store.dismiss');
  });
});

describe('ShareReceiveDialog — ShareMetadataRows (shared module)', () => {
  test('imports the shared ShareMetadataRows component', () => {
    expect(SRC).toContain("from '@/components/share-metadata-rows'");
    expect(SRC).toContain('ShareMetadataRows');
  });

  test('wires the dialog-scoped testids through the shared component props', () => {
    expect(SRC).toContain('testId="share-receive-metadata"');
    expect(SRC).toContain('branchTestId="share-receive-metadata-branch"');
  });

  test('shared module uses semantic <dl>/<dt>/<dd> markup for screen-reader friendliness', () => {
    expect(METADATA_SRC).toMatch(/<dl\s[^>]*data-testid=\{testId\}/);
    expect(METADATA_SRC).toContain('<dt ');
    expect(METADATA_SRC).toContain('<dd ');
  });

  test('shared module renders Repository / File / Branch labels via Lingui Trans', () => {
    expect(METADATA_SRC).toMatch(/<Trans>Repository<\/Trans>/);
    expect(METADATA_SRC).toMatch(/<Trans>File<\/Trans>/);
    expect(METADATA_SRC).toMatch(/<Trans>Branch<\/Trans>/);
  });

  test("shared module hides the Branch row for well-known defaults ('main' or 'master')", () => {
    expect(METADATA_SRC).toMatch(/DEFAULT_BRANCH_NAMES[\s\S]*?Set[\s\S]*?'main'[\s\S]*?'master'/);
    expect(METADATA_SRC).toContain("branch !== ''");
    expect(METADATA_SRC).toContain('!DEFAULT_BRANCH_NAMES.has(branch)');
  });

  test('shared module labels use w-20 shrink-0 font-mono uppercase tracking-wide text-xs', () => {
    expect(METADATA_SRC).toContain('w-20 shrink-0 font-mono uppercase tracking-wide text-xs');
  });

  test('shared module branch row guards a caller-supplied testid for downstream selection', () => {
    expect(METADATA_SRC).toContain('data-testid={branchTestId}');
  });
});

describe('ShareReceiveDialog — React Compiler discipline', () => {
  test('no React Compiler escape hatches', () => {
    expect(SRC).not.toMatch(/\bforwardRef\b/);
    expect(SRC).not.toMatch(/\bmemo\(/);
    expect(SRC).not.toMatch(/\buseCallback\b/);
    expect(SRC).not.toMatch(/\buseMemo\b/);
  });

  test('no inline style props (Tailwind only)', () => {
    expect(SRC).not.toMatch(/style=\{\{/);
  });

  test('no try/finally (BuildHIR rejects)', () => {
    expect(SRC).not.toMatch(/\}\s*finally\s*\{/);
  });

  test('remounts the inner dialog per payload via key (no manual reset effect)', () => {
    expect(SRC).toContain('ShareReceiveDialogInner');
    expect(SRC).toMatch(/<ShareReceiveDialogInner\s+key=\{remountKey\}/);
    expect(SRC).not.toMatch(/authProbeStartedRef\.current = false;\s*\},\s*\[payload\]\);/);
  });
});
