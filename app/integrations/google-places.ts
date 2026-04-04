"use server";

import {
  getIntegrationByProvider,
  getDecryptedIntegrationSecret,
  upsertIntegration,
  updateIntegrationTestStatus,
} from "@/app/lib/integrations/service";

const PROVIDER = "google-places";
const INTEGRATION_NAME = "Google Places";

export type GooglePlacesIntegration = {
  id: string;
  name: string;
  isEnabled: boolean;
  lastTestedAt: Date | null;
  lastStatus: string | null;
  lastMessage: string | null;
  hasApiKey: boolean;
};

function toGooglePlacesIntegration(integration: {
  id: string;
  name: string;
  isActive: boolean;
  lastTestedAt: Date | null;
  lastStatus: string | null;
  lastMessage: string | null;
  encryptedSecret: string | null;
}): GooglePlacesIntegration {
  return {
    id: integration.id,
    name: integration.name,
    isEnabled: integration.isActive,
    lastTestedAt: integration.lastTestedAt,
    lastStatus: integration.lastStatus,
    lastMessage: integration.lastMessage,
    hasApiKey: !!integration.encryptedSecret,
  };
}

/** Get or create the Google Places integration record. */
export async function getOrCreateGooglePlacesIntegration(): Promise<GooglePlacesIntegration> {
  let integration = await getIntegrationByProvider(PROVIDER);
  if (integration) return toGooglePlacesIntegration(integration);

  integration = await upsertIntegration({
    provider: PROVIDER,
    name: INTEGRATION_NAME,
    isActive: true,
  });
  return toGooglePlacesIntegration(integration);
}

/** Save (or update) the Google Places API key. */
export async function saveGooglePlacesApiKey(apiKey: string): Promise<GooglePlacesIntegration> {
  const trimmed = apiKey.trim();
  if (!trimmed) throw new Error("API key is required.");

  const integration = await upsertIntegration({
    provider: PROVIDER,
    name: INTEGRATION_NAME,
    grantKey: trimmed,
    isActive: true,
  });
  return toGooglePlacesIntegration(integration);
}

/**
 * Get the Google Places API key: DB first, then env var fallback.
 * Note: This key is intentionally exposed to the client (loaded in a script tag).
 * It should be restricted by HTTP referrer in the Google Cloud Console.
 */
export async function getGooglePlacesApiKey(): Promise<string | null> {
  const dbKey = await getDecryptedIntegrationSecret(PROVIDER);
  if (dbKey?.trim()) return dbKey.trim();
  return process.env.NEXT_PUBLIC_GOOGLE_PLACES_API_KEY?.trim() || null;
}

/** Test the Google Places API key by making a simple autocomplete request. */
export async function testGooglePlacesConnection(): Promise<{
  ok: boolean;
  error?: string;
}> {
  const apiKey = await getGooglePlacesApiKey();
  if (!apiKey) {
    await updateIntegrationTestStatus(PROVIDER, "error", "No API key configured");
    return { ok: false, error: "No API key configured" };
  }

  try {
    // Use the Places Autocomplete (New) API to test the key
    const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=Hilton+Head&types=address&components=country:us&key=${apiKey}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    const data = await res.json();

    if (data.status === "OK" || data.status === "ZERO_RESULTS") {
      await updateIntegrationTestStatus(PROVIDER, "success", "Places API responding");
      return { ok: true };
    }
    const message = data.error_message || `API status: ${data.status}`;
    await updateIntegrationTestStatus(PROVIDER, "error", message);
    return { ok: false, error: message };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Connection failed";
    await updateIntegrationTestStatus(PROVIDER, "error", message);
    return { ok: false, error: message };
  }
}
