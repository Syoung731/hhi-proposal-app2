import { prisma } from "@/app/lib/prisma";
import Anthropic from "@anthropic-ai/sdk";
import { getAnthropicApiKey } from "@/app/integrations/anthropic";

/** Fallback model when no selection is saved in CompanySettings. */
export const DEFAULT_CLAUDE_MODEL = "claude-sonnet-4-6";

/** Model to fall back to when the primary model is overloaded. */
export const FALLBACK_CLAUDE_MODEL = "claude-sonnet-4-6";

/**
 * Get the Claude model configured in Settings > Integrations.
 * Falls back to DEFAULT_CLAUDE_MODEL if not set.
 * See https://platform.claude.com/docs/en/about-claude/models/overview
 */
export async function getClaudeModel(): Promise<string> {
  try {
    const settings = await prisma.companySettings.findFirst({
      select: { anthropicModel: true },
    });
    return settings?.anthropicModel?.trim() || DEFAULT_CLAUDE_MODEL;
  } catch {
    return DEFAULT_CLAUDE_MODEL;
  }
}

type ClaudeCallParams = Omit<Anthropic.MessageCreateParamsNonStreaming, "model">;
type ClaudeStreamParams = Omit<Anthropic.MessageCreateParamsStreaming, "model" | "stream">;

/**
 * Call Claude with automatic model fallback.
 *
 * 1. Tries the user-selected model up to 3 times (SDK handles retry backoff)
 * 2. If still overloaded, falls back to Sonnet 4.6 with 2 retries
 *
 * Use this instead of creating Anthropic clients directly.
 */
export async function callClaude(params: ClaudeCallParams): Promise<Anthropic.Message> {
  const apiKey = await getAnthropicApiKey();
  if (!apiKey) throw new Error("Anthropic API key not configured — add it in Settings > Integrations");

  const primaryModel = await getClaudeModel();

  // Try primary model with 3 retries
  try {
    const anthropic = new Anthropic({ apiKey, maxRetries: 3 });
    return await anthropic.messages.create({ ...params, model: primaryModel });
  } catch (err) {
    if (!isOverloadedError(err) || primaryModel === FALLBACK_CLAUDE_MODEL) throw err;

    // eslint-disable-next-line no-console
    console.warn(`[callClaude] ${primaryModel} overloaded after 3 retries — falling back to ${FALLBACK_CLAUDE_MODEL}`);

    // Fall back to Sonnet with 2 retries
    const anthropic = new Anthropic({ apiKey, maxRetries: 2 });
    return await anthropic.messages.create({ ...params, model: FALLBACK_CLAUDE_MODEL });
  }
}

/**
 * Stream Claude with automatic model fallback.
 * Same retry/fallback logic as callClaude but returns a stream that
 * resolves to the final message via .finalMessage().
 */
export async function streamClaude(params: ClaudeStreamParams): Promise<Anthropic.Message> {
  const apiKey = await getAnthropicApiKey();
  if (!apiKey) throw new Error("Anthropic API key not configured — add it in Settings > Integrations");

  const primaryModel = await getClaudeModel();

  // Try primary model with 3 retries
  try {
    const anthropic = new Anthropic({ apiKey, maxRetries: 3 });
    const stream = anthropic.messages.stream({ ...params, model: primaryModel });
    return await stream.finalMessage();
  } catch (err) {
    if (!isOverloadedError(err) || primaryModel === FALLBACK_CLAUDE_MODEL) throw err;

    // eslint-disable-next-line no-console
    console.warn(`[streamClaude] ${primaryModel} overloaded after 3 retries — falling back to ${FALLBACK_CLAUDE_MODEL}`);

    // Fall back to Sonnet with 2 retries
    const anthropic = new Anthropic({ apiKey, maxRetries: 2 });
    const stream = anthropic.messages.stream({ ...params, model: FALLBACK_CLAUDE_MODEL });
    return await stream.finalMessage();
  }
}

function isOverloadedError(err: unknown): boolean {
  if (err instanceof Anthropic.APIError) {
    return err.status === 529 || err.error?.type === "overloaded_error";
  }
  if (err instanceof Error && err.message?.includes("Overloaded")) return true;
  return false;
}

/**
 * @deprecated Use callClaude() or streamClaude() instead for automatic model fallback.
 */
export const CLAUDE_MODEL = DEFAULT_CLAUDE_MODEL;
