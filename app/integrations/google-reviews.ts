"use server";

import {
  getIntegrationByProvider,
  getDecryptedIntegrationSecret,
  upsertIntegration,
  updateIntegrationTestStatus,
} from "@/app/lib/integrations/service";

const PROVIDER = "google-reviews";
const INTEGRATION_NAME = "Google Reviews";

export type GoogleReviewsIntegration = {
  id: string;
  name: string;
  isEnabled: boolean;
  lastTestedAt: Date | null;
  lastStatus: string | null;
  lastMessage: string | null;
  hasApiKey: boolean;
  placeId: string | null;
};

function toGoogleReviewsIntegration(integration: {
  id: string;
  name: string;
  isActive: boolean;
  lastTestedAt: Date | null;
  lastStatus: string | null;
  lastMessage: string | null;
  encryptedSecret: string | null;
  metaJson: unknown;
}): GoogleReviewsIntegration {
  const meta = (integration.metaJson ?? {}) as Record<string, unknown>;
  return {
    id: integration.id,
    name: integration.name,
    isEnabled: integration.isActive,
    lastTestedAt: integration.lastTestedAt,
    lastStatus: integration.lastStatus,
    lastMessage: integration.lastMessage,
    hasApiKey: !!integration.encryptedSecret,
    placeId: typeof meta.placeId === "string" ? meta.placeId : null,
  };
}

/** Get or create the Google Reviews integration record. */
export async function getOrCreateGoogleReviewsIntegration(): Promise<GoogleReviewsIntegration> {
  let integration = await getIntegrationByProvider(PROVIDER);
  if (integration) return toGoogleReviewsIntegration(integration);

  integration = await upsertIntegration({
    provider: PROVIDER,
    name: INTEGRATION_NAME,
    isActive: true,
  });
  return toGoogleReviewsIntegration(integration);
}

/** Save API key and Place ID. */
export async function saveGoogleReviewsCredentials(
  apiKey: string,
  placeId: string
): Promise<GoogleReviewsIntegration> {
  const trimmedKey = apiKey.trim();
  const trimmedPlace = placeId.trim();
  if (!trimmedKey) throw new Error("API key is required.");
  if (!trimmedPlace) throw new Error("Place ID is required.");

  const integration = await upsertIntegration({
    provider: PROVIDER,
    name: INTEGRATION_NAME,
    grantKey: trimmedKey,
    metaJson: { placeId: trimmedPlace },
    isActive: true,
  });
  return toGoogleReviewsIntegration(integration);
}

/** Get API key (server-only). */
export async function getGoogleReviewsApiKey(): Promise<string | null> {
  return getDecryptedIntegrationSecret(PROVIDER);
}

/** Get Place ID from metaJson. */
export async function getGoogleReviewsPlaceId(): Promise<string | null> {
  const integration = await getIntegrationByProvider(PROVIDER);
  if (!integration?.metaJson) return null;
  const meta = integration.metaJson as Record<string, unknown>;
  return typeof meta.placeId === "string" ? meta.placeId : null;
}

/** Test the Google Reviews connection by fetching place details. */
export async function testGoogleReviewsConnection(): Promise<{
  ok: boolean;
  error?: string;
}> {
  const apiKey = await getGoogleReviewsApiKey();
  const placeId = await getGoogleReviewsPlaceId();

  if (!apiKey) {
    await updateIntegrationTestStatus(PROVIDER, "error", "No API key configured");
    return { ok: false, error: "No API key configured" };
  }
  if (!placeId) {
    await updateIntegrationTestStatus(PROVIDER, "error", "No Place ID configured");
    return { ok: false, error: "No Place ID configured" };
  }

  try {
    const url = `https://places.googleapis.com/v1/places/${placeId}?fields=displayName,rating,userRatingCount&key=${apiKey}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    const data = await res.json();

    if (data.error) {
      const message = data.error.message || `API error: ${data.error.status}`;
      await updateIntegrationTestStatus(PROVIDER, "error", message);
      return { ok: false, error: message };
    }

    if (data.displayName) {
      const msg = `Connected: ${data.displayName.text} (${data.rating ?? "?"}\u2605, ${data.userRatingCount ?? 0} reviews)`;
      await updateIntegrationTestStatus(PROVIDER, "success", msg);
      return { ok: true };
    }

    await updateIntegrationTestStatus(PROVIDER, "error", "Unexpected response");
    return { ok: false, error: "Unexpected response from Google Places API" };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Connection failed";
    await updateIntegrationTestStatus(PROVIDER, "error", message);
    return { ok: false, error: message };
  }
}
