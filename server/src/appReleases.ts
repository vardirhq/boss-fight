/**
 * Latest-release metadata for the installed Android app.
 *
 * Boss Kamp is distributed as a signed APK attached to a GitHub release, so nothing
 * tells an installed copy that a newer build exists. The app asks this API instead of
 * asking GitHub directly: the client's content security policy admits only its own
 * origin, and a family app should not be making third-party requests from a child's
 * device just to discover a version number.
 *
 * The result is cached because the upstream endpoint is unauthenticated and rate
 * limited per address, and because every install polls this route.
 */
const RELEASES_ENDPOINT = 'https://api.github.com/repos/vardirhq/boss-fight/releases/latest';
const CACHE_MS = 30 * 60 * 1000;
const FETCH_TIMEOUT_MS = 5_000;

export interface AppRelease {
  version: string;
  releaseUrl: string;
  downloadUrl: string | null;
  publishedAt: string | null;
}

type CacheEntry = { at: number; release: AppRelease | null };
let cache: CacheEntry | null = null;

/** Numeric semver-style comparison. Returns >0 when `left` is the newer version. */
export function compareVersions(left: string, right: string) {
  const parts = (value: string) => value.trim().replace(/^v/i, '').split('.')
    .map((part) => Number.parseInt(part, 10))
    .map((part) => (Number.isFinite(part) ? part : 0));
  const a = parts(left);
  const b = parts(right);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

export function isNewerVersion(candidate: string, installed: string) {
  return compareVersions(candidate, installed) > 0;
}

/**
 * Reduce a GitHub release payload to the few public fields the app needs. Anything
 * unexpected yields null rather than a partial record, so the app simply shows nothing.
 */
export function projectRelease(payload: unknown): AppRelease | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const release = payload as Record<string, unknown>;
  if (release.draft === true) return null;
  const tag = typeof release.tag_name === 'string' ? release.tag_name.trim() : '';
  const version = tag.replace(/^v/i, '');
  if (!/^\d+(\.\d+)*$/.test(version)) return null;
  const assets = Array.isArray(release.assets) ? release.assets : [];
  const apk = assets
    .filter((asset): asset is Record<string, unknown> => Boolean(asset) && typeof asset === 'object')
    .find((asset) => typeof asset.name === 'string' && asset.name.toLowerCase().endsWith('.apk'));
  const downloadUrl = typeof apk?.browser_download_url === 'string' ? apk.browser_download_url : null;
  return {
    version,
    releaseUrl: typeof release.html_url === 'string'
      ? release.html_url
      : `https://github.com/vardirhq/boss-fight/releases/tag/${tag}`,
    // Only an asset served from GitHub is offered as a download target.
    downloadUrl: downloadUrl && downloadUrl.startsWith('https://github.com/') ? downloadUrl : null,
    publishedAt: typeof release.published_at === 'string' ? release.published_at : null,
  };
}

export function resetReleaseCacheForTest() {
  cache = null;
}

/**
 * The cached latest release, refreshed at most twice an hour.
 *
 * Failure is never propagated: an unreachable or throttled upstream serves the
 * previous answer, or null. Update discovery must not be able to fail the request.
 */
export async function latestRelease(
  now = Date.now(),
  fetchImplementation: typeof fetch = fetch,
): Promise<AppRelease | null> {
  if (cache && now - cache.at < CACHE_MS) return cache.release;
  try {
    const response = await fetchImplementation(RELEASES_ENDPOINT, {
      headers: { accept: 'application/vnd.github+json', 'user-agent': 'boss-kamp-api' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`Release lookup failed (${response.status})`);
    cache = { at: now, release: projectRelease(await response.json()) };
  } catch {
    // Keep serving the previous answer rather than nothing; only record the attempt
    // so a persistently failing upstream is not retried on every request.
    cache = { at: now, release: cache?.release ?? null };
  }
  return cache.release;
}
