import { timingSafeEqual } from "crypto";

/**
 * Shared-secret access for the /discovery questionnaire portal.
 *
 * The portal is public in proxy.ts (no Clerk session — the marketing team
 * doesn't have app logins), so every page render and API call instead
 * checks an access key against DISCOVERY_ACCESS_KEY. The key travels in
 * the link the team receives (?k=...) and is forwarded by the form as an
 * x-discovery-key header on API calls.
 *
 * If DISCOVERY_ACCESS_KEY is unset, all access is denied — there is no
 * built-in fallback key.
 */
export function isValidDiscoveryKey(key: string | null | undefined): boolean {
  const expected = process.env.DISCOVERY_ACCESS_KEY?.trim();
  if (!expected || !key) return false;
  const a = Buffer.from(key);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Pull the access key from an API request: header first, then ?k= (for plain-link GETs like export). */
export function discoveryKeyFromRequest(request: Request): string | null {
  const header = request.headers.get("x-discovery-key");
  if (header) return header;
  return new URL(request.url).searchParams.get("k");
}
