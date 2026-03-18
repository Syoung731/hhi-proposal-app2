'use server';

import {
  getIntegrationByProvider,
  getDecryptedIntegrationSecret,
  upsertIntegration,
  updateIntegrationTestStatus,
  PROVIDER_JOBTREAD,
} from "@/app/lib/integrations/service";

export type JobTreadIntegration = {
  id: string;
  name: string;
  apiBaseUrl: string;
  isEnabled: boolean;
  lastTestedAt: Date | null;
  lastStatus: string | null;
  lastMessage: string | null;
  metadata: Record<string, unknown> | null;
  hasGrantKey: boolean;
};

export type JobTreadCredentials = {
  apiBaseUrl: string;
  grantKey: string;
};

const DEFAULT_JOBTREAD_BASE_URL = "https://api.jobtread.com/pave";
const JOBTREAD_INTEGRATION_NAME = "JobTread";

function integrationToJobTreadIntegration(integration: {
  id: string;
  name: string;
  baseUrl: string | null;
  isActive: boolean;
  lastTestedAt: Date | null;
  lastStatus: string | null;
  lastMessage: string | null;
  metaJson: unknown;
  encryptedSecret: string | null;
}): JobTreadIntegration {
  return {
    id: integration.id,
    name: integration.name,
    apiBaseUrl: integration.baseUrl?.trim() || DEFAULT_JOBTREAD_BASE_URL,
    isEnabled: integration.isActive,
    lastTestedAt: integration.lastTestedAt ?? null,
    lastStatus: integration.lastStatus ?? null,
    lastMessage: integration.lastMessage ?? null,
    metadata: (integration.metaJson as Record<string, unknown> | null) ?? null,
    hasGrantKey: !!integration.encryptedSecret,
  };
}

/** Get or create the JobTread integration record (single canonical one by provider). */
export async function getOrCreateJobTreadIntegration(): Promise<JobTreadIntegration> {
  let integration = await getIntegrationByProvider(PROVIDER_JOBTREAD);
  if (integration) {
    return integrationToJobTreadIntegration(integration);
  }
  integration = await upsertIntegration({
    provider: PROVIDER_JOBTREAD,
    name: JOBTREAD_INTEGRATION_NAME,
    baseUrl: DEFAULT_JOBTREAD_BASE_URL,
    isActive: true,
  });
  return integrationToJobTreadIntegration(integration);
}

export async function saveJobTreadCredentials(input: {
  apiBaseUrl?: string;
  name?: string;
  /** When omitted or empty and an integration already exists, the existing secret is kept. */
  grantKey?: string;
  isEnabled?: boolean;
}): Promise<JobTreadIntegration> {
  const apiBaseUrl = (input.apiBaseUrl || DEFAULT_JOBTREAD_BASE_URL).trim();
  const name = (input.name || JOBTREAD_INTEGRATION_NAME).trim();
  const grantKeyRaw = input.grantKey?.trim();

  let url: URL;
  try {
    url = new URL(apiBaseUrl);
  } catch {
    throw new Error("API base URL must be a valid URL.");
  }

  const normalizedBaseUrl = url.toString().replace(/\/+$/, "");

  const existing = await getIntegrationByProvider(PROVIDER_JOBTREAD);
  if (!existing && !grantKeyRaw) {
    throw new Error("Grant key is required when setting up JobTread for the first time.");
  }

  const integration = await upsertIntegration({
    provider: PROVIDER_JOBTREAD,
    name,
    baseUrl: normalizedBaseUrl,
    ...(grantKeyRaw ? { grantKey: grantKeyRaw } : {}),
    isActive: input.isEnabled ?? true,
  });

  return integrationToJobTreadIntegration(integration);
}

/** Server-only: get credentials for JobTread API calls. Returns null if not configured. */
export async function getJobTreadCredentials(): Promise<JobTreadCredentials | null> {
  const integration = await getIntegrationByProvider(PROVIDER_JOBTREAD);
  if (!integration?.encryptedSecret) return null;

  const grantKey = await getDecryptedIntegrationSecret(PROVIDER_JOBTREAD);
  if (!grantKey?.trim()) return null;

  return {
    apiBaseUrl: integration.baseUrl?.trim() || DEFAULT_JOBTREAD_BASE_URL,
    grantKey: grantKey.trim(),
  };
}

export async function testJobTreadConnection(): Promise<{
  ok: boolean;
  error?: string;
}> {
  const creds = await getJobTreadCredentials();
  if (!creds) {
    const message = "JobTread credentials are not configured.";
    await updateIntegrationTestStatus(PROVIDER_JOBTREAD, "error", message);
    return { ok: false, error: message };
  }

  const url = creds.apiBaseUrl.replace(/\/+$/, "");
  const body = {
    query: {
      $: { grantKey: creds.grantKey },
      currentGrant: {
        id: {},
        user: {
          id: {},
          name: {},
          memberships: {
            nodes: {
              organization: {
                id: {},
                name: {},
              },
            },
          },
        },
      },
    },
  };

  let ok = false;
  let error: string | undefined;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const rawText = await res.text();
    let json: unknown = null;
    if (rawText) {
      try {
        json = JSON.parse(rawText) as unknown;
      } catch {
        // ignore
      }
    }

    if (!res.ok) {
      const parts: string[] = [`HTTP ${res.status} ${res.statusText}`.trim()];
      const anyJson = json as
        | { message?: string; error?: string | { message?: string }; errors?: { message?: string }[] }
        | null;
      if (anyJson?.message) parts.push(`Message: ${anyJson.message}`);
      if (anyJson?.error) {
        const errMsg =
          typeof anyJson.error === "string" ? anyJson.error : (anyJson.error as { message?: string }).message;
        if (errMsg) parts.push(`Error: ${errMsg}`);
      }
      if (anyJson?.errors?.length) {
        parts.push(
          `Errors: ${(anyJson.errors as { message?: string }[])
            .map((e) => e.message ?? "Unknown error")
            .join("; ")}`
        );
      } else if (rawText && !json) {
        parts.push(`Body: ${rawText.length > 300 ? rawText.slice(0, 297) + "..." : rawText}`);
      }
      error = parts.join(" | ");
    } else {
      if (!json) {
        error = "JobTread API returned a non-JSON response.";
      } else {
        const anyJson = json as
          | {
              currentGrant?: { id: string; user?: { name?: string | null } };
              data?: { currentGrant?: { id: string } };
              errors?: { message?: string }[];
            }
          | null;
        if (anyJson?.errors?.length) {
          error = anyJson.errors.map((e) => e.message ?? "Unknown error").join("; ");
        } else {
          const currentGrant = anyJson?.currentGrant ?? anyJson?.data?.currentGrant ?? null;
          if (!currentGrant) {
            error = "JobTread API did not return currentGrant in the response.";
          } else {
            ok = true;
          }
        }
      }
    }
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  await updateIntegrationTestStatus(
    PROVIDER_JOBTREAD,
    ok ? "success" : "error",
    ok ? "Connected" : error ?? "Unknown error"
  );

  return ok ? { ok: true } : { ok: false, error };
}
