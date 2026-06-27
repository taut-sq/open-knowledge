import { createBetaResolver, toRedirectResponse } from '@/lib/download-links';
import { captureServerEvent, referrerHostname, resolveDistinctId } from '@/lib/track';

export const dynamic = 'force-dynamic';

const resolveBetaRedirect = createBetaResolver();

export async function GET(request: Request): Promise<Response> {
  const redirect = await resolveBetaRedirect();
  if (redirect.kind === 'stale-lkg') {
    console.warn(
      `[download/beta] serving stale LKG after refresh failure: ${redirect.refreshError}`,
    );
  }
  if (redirect.kind === 'fallback') {
    console.error(`[download/beta] falling back to releases page: ${redirect.cause}`);
  }
  if (redirect.kind !== 'fallback') {
    captureServerEvent({
      event: 'dmg_downloaded',
      distinctId: resolveDistinctId(request),
      properties: { channel: 'beta', referrer: referrerHostname(request) },
    });
  }
  return toRedirectResponse(redirect);
}
