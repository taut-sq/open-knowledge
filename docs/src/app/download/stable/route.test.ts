import { describe, expect, mock, test } from 'bun:test';
import { STABLE_DMG_URL } from '../../../lib/download-links.ts';

type CaptureOpts = {
  event: string;
  distinctId: string;
  properties?: Record<string, string | undefined>;
};

let _lastCapture: CaptureOpts | null = null;
mock.module('../../../lib/track.ts', () => ({
  captureServerEvent: (opts: CaptureOpts) => {
    _lastCapture = opts;
  },
  resolveDistinctId: () => 'visitor-1',
  referrerHostname: () => 'news.ycombinator.com',
}));

const { GET } = await import('./route.ts');

describe('GET /download/stable', () => {
  test('302 to the stable DMG URL, uncached, and fires dmg_downloaded', () => {
    _lastCapture = null;
    const res = GET(new Request('https://openknowledge.ai/download/stable'));
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe(STABLE_DMG_URL);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(_lastCapture?.event).toBe('dmg_downloaded');
    expect(_lastCapture?.distinctId).toBe('visitor-1');
    expect(_lastCapture?.properties?.channel).toBe('stable');
    expect(_lastCapture?.properties?.referrer).toBe('news.ycombinator.com');
  });
});
