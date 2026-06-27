import { STABLE_DMG_URL } from '@/lib/download-links';
import { captureServerEvent, referrerHostname, resolveDistinctId } from '@/lib/track';

export const dynamic = 'force-dynamic';

export function GET(request: Request): Response {
  captureServerEvent({
    event: 'dmg_downloaded',
    distinctId: resolveDistinctId(request),
    properties: { channel: 'stable', referrer: referrerHostname(request) },
  });
  return new Response(null, {
    status: 302,
    headers: {
      location: STABLE_DMG_URL,
      'cache-control': 'no-store',
    },
  });
}
