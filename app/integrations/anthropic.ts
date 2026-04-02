"use server";

import {
  getIntegrationByProvider,
  getDecryptedIntegrationSecret,
  upsertIntegration,
  updateIntegrationTestStatus,
} from "@/app/lib/integrations/service";
import Anthropic from "@anthropic-ai/sdk";

const PROVIDER_ANTHROPIC = "anthropic";
const INTEGRATION_NAME = "Anthropic (Claude AI)";

export type AnthropicIntegration = {
  id: string;
  name: string;
  isEnabled: boolean;
  lastTestedAt: Date | null;
  lastStatus: string | null;
  lastMessage: string | null;
  hasApiKey: boolean;
};

function toAnthropicIntegration(integration: {
  id: string;
  name: string;
  isActive: boolean;
  lastTestedAt: Date | null;
  lastStatus: string | null;
  lastMessage: string | null;
  encryptedSecret: string | null;
}): AnthropicIntegration {
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

/** Get or create the Anthropic integration record. */
export async function getOrCreateAnthropicIntegration(): Promise<AnthropicIntegration> {
  let integration = await getIntegrationByProvider(PROVIDER_ANTHROPIC);
  if (integration) return toAnthropicIntegration(integration);

  integration = await upsertIntegration({
    provider: PROVIDER_ANTHROPIC,
    name: INTEGRATION_NAME,
    isActive: true,
  });
  return toAnthropicIntegration(integration);
}

/** Save (or update) the Anthropic API key. */
export async function saveAnthropicApiKey(apiKey: string): Promise<AnthropicIntegration> {
  const trimmed = apiKey.trim();
  if (!trimmed) throw new Error("API key is required.");

  const integration = await upsertIntegration({
    provider: PROVIDER_ANTHROPIC,
    name: INTEGRATION_NAME,
    grantKey: trimmed,
    isActive: true,
  });
  return toAnthropicIntegration(integration);
}

/**
 * Get the Anthropic API key: DB first, then env var fallback.
 * Server-only — never expose to client.
 */
export async function getAnthropicApiKey(): Promise<string | null> {
  const dbKey = await getDecryptedIntegrationSecret(PROVIDER_ANTHROPIC);
  if (dbKey?.trim()) return dbKey.trim();
  return process.env.ANTHROPIC_API_KEY?.trim() || null;
}

/** Test the Anthropic API key and update status. */
export async function testAnthropicConnection(): Promise<{
  ok: boolean;
  model?: string;
  error?: string;
}> {
  const apiKey = await getAnthropicApiKey();
  if (!apiKey) {
    await updateIntegrationTestStatus(PROVIDER_ANTHROPIC, "error", "No API key configured");
    return { ok: false, error: "No API key configured" };
  }

  try {
    const anthropic = new Anthropic({ apiKey });
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 16,
      messages: [{ role: "user", content: "Reply with only the word: OK" }],
    });

    await updateIntegrationTestStatus(PROVIDER_ANTHROPIC, "success", `Model: ${response.model}`);
    return { ok: true, model: response.model };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Connection failed";
    await updateIntegrationTestStatus(PROVIDER_ANTHROPIC, "error", message);
    return { ok: false, error: message };
  }
}

