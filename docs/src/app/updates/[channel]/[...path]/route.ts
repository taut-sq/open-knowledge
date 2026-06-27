import { createBetaResolver } from '@/lib/download-links';
import { captureServerEvent, resolveDistinctId } from '@/lib/track';

export const dynamic = 'force-dynamic';

const RELEASES_BASE = 'https://github.com/inkeep/open-knowledge/releases';
const VALID_CHANNELS = new Set(['stable', 'beta']);
const SAFE_FILENAME = /^[A-Za-z0-9._-]+$/;
const ARTIFACT_VERSION =
  /-(\d+\.\d+\.\d+(?:-[0-9A-Za-z.]+)?)-(?:arm64|x64|universal)-mac\.zip(?:\.blockmap)?$/;
const BETA_TAG_FROM_URL = /\/releases\/download\/([^/]+)\//;
const FROM_VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.]+)?$/;

const resolveBeta = createBetaResolver();

type ArtifactType = 'manifest' | 'zip' | 'blockmap' | 'dmg' | 'other';

function classify(filename: string): ArtifactType {
  if (filename.endsWith('-mac.yml')) return 'manifest';
  if (filename.endsWith('.blockmap')) return 'blockmap';
  if (filename.endsWith('.zip')) return 'zip';
  if (filename.endsWith('.dmg')) return 'dmg';
  return 'other';
}

function redirect302(location: string): Response {
  return new Response(null, { status: 302, headers: { location, 'cache-control': 'no-store' } });
}

function errorResponse(status: number): Response {
  return new Response(null, { status, headers: { 'cache-control': 'no-store' } });
}

async function latestBetaTag(): Promise<string | null> {
  const redirect = await resolveBeta();
  if (redirect.kind === 'stale-lkg') {
    console.warn(
      `[updates/beta] serving stale LKG tag after refresh failure: ${redirect.refreshError}`,
    );
  }
  if (redirect.kind === 'fallback') return null;
  return BETA_TAG_FROM_URL.exec(redirect.url)?.[1] ?? null;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ channel: string; path: string[] }> },
): Promise<Response> {
  const { channel, path } = await params;
  if (!VALID_CHANNELS.has(channel)) return errorResponse(404);

  const filename = path.join('/');
  if (!SAFE_FILENAME.test(filename)) return errorResponse(404);

  const type = classify(filename);
  if (type === 'other') return errorResponse(404);

  const version = ARTIFACT_VERSION.exec(filename)?.[1];

  let target: string;
  if (version) {
    target = `${RELEASES_BASE}/download/v${version}/${filename}`;
  } else if (channel === 'stable') {
    target = `${RELEASES_BASE}/latest/download/${filename}`;
  } else {
    const tag = await latestBetaTag();
    if (!tag) {
      return errorResponse(503);
    }
    target = `${RELEASES_BASE}/download/${tag}/${filename}`;
  }

  if (type === 'zip' && version) {
    const rawFrom = request.headers.get('x-ok-from-version');
    captureServerEvent({
      event: 'app_update_downloaded',
      distinctId: resolveDistinctId(request),
      properties: {
        channel,
        artifact_type: 'zip',
        to_version: version,
        from_version: rawFrom && FROM_VERSION.test(rawFrom) ? rawFrom : undefined,
      },
    });
  }

  return redirect302(target);
}
