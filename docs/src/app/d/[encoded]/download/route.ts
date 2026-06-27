import { NextResponse } from 'next/server';
import { buildPendingShareCookie } from '@/lib/deferred-share';
import { buildSplashViewModel, SPLASH_DOWNLOAD_URL } from '@/lib/share-splash';
import { captureServerEvent, resolveDistinctId } from '@/lib/track';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ encoded: string }> },
): Promise<NextResponse> {
  const { encoded } = await params;
  const response = NextResponse.redirect(SPLASH_DOWNLOAD_URL, 302);

  const view = buildSplashViewModel(encoded);
  if (view.kind === 'ok') {
    response.cookies.set(buildPendingShareCookie(encoded));
  }

  captureServerEvent({
    event: 'dmg_downloaded',
    distinctId: resolveDistinctId(request),
    properties: { channel: 'stable', source: 'share-splash' },
  });

  return response;
}
