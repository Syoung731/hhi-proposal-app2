import { prisma } from "@/app/lib/prisma";

/**
 * Redeem a pair code. Validates code exists, not expired, not already used;
 * marks usedAt and returns projectId. Used by server action and API route.
 */
export async function redeemExtensionPairCode(
  code: string
): Promise<{ projectId: string } | { error: string }> {
  const trimmed = (code ?? "").trim().toUpperCase();
  if (!trimmed) return { error: "Code is required" };

  const row = await prisma.extensionPairCode.findUnique({
    where: { code: trimmed },
    select: { id: true, projectId: true, expiresAt: true, usedAt: true },
  });
  if (!row) return { error: "Invalid code" };
  if (row.usedAt) return { error: "Code already used" };
  if (new Date() > row.expiresAt) return { error: "Code expired" };

  await prisma.extensionPairCode.update({
    where: { id: row.id },
    data: { usedAt: new Date() },
  });
  return { projectId: row.projectId };
}
