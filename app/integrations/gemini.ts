"use server";

import {
  getIntegrationByProvider,
  getDecryptedIntegrationSecret,
  upsertIntegration,
  updateIntegrationTestStatus,
} from "@/app/lib/integrations/service";

const PROVIDER_GEMINI = "gemini";
const INTEGRATION_NAME = "Google Gemini (AI Images)";

export type GeminiIntegration = {
  id: string;
  name: string;
  isEnabled: boolean;
  lastTestedAt: Date | null;
  lastStatus: string | null;
  lastMessage: string | null;
  hasApiKey: boolean;
};

function toGeminiIntegration(integration: {
  id: string;
  name: string;
  isActive: boolean;
  lastTestedAt: Date | null;
  lastStatus: string | null;
  lastMessage: string | null;
  encryptedSecret: string | null;
}): GeminiIntegration {
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

/** Get or create the Gemini integration record. */
export async function getOrCreateGeminiIntegration(): Promise<GeminiIntegration> {
  let integration = await getIntegrationByProvider(PROVIDER_GEMINI);
  if (integration) return toGeminiIntegration(integration);

  integration = await upsertIntegration({
    provider: PROVIDER_GEMINI,
    name: INTEGRATION_NAME,
    isActive: true,
  });
  return toGeminiIntegration(integration);
}

/** Save (or update) the Gemini API key. */
export async function saveGeminiApiKey(apiKey: string): Promise<GeminiIntegration> {
  const trimmed = apiKey.trim();
  if (!trimmed) throw new Error("API key is required.");

  const integration = await upsertIntegration({
    provider: PROVIDER_GEMINI,
    name: INTEGRATION_NAME,
    grantKey: trimmed,
    isActive: true,
  });
  return toGeminiIntegration(integration);
}

/**
 * Get the Gemini API key from the encrypted DB store.
 * Server-only — never expose to client.
 * Configure via Settings > Integrations.
 */
export async function getGeminiApiKey(): Promise<string | null> {
  const dbKey = await getDecryptedIntegrationSecret(PROVIDER_GEMINI);
  return dbKey?.trim() || null;
}

/** Test the Gemini API key by listing models. */
export async function testGeminiConnection(): Promise<{
  ok: boolean;
  model?: string;
  error?: string;
}> {
  const apiKey = await getGeminiApiKey();
  if (!apiKey) {
    await updateIntegrationTestStatus(PROVIDER_GEMINI, "error", "No API key configured");
    return { ok: false, error: "No API key configured" };
  }

  try {
    // Verify the configured models are accessible
    const { getGeminiImageModel, getGeminiImageGenModel } = await import("@/app/lib/ai/gemini-models");
    const imageModel = await getGeminiImageModel();
    const imageGenModel = await getGeminiImageGenModel();

    // Test the image model
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${imageModel}?key=${apiKey}`,
    );
    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: { message: `HTTP ${res.status}` } }));
      throw new Error(data.error?.message || `Cannot access model "${imageModel}"`);
    }
    const modelData = await res.json();
    const displayName = modelData.displayName ?? imageModel;

    const summary = `Image: ${displayName} | Imagen: ${imageGenModel}`;
    await updateIntegrationTestStatus(PROVIDER_GEMINI, "success", summary);
    return { ok: true, model: summary };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Connection failed";
    await updateIntegrationTestStatus(PROVIDER_GEMINI, "error", message);
    return { ok: false, error: message };
  }
}
