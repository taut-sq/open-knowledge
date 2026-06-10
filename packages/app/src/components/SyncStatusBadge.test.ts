
import { describe, expect, test } from 'bun:test';
import { SYNC_ERROR_CODES } from '@inkeep/open-knowledge-core';

describe('SyncStatusBadge module', () => {
  test('exports the SyncStatusBadge component', async () => {
    const mod = await import('./SyncStatusBadge');
    expect(typeof mod.SyncStatusBadge).toBe('function');
  });

  test('exports the helper functions consumed by the settings mirror', async () => {
    const mod = await import('./SyncStatusBadge');
    expect(typeof mod.formatPausedReason).toBe('function');
    expect(typeof mod.formatPushPermissionDenied).toBe('function');
    expect(typeof mod.formatPushFailureCode).toBe('function');
    expect(typeof mod.formatPullFailureCode).toBe('function');
    expect(typeof mod.formatSyncFailureCode).toBe('function');
    expect(typeof mod.computeSyncErrorLines).toBe('function');
    expect(typeof mod.shouldDisableSyncSwitch).toBe('function');
    expect(typeof mod.shouldOfferSignInAgain).toBe('function');
  });
});

describe('shouldDisableSyncSwitch — truth table', () => {
  test('disabled when projectLocalSynced is false (cold start)', async () => {
    const { shouldDisableSyncSwitch } = await import('./SyncStatusBadge');
    expect(shouldDisableSyncSwitch(false, undefined)).toBe(true);
    expect(shouldDisableSyncSwitch(undefined, undefined)).toBe(true);
    expect(shouldDisableSyncSwitch(false, 'allowed')).toBe(true);
  });

  test('disabled when the push-permission probe resolves denied', async () => {
    const { shouldDisableSyncSwitch } = await import('./SyncStatusBadge');
    expect(shouldDisableSyncSwitch(true, 'denied')).toBe(true);
  });

  test('enabled when projectLocalSynced and the probe is allowed', async () => {
    const { shouldDisableSyncSwitch } = await import('./SyncStatusBadge');
    expect(shouldDisableSyncSwitch(true, 'allowed')).toBe(false);
  });

  test('enabled when projectLocalSynced and probe is undefined / unknown (read+write parity invariant)', async () => {
    const { shouldDisableSyncSwitch } = await import('./SyncStatusBadge');
    expect(shouldDisableSyncSwitch(true, undefined)).toBe(false);
    expect(shouldDisableSyncSwitch(true, 'unknown')).toBe(false);
  });
});

describe('formatPushPermissionDenied — branch coverage', () => {
  test('no-collaborator returns the push-permission copy', async () => {
    const { formatPushPermissionDenied } = await import('./SyncStatusBadge');
    expect(formatPushPermissionDenied('no-collaborator')).toBe(
      "You don't have permission to push to this repo",
    );
  });

  test('private-no-access returns the sign-in-with-other-account copy', async () => {
    const { formatPushPermissionDenied } = await import('./SyncStatusBadge');
    expect(formatPushPermissionDenied('private-no-access')).toBe(
      "You don't have access to this private repo. Sign in with an account that does.",
    );
  });

  test('repo-not-found returns the renamed-deleted-moved copy', async () => {
    const { formatPushPermissionDenied } = await import('./SyncStatusBadge');
    expect(formatPushPermissionDenied('repo-not-found')).toBe(
      'Repository not found. It may have been renamed, deleted, or moved.',
    );
  });

  test('undefined defaults to the push-permission copy', async () => {
    const { formatPushPermissionDenied } = await import('./SyncStatusBadge');
    expect(formatPushPermissionDenied(undefined)).toBe(
      "You don't have permission to push to this repo",
    );
  });
});

