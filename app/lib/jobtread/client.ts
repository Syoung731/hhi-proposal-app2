/**
 * Server-only JobTread Pave API client.
 * Loads credentials from the Integration table; do not use from the client.
 */
import {
  getIntegrationByProvider,
  getDecryptedIntegrationSecret,
  PROVIDER_JOBTREAD,
} from "@/app/lib/integrations/service";

const DEFAULT_BASE_URL = "https://api.jobtread.com/pave";

/** Thrown when the JobTread integration or secret is not configured. */
export class JobTreadConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JobTreadConfigError";
  }
}

/** Safe context attached to JobTreadApiError for debugging (no secrets). */
export type JobTreadApiErrorContext = {
  step?: string;
  status?: number;
  contentType?: string | null;
  responseSnippet?: string;
};

/** Thrown when the JobTread API returns a non-2xx or malformed response. */
export class JobTreadApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly context?: JobTreadApiErrorContext
  ) {
    super(message);
    this.name = "JobTreadApiError";
  }

  get step(): string | undefined {
    return this.context?.step;
  }

  get contentType(): string | null | undefined {
    return this.context?.contentType;
  }

  get responseSnippet(): string | undefined {
    return this.context?.responseSnippet;
  }
}

const MAX_RESPONSE_SNIPPET_LENGTH = 1000;

/**
 * Transient-failure retry policy. A large budget push fires hundreds of
 * sequential Pave calls, so a single 429 (rate limit) or transient 5xx must not
 * fail the whole push — we retry with exponential backoff, honoring Retry-After.
 */
const MAX_RETRIES = 4;
const BASE_BACKOFF_MS = 500;
const MAX_BACKOFF_MS = 30_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Backoff for retry `attempt` (0-based); honors a numeric Retry-After (seconds). */
function retryDelayMs(attempt: number, retryAfterHeader: string | null): number {
  if (retryAfterHeader) {
    const secs = Number(retryAfterHeader);
    if (Number.isFinite(secs) && secs >= 0) {
      return Math.min(secs * 1000, MAX_BACKOFF_MS);
    }
  }
  return Math.min(BASE_BACKOFF_MS * 2 ** attempt, MAX_BACKOFF_MS);
}

export type JobTreadRequestOptions = {
  /** Label for this request step (e.g. "jobMeta", "costGroupsPage") for error reporting. */
  step?: string;
};

/**
 * Sends a POST request to the JobTread Pave API with the given query.
 * Merges the decrypted grant key into query.$.grantKey. Returns parsed JSON.
 * Throws JobTreadConfigError when integration or secret is missing.
 * Throws JobTreadApiError on non-2xx or malformed response (with step, status, contentType, responseSnippet when applicable).
 */
export async function jobTreadRequest(
  query: Record<string, unknown>,
  options?: JobTreadRequestOptions
): Promise<unknown> {
  const step = options?.step;

  const integration = await getIntegrationByProvider(PROVIDER_JOBTREAD);
  if (!integration) {
    throw new JobTreadConfigError("JobTread integration is not configured.");
  }

  const grantKey = await getDecryptedIntegrationSecret(PROVIDER_JOBTREAD);
  if (!grantKey || !grantKey.trim()) {
    throw new JobTreadConfigError("JobTread grant key is not set.");
  }

  const baseUrl =
    integration.baseUrl?.trim() || DEFAULT_BASE_URL;
  const url = baseUrl.replace(/\/+$/, "");

  const body = {
    query: {
      $: { grantKey: grantKey.trim() },
      ...query,
    },
  };

  let res: Response;
  let rawText: string;
  let attempt = 0;
  // Retry loop for transient failures: network errors, 429 rate limits, and 5xx.
  // Non-retryable responses (4xx other than 429) fall straight through to the
  // normal error handling below.
  for (;;) {
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch (e) {
      if (attempt < MAX_RETRIES) {
        await sleep(retryDelayMs(attempt, null));
        attempt += 1;
        continue;
      }
      const message = e instanceof Error ? e.message : String(e);
      throw new JobTreadApiError(`JobTread API request failed: ${message}`);
    }

    if ((res.status === 429 || res.status >= 500) && attempt < MAX_RETRIES) {
      await sleep(retryDelayMs(attempt, res.headers.get("retry-after")));
      attempt += 1;
      continue;
    }

    rawText = await res.text();
    break;
  }
  const contentType = res.headers.get("content-type") ?? undefined;
  const responseSnippet =
    rawText.length > 0
      ? rawText.slice(0, MAX_RESPONSE_SNIPPET_LENGTH)
      : undefined;

  function buildContext(extra?: Partial<JobTreadApiErrorContext>): JobTreadApiErrorContext {
    return {
      step,
      status: res.status,
      contentType: contentType ?? null,
      responseSnippet,
      ...extra,
    };
  }

  let json: unknown = null;
  if (rawText) {
    try {
      json = JSON.parse(rawText) as unknown;
    } catch {
      const msg = step
        ? `JobTread API returned non-JSON response at step ${step} (HTTP ${res.status}).`
        : `JobTread API returned non-JSON response (HTTP ${res.status}).`;
      throw new JobTreadApiError(msg, res.status, buildContext());
    }
  }

  if (!res.ok) {
    const parts: string[] = [`HTTP ${res.status} ${res.statusText}`.trim()];
    const anyJson = json as {
      message?: string;
      errors?: { message?: string }[];
    } | null;
    if (anyJson?.message) parts.push(anyJson.message);
    if (anyJson?.errors?.length) {
      parts.push(
        anyJson.errors.map((e) => e.message ?? "Unknown error").join("; ")
      );
    } else if (rawText && !json) {
      const snippet =
        rawText.length > 200 ? `${rawText.slice(0, 197)}...` : rawText;
      parts.push(snippet);
    }
    const msg = step
      ? `JobTread API error at step ${step} (HTTP ${res.status}): ${parts.join(" | ")}`
      : parts.join(" | ");
    throw new JobTreadApiError(msg, res.status, buildContext());
  }

  if (json === null) {
    const msg = step
      ? `JobTread API returned empty response at step ${step}.`
      : "JobTread API returned an empty response.";
    throw new JobTreadApiError(msg, res.status, buildContext());
  }

  return json;
}
