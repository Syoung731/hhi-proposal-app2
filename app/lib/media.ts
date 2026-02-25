/**
 * Hostnames allowlisted for next/image. Must stay in sync with next.config.ts
 * images.remotePatterns (and images.domains if used).
 */
const ALLOWED_IMAGE_HOSTS = [
  "pub-2d4238639a274f32ba8641274e00f39c.r2.dev",
  "media.hhi-builders.com",
];

/**
 * Returns true if the URL should not be used for next/image or <img> (empty, null,
 * or known placeholder image hosts). Use this to show a "No image" skeleton instead.
 */
export function isBadPlaceholderUrl(url?: string | null): boolean {
  if (url == null || url.trim() === "") return true;
  const lower = url.toLowerCase();
  return (
    lower.includes("placehold.co") ||
    lower.includes("via.placeholder.com") ||
    lower.includes("dummyimage.com")
  );
}

/**
 * Returns true if the URL is safe to pass to next/image: not blank, not a
 * placeholder, and if remote the hostname is allowlisted in next.config.
 * Use with isBadPlaceholderUrl and isLegacyBlobUrl: only use <Image> when
 * !isBadPlaceholderUrl(url) && !isLegacyBlobUrl(url) && isAllowedHostForNextImage(url).
 */
export function isAllowedHostForNextImage(url: string): boolean {
  const t = url.trim();
  if (!t) return false;
  try {
    if (t.startsWith("/")) return true;
    if (t.startsWith("blob:")) return false;
    const u = new URL(t);
    const host = u.hostname.toLowerCase();
    return ALLOWED_IMAGE_HOSTS.some((h) => h === host || host.endsWith("." + h));
  } catch {
    return false;
  }
}