describe('formatPushFailureCode — code-to-localized-string mapping', () => {
  test('every bounded enum value produces a non-empty string', async () => {
    const { formatPushFailureCode } = await import('./SyncStatusBadge');
    const codes = [
      'auth-403',
      'auth-401',
      'auth-scope-mismatch',
      'semantic-protected-branch',
    ] as const;
    for (const code of codes) {
      const out = formatPushFailureCode(code);
      expect(typeof out).toBe('string');
      expect(out.length).toBeGreaterThan(0);
    }
  });

  test('different codes produce different strings (no accidental collapse)', async () => {
    const { formatPushFailureCode } = await import('./SyncStatusBadge');
    const strings = new Set([
      formatPushFailureCode('auth-403'),
      formatPushFailureCode('auth-401'),
      formatPushFailureCode('auth-scope-mismatch'),
      formatPushFailureCode('semantic-protected-branch'),
    ]);
    expect(strings.size).toBe(4);
  });
});

describe('formatSyncFailureCode — neutral collapsed copy', () => {
  test('every bounded enum value produces a non-empty string', async () => {
    const { formatSyncFailureCode } = await import('./SyncStatusBadge');
    for (const code of SYNC_ERROR_CODES) {
      const out = formatSyncFailureCode(code);
      expect(typeof out).toBe('string');
      expect(out.length).toBeGreaterThan(0);
    }
  });

  test('auth-403 copy is direction-agnostic (not the push-only framing)', async () => {
    const { formatSyncFailureCode, formatPushFailureCode, formatPullFailureCode } = await import(
      './SyncStatusBadge'
    );
    expect(formatSyncFailureCode('auth-403')).not.toBe(formatPushFailureCode('auth-403'));
    expect(formatSyncFailureCode('auth-403')).toBe(formatPullFailureCode('auth-403'));
  });

  test('auth-no-credential copy directs the user to reconnect (all three formatters)', async () => {
    const { formatSyncFailureCode, formatPushFailureCode, formatPullFailureCode } = await import(
      './SyncStatusBadge'
    );
    for (const fmt of [formatSyncFailureCode, formatPushFailureCode, formatPullFailureCode]) {
      expect(fmt('auth-no-credential')).toMatch(/reconnect/i);
    }
  });
});

describe('computeSyncErrorLines — collapse + label truth table', () => {
  test('no errors → no lines', async () => {
    const { computeSyncErrorLines } = await import('./SyncStatusBadge');
    expect(computeSyncErrorLines({})).toEqual([]);
  });

  test('push-only → single unlabeled line with push copy', async () => {
    const { computeSyncErrorLines, formatPushFailureCode } = await import('./SyncStatusBadge');
    const lines = computeSyncErrorLines({ pushErrorCode: 'semantic-protected-branch' });
    expect(lines).toEqual([
      { key: 'push', direction: null, message: formatPushFailureCode('semantic-protected-branch') },
    ]);
  });

  test('pull-only (raw) → single unlabeled line with the raw message', async () => {
    const { computeSyncErrorLines } = await import('./SyncStatusBadge');
    const lines = computeSyncErrorLines({ pullError: 'Sync paused — local changes conflict.' });
    expect(lines).toEqual([
      { key: 'pull', direction: null, message: 'Sync paused — local changes conflict.' },
    ]);
  });

  test('same code on both legs → one collapsed, unlabeled, neutral line', async () => {
    const { computeSyncErrorLines, formatSyncFailureCode } = await import('./SyncStatusBadge');
    const lines = computeSyncErrorLines({ pushErrorCode: 'auth-401', pullErrorCode: 'auth-401' });
    expect(lines).toEqual([
      { key: 'sync', direction: null, message: formatSyncFailureCode('auth-401') },
    ]);
  });

  test('identical raw message on both legs → one collapsed line', async () => {
    const { computeSyncErrorLines } = await import('./SyncStatusBadge');
    const lines = computeSyncErrorLines({
      pushError: 'Network unreachable',
      pullError: 'Network unreachable',
    });
    expect(lines).toEqual([{ key: 'sync', direction: null, message: 'Network unreachable' }]);
  });

  test('different codes → two lines, each labeled with its direction', async () => {
    const { computeSyncErrorLines, formatPushFailureCode, formatPullFailureCode } = await import(
      './SyncStatusBadge'
    );
    const lines = computeSyncErrorLines({
      pushErrorCode: 'semantic-protected-branch',
      pullErrorCode: 'auth-403',
    });
    expect(lines).toEqual([
      {
        key: 'push',
        direction: 'push',
        message: formatPushFailureCode('semantic-protected-branch'),
      },
      { key: 'pull', direction: 'pull', message: formatPullFailureCode('auth-403') },
    ]);
  });

  test('coded push + raw pull → treated as different, both labeled', async () => {
    const { computeSyncErrorLines, formatPushFailureCode } = await import('./SyncStatusBadge');
    const lines = computeSyncErrorLines({
      pushErrorCode: 'auth-401',
      pullError: 'Could not detect conflict files',
    });
    expect(lines).toEqual([
      { key: 'push', direction: 'push', message: formatPushFailureCode('auth-401') },
      { key: 'pull', direction: 'pull', message: 'Could not detect conflict files' },
    ]);
  });
});

