
import { describe, expect, test } from 'bun:test';
import { shouldShowAutoSyncOnboarding } from './auto-sync-onboarding-gate';

describe('EditorPane module', () => {
  test('exports the EditorPane component', async () => {
    const mod = await import('./EditorPane');
    expect(typeof mod.EditorPane).toBe('function');
  });
});

describe('shouldShowAutoSyncOnboarding — truth table', () => {
  const baseShow = {
    autoSyncOnboardingDismissed: false,
    hasRemote: true,
    projectLocalSynced: true,
    projectLocalConfig: { autoSync: { enabled: null as boolean | null } },
    pushPermissionCheckStatus: 'allowed' as 'allowed' | 'denied' | 'unknown' | undefined,
  };

  test('shows the dialog when all six inputs align', () => {
    expect(shouldShowAutoSyncOnboarding(baseShow)).toBe(true);
  });

  test('hides when dismissed', () => {
    expect(shouldShowAutoSyncOnboarding({ ...baseShow, autoSyncOnboardingDismissed: true })).toBe(
      false,
    );
  });

  test('hides when there is no git remote', () => {
    expect(shouldShowAutoSyncOnboarding({ ...baseShow, hasRemote: false })).toBe(false);
    expect(shouldShowAutoSyncOnboarding({ ...baseShow, hasRemote: undefined })).toBe(false);
  });

  test('hides during the cold-start window (flash-free guard)', () => {
    expect(shouldShowAutoSyncOnboarding({ ...baseShow, projectLocalSynced: false })).toBe(false);
    expect(shouldShowAutoSyncOnboarding({ ...baseShow, projectLocalSynced: undefined })).toBe(
      false,
    );
  });

  test('hides when the local config binding has not yet hydrated (null)', () => {
    expect(shouldShowAutoSyncOnboarding({ ...baseShow, projectLocalConfig: null })).toBe(false);
  });

  test('hides once the user has answered the prompt (enabled !== null)', () => {
    expect(
      shouldShowAutoSyncOnboarding({
        ...baseShow,
        projectLocalConfig: { autoSync: { enabled: true } },
      }),
    ).toBe(false);
    expect(
      shouldShowAutoSyncOnboarding({
        ...baseShow,
        projectLocalConfig: { autoSync: { enabled: false } },
      }),
    ).toBe(false);
  });

  test('hides when the push-permission probe returns denied', () => {
    expect(shouldShowAutoSyncOnboarding({ ...baseShow, pushPermissionCheckStatus: 'denied' })).toBe(
      false,
    );
  });

  test('hides while the probe is still pending (undefined) — no flash-then-close', () => {
    expect(
      shouldShowAutoSyncOnboarding({ ...baseShow, pushPermissionCheckStatus: undefined }),
    ).toBe(false);
  });

  test('SHOWS when probe resolved allowed OR unknown (graceful degradation)', () => {
    expect(
      shouldShowAutoSyncOnboarding({ ...baseShow, pushPermissionCheckStatus: 'allowed' }),
    ).toBe(true);
    expect(
      shouldShowAutoSyncOnboarding({ ...baseShow, pushPermissionCheckStatus: 'unknown' }),
    ).toBe(true);
  });
});
