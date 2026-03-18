/**
 * Server-only integration service. Do not expose decrypted secrets to the client.
 */
import { prisma } from "@/app/lib/prisma";
import { encryptSecret, decryptIntegrationSecret } from "@/app/lib/integration-secrets";

const PROVIDER_JOBTREAD = "jobtread";

export type UpsertIntegrationInput = {
  provider: string;
  name: string;
  baseUrl?: string | null;
  grantKey?: string | null;
  metaJson?: any | null;
  isActive?: boolean;
};

/** Returns the active integration for the given provider, or null. */
export async function getIntegrationByProvider(provider: string) {
  return prisma.integration.findFirst({
    where: { provider, isActive: true },
    orderBy: { updatedAt: "desc" },
  });
}

/** Create or update an integration by provider + name. Encrypts grantKey before saving; if grantKey omitted, keeps existing secret. */
export async function upsertIntegration(input: UpsertIntegrationInput) {
  const { provider, name, baseUrl, grantKey, metaJson, isActive = true } = input;

  const existing = await prisma.integration.findUnique({
    where: { provider_name: { provider, name } },
  });

  let encryptedSecret: string | null = null;
  if (typeof grantKey === "string" && grantKey.trim()) {
    encryptedSecret = encryptSecret(grantKey.trim());
  } else if (existing?.encryptedSecret) {
    encryptedSecret = existing.encryptedSecret;
  }

  return prisma.integration.upsert({
    where: { provider_name: { provider, name } },
    create: {
      provider,
      name,
      isActive,
      baseUrl: baseUrl?.trim() || null,
      encryptedSecret,
      metaJson: metaJson ?? undefined,
    },
    update: {
      isActive,
      ...(baseUrl !== undefined && { baseUrl: baseUrl?.trim() || null }),
      ...(encryptedSecret !== null && { encryptedSecret }),
      ...(metaJson !== undefined && { metaJson: metaJson ?? undefined }),
    },
  });
}

/** Returns the decrypted secret for the active integration of the given provider, or null. Server-only. */
export async function getDecryptedIntegrationSecret(provider: string): Promise<string | null> {
  const integration = await getIntegrationByProvider(provider);
  if (!integration?.encryptedSecret) return null;
  return decryptIntegrationSecret(integration.encryptedSecret);
}

/** Update lastTestedAt, lastStatus, and lastMessage for the active integration of the given provider. */
export async function updateIntegrationTestStatus(
  provider: string,
  status: "success" | "error",
  message?: string | null
) {
  const integration = await getIntegrationByProvider(provider);
  if (!integration) return;
  await prisma.integration.update({
    where: { id: integration.id },
    data: {
      lastTestedAt: new Date(),
      lastStatus: status,
      lastMessage: message ?? null,
    },
  });
}

/** Provider constant for JobTread. */
export { PROVIDER_JOBTREAD };