describe('formatPausedReason — push-permission case', () => {
  test('maps no-push-permission to the push-permission copy', async () => {
    const { formatPausedReason } = await import('./SyncStatusBadge');
    expect(formatPausedReason('no-push-permission')).toBe(
      "You don't have permission to push to this repo",
    );
  });

  test('falls back to the raw reason for unmapped values', async () => {
    const { formatPausedReason } = await import('./SyncStatusBadge');
    expect(formatPausedReason('totally-unmapped-reason')).toBe('totally-unmapped-reason');
  });
});

describe('shouldOfferSignInAgain — probe-401 truth table', () => {
  test('returns true only on unknown/token-invalid', async () => {
    const { shouldOfferSignInAgain } = await import('./SyncStatusBadge');
    expect(shouldOfferSignInAgain({ checkStatus: 'unknown', unknownError: 'token-invalid' })).toBe(
      true,
    );
  });

  test('returns false on unknown with any other error class', async () => {
    const { shouldOfferSignInAgain } = await import('./SyncStatusBadge');
    expect(shouldOfferSignInAgain({ checkStatus: 'unknown', unknownError: 'network' })).toBe(false);
    expect(shouldOfferSignInAgain({ checkStatus: 'unknown', unknownError: 'timeout' })).toBe(false);
    expect(shouldOfferSignInAgain({ checkStatus: 'unknown', unknownError: 'rate-limit' })).toBe(
      false,
    );
    expect(
      shouldOfferSignInAgain({ checkStatus: 'unknown', unknownError: 'malformed-response' }),
    ).toBe(false);
  });

  test('returns false on unknown without an unknownError field', async () => {
    const { shouldOfferSignInAgain } = await import('./SyncStatusBadge');
    expect(shouldOfferSignInAgain({ checkStatus: 'unknown' })).toBe(false);
  });

  test("returns false on 'denied' — denied has its own affordance, NOT Sign in again", async () => {
    const { shouldOfferSignInAgain } = await import('./SyncStatusBadge');
    expect(shouldOfferSignInAgain({ checkStatus: 'denied', deniedReason: 'no-collaborator' })).toBe(
      false,
    );
  });

  test("returns false on 'allowed' (no payload to misinterpret)", async () => {
    const { shouldOfferSignInAgain } = await import('./SyncStatusBadge');
    expect(shouldOfferSignInAgain({ checkStatus: 'allowed' })).toBe(false);
  });

  test('returns false on undefined push-permission (read+write parity)', async () => {
    const { shouldOfferSignInAgain } = await import('./SyncStatusBadge');
    expect(shouldOfferSignInAgain(undefined)).toBe(false);
  });
});
