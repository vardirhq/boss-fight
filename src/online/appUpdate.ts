/** Injected by Vite from package.json; see the `define` block in vite.config.ts. */
declare const __APP_VERSION__: string;

export const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0';

export interface AvailableUpdate {
  version: string;
  releaseUrl: string;
  downloadUrl: string | null;
}

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

/**
 * The update to offer, or null when the install is current.
 *
 * A release is only offered when it is strictly newer *and* carries a downloadable
 * package. Announcing a release with nothing to install would send the user to a
 * dead end.
 */
export function availableUpdate(meta: unknown, installed = APP_VERSION): AvailableUpdate | null {
  if (!meta || typeof meta !== 'object') return null;
  const latest = (meta as { latest?: unknown }).latest;
  if (!latest || typeof latest !== 'object') return null;
  const release = latest as Record<string, unknown>;
  const version = typeof release.version === 'string' ? release.version : '';
  if (!/^\d+(\.\d+)*$/.test(version) || compareVersions(version, installed) <= 0) return null;
  const releaseUrl = typeof release.releaseUrl === 'string' ? release.releaseUrl : '';
  const downloadUrl = typeof release.downloadUrl === 'string' ? release.downloadUrl : null;
  if (!releaseUrl.startsWith('https://github.com/')) return null;
  return {
    version,
    releaseUrl,
    downloadUrl: downloadUrl?.startsWith('https://github.com/') ? downloadUrl : null,
  };
}

const CHECK_KEY = 'boss-kamp-update-check-v1';
const DISMISSED_KEY = 'boss-kamp-update-dismissed-v1';
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

/**
 * Whether to ask the API for the latest release.
 *
 * Distribution is a signed APK on a GitHub release, so an install has no other way to
 * learn it is out of date. The check is throttled to once a day and carries no
 * identifier, keeping a local-only household to one first-party request per day.
 */
export function shouldCheckForUpdate(now = Date.now()): boolean {
  try {
    const last = Number(localStorage.getItem(CHECK_KEY) ?? 0);
    return !Number.isFinite(last) || now - last >= CHECK_INTERVAL_MS;
  } catch {
    return false;
  }
}

export function recordUpdateCheck(now = Date.now()) {
  try { localStorage.setItem(CHECK_KEY, String(now)); } catch { /* Retry next launch. */ }
}

/** Dismissal is per version, so the next release announces itself again. */
export function dismissUpdate(version: string) {
  try { localStorage.setItem(DISMISSED_KEY, version); } catch { /* Shown again next launch. */ }
}

export function updateDismissed(version: string): boolean {
  try { return localStorage.getItem(DISMISSED_KEY) === version; } catch { return false; }
}
