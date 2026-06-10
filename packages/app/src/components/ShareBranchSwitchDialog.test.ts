
import { describe, expect, test } from 'bun:test';
import SRC from './ShareBranchSwitchDialog?raw';

describe('ShareBranchSwitchDialog — module shape', () => {
  test('exports the named component', () => {
    expect(SRC).toMatch(/export\s+function\s+ShareBranchSwitchDialog\s*\(/);
  });

  test('exports the props type', () => {
    expect(SRC).toMatch(/export\s+interface\s+ShareBranchSwitchDialogProps/);
  });
});

describe('ShareBranchSwitchDialog — wiring', () => {
  test('imports the Dialog primitives from @/components/ui/dialog (shadcn)', () => {
    expect(SRC).toContain("from '@/components/ui/dialog'");
    expect(SRC).toContain('DialogRoot');
    expect(SRC).toContain('DialogContent');
    expect(SRC).toContain('DialogHeader');
    expect(SRC).toContain('DialogTitle');
    expect(SRC).toContain('DialogBody');
    expect(SRC).toContain('DialogFooter');
  });

  test('imports Button from @/components/ui/button (no raw <button>)', () => {
    expect(SRC).toContain("from '@/components/ui/button'");
    expect(SRC).not.toMatch(/<button\b/);
    expect(SRC).not.toMatch(/<input\b/);
    expect(SRC).not.toMatch(/<select\b/);
    expect(SRC).not.toMatch(/<textarea\b/);
  });

  test('imports the branch-switch-flow state machine helpers', () => {
    expect(SRC).toContain("from '@/lib/share/branch-switch-flow'");
    expect(SRC).toContain('applyBranchInfo');
    expect(SRC).toContain('applyCheckoutOutcome');
    expect(SRC).toContain('selectBranchSwitchVariant');
    expect(SRC).toContain('formatCurrentLabel');
    expect(SRC).toContain('markSwitching');
    expect(SRC).toContain('initialBranchSwitchState');
  });

  test('imports the receive-store singleton + uses useSyncExternalStore', () => {
    expect(SRC).toContain("from '@/lib/share/receive-store'");
    expect(SRC).toContain('shareReceiveStore');
    expect(SRC).toContain('useSyncExternalStore');
    expect(SRC).toContain('store.subscribe');
    expect(SRC).toContain('store.getSnapshot');
  });
});

describe('ShareBranchSwitchDialog — main-resolved payload contract (US-003 seam)', () => {
  test('gates rendering on the project-branch-switch payload kind', () => {
    expect(SRC).toContain("'project-branch-switch'");
  });

  test('does NOT re-run selectCandidate / runQ1Lookup in the renderer', () => {
    expect(SRC).not.toMatch(/\brunQ1Lookup\s*\(/);
    expect(SRC).not.toMatch(/\bselectCandidate\s*\(/);
    expect(SRC).not.toMatch(/\basQ1BridgeDeps\s*\(/);
  });

  test('reads projectPath, share, and currentBranch from the payload', () => {
    expect(SRC).toContain('payload.projectPath');
    expect(SRC).toMatch(/payload\.share|active\.share/);
  });
});

describe('ShareBranchSwitchDialog — branch-info + checkout wiring', () => {
  test('fetches bridge.project.fetchBranchInfo once per payload (variant matrix data)', () => {
    expect(SRC).toMatch(/bridge\.project[\s\n.]+fetchBranchInfo\(/);
    expect(SRC).toContain('branchInfoStartedRef');
  });

  test('calls bridge.project.runCheckout on the Switch user click', () => {
    expect(SRC).toMatch(/bridge\.project[\s\n.]+runCheckout\(/);
  });

  test('calls bridge.project.awaitBranchSwitched after runCheckout returns ok', () => {
    expect(SRC).toMatch(/bridge\.project[\s\n.]+awaitBranchSwitched\(/);
    expect(SRC).toContain('timeoutMs: 30_000');
  });

  test('Switch handler does NOT navigate on runCheckout HTTP 200 (STOP rule)', () => {
    const switchIdx = SRC.indexOf('function handleSwitch');
    expect(switchIdx).toBeGreaterThan(-1);
    const handlerEndIdx = SRC.indexOf('function handleOpenCurrent', switchIdx);
    expect(handlerEndIdx).toBeGreaterThan(switchIdx);
    const handlerBody = SRC.slice(switchIdx, handlerEndIdx);
    expect(handlerBody).not.toMatch(/window\.location\.hash\s*=/);
    expect(handlerBody).not.toMatch(/window\.location\.assign\b/);
    expect(handlerBody).not.toContain('awaitBranchSwitched(');
  });

  test('await-CC1 effect single-fires via a ref + has a cancelled-flag cleanup', () => {
    expect(SRC).toContain('awaitBranchSwitchedStartedRef');
    const awaitIdx = SRC.indexOf('awaitBranchSwitched(');
    expect(awaitIdx).toBeGreaterThan(-1);
    const effectStart = SRC.lastIndexOf('useEffect(', awaitIdx);
    expect(effectStart).toBeGreaterThan(-1);
    const thenIdx = SRC.indexOf('.then((result)', awaitIdx);
    expect(thenIdx).toBeGreaterThan(awaitIdx);
    const effectEnd = SRC.indexOf('}, [branchSwitchState.phase', thenIdx);
    expect(effectEnd).toBeGreaterThan(thenIdx);
    const effectBody = SRC.slice(effectStart, effectEnd);
    expect(effectBody).toContain('let cancelled = false');
    expect(effectBody).toContain('cancelled = true');
    expect(effectBody).toMatch(/if \(cancelled\) return;/);
  });

  test('on Switch → awaitBranchSwitched ok: bridge.project.open re-called with pendingDeepLinkDoc AND pendingBranch (warm-focus)', () => {
    const awaitIdx = SRC.indexOf('awaitBranchSwitched(');
    expect(awaitIdx).toBeGreaterThan(-1);
    const completeIdx = SRC.indexOf("'branch-switch-complete'", awaitIdx);
    expect(completeIdx).toBeGreaterThan(awaitIdx);
    const timeoutIdx = SRC.indexOf("'branch-switch-timeout'", awaitIdx);
    expect(timeoutIdx).toBeGreaterThan(completeIdx);
    const okBranchBody = SRC.slice(completeIdx, timeoutIdx);
    expect(okBranchBody).toMatch(/bridge\.project[\s\n.]+open\(/);
    expect(okBranchBody).toContain('pendingDeepLinkTarget');
    expect(okBranchBody).toContain('pendingBranch');
  });

  test('branchless shares short-circuit the await gate (no 30s timeout sit)', () => {
    const idx = SRC.indexOf('awaitBranchSwitchedStartedRef.current = true');
    expect(idx).toBeGreaterThan(-1);
    const window_ = SRC.slice(Math.max(0, idx - 600), idx + 200);
    expect(window_).toMatch(/!shareBranch|shareBranch === ''|shareBranch\.length === 0/);
  });
});

describe('ShareBranchSwitchDialog — open-current (OQ2 sibling) + cancel', () => {
  test('Open-on-current dispatches bridge.project.open (warm-focus) without pendingBranch', () => {
    const idx = SRC.indexOf('function handleOpenCurrent');
    expect(idx).toBeGreaterThan(-1);
    const endIdx = SRC.indexOf('function handlePivot', idx);
    expect(endIdx).toBeGreaterThan(idx);
    const body = SRC.slice(idx, endIdx);
    expect(body).toMatch(/bridge\.project[\s\n.]+open\(/);
    expect(body).toContain('pendingDeepLinkTarget');
    expect(body).not.toContain('pendingBranch');
  });

  test('Cancel handler dismisses the store and does NOT close the editor window (OQ2)', () => {
    const idx = SRC.indexOf('function handleCancel');
    expect(idx).toBeGreaterThan(-1);
    const endIdx = SRC.indexOf('const variant =', idx);
    expect(endIdx).toBeGreaterThan(idx);
    const body = SRC.slice(idx, endIdx);
    expect(body).toContain('store.dismiss()');
    expect(body).not.toMatch(/window\.close\(/);
    expect(body).not.toContain('bridge.window.close');
    expect(body).not.toMatch(/bridge\.project[\s\n.]+close\(/);
  });

  test('logs branch_dialog_action for each user-visible outcome', () => {
    expect(SRC).toContain("branch_dialog_action: 'switch'");
    expect(SRC).toContain("branch_dialog_action: 'open-current'");
    expect(SRC).toContain("branch_dialog_action: 'cancel'");
    expect(SRC).toContain("branch_dialog_action: 'branch-switch-complete'");
    expect(SRC).toContain("branch_dialog_action: 'branch-switch-timeout'");
  });
});

describe('ShareBranchSwitchDialog — UI primitives + a11y', () => {
  test('uses shadcn Button for action buttons (no raw <button>)', () => {
    expect(SRC).toContain('<Button');
    expect(SRC).not.toMatch(/<button\b/);
  });

  test('Switch button carries aria-describedby pointing at the conflict file list', () => {
    expect(SRC).toContain('aria-describedby');
    expect(SRC).toContain('share-receive-branch-conflict-files');
  });

  test('renders dedicated data-testids for downstream e2e selection', () => {
    expect(SRC).toContain('data-testid="share-branch-switch-dialog"');
    expect(SRC).toContain('data-testid="share-branch-switch-switch"');
    expect(SRC).toContain('data-testid="share-branch-switch-cancel"');
    expect(SRC).toContain('data-testid="share-branch-switch-open-current"');
  });

  test('Dialog guards onInteractOutside and onPointerDownOutside (focus-loss dismiss)', () => {
    const idx = SRC.indexOf('share-branch-switch-dialog');
    expect(idx).toBeGreaterThan(-1);
    const dialogContentStart = SRC.lastIndexOf('<DialogContent', idx);
    const dialogContentEnd = SRC.indexOf('<DialogHeader', idx);
    expect(dialogContentStart).toBeGreaterThan(-1);
    expect(dialogContentEnd).toBeGreaterThan(dialogContentStart);
    const props = SRC.slice(dialogContentStart, dialogContentEnd);
    expect(props).toContain('onInteractOutside');
    expect(props).toContain('onPointerDownOutside');
  });

  test('no React Compiler escape hatches', () => {
    expect(SRC).not.toMatch(/\bforwardRef\b/);
    expect(SRC).not.toMatch(/\bmemo\(/);
    expect(SRC).not.toMatch(/\buseCallback\b/);
    expect(SRC).not.toMatch(/\buseMemo\b/);
  });

  test('no inline style props (Tailwind only)', () => {
    expect(SRC).not.toMatch(/style=\{\{/);
  });

  test('no try/finally (React Compiler BuildHIR rejects them)', () => {
    expect(SRC).not.toMatch(/\}\s*finally\s*\{/);
  });

  test('per-payload reset useEffect tracks [payload]', () => {
    expect(SRC).toMatch(
      /setBranchSwitchState\(initialBranchSwitchState\);\s*branchInfoStartedRef\.current = false;\s*awaitBranchSwitchedStartedRef\.current = false;\s*\},\s*\[payload\]\);/,
    );
  });
});
