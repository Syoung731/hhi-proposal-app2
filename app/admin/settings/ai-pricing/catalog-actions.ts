"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";

/**
 * Mark a set of PricingCatalogItem rows as user-hidden. Hidden items are
 * filtered out of the catalog browser, the cost-item picker, the AI
 * estimate prompt, and the COPE prompt. JobTread re-syncs preserve the
 * flag because the sync's update allowlist does not include `hidden`.
 */
export async function hideCatalogItems(ids: string[]): Promise<{ count: number }> {
  await requireAdmin();
  if (ids.length === 0) return { count: 0 };

  const result = await prisma.pricingCatalogItem.updateMany({
    where: { id: { in: ids } },
    data: { hidden: true },
  });

  revalidatePath("/admin/settings/ai-pricing");
  return { count: result.count };
}

/** Reverse of hideCatalogItems — make items visible again. */
export async function unhideCatalogItems(ids: string[]): Promise<{ count: number }> {
  await requireAdmin();
  if (ids.length === 0) return { count: 0 };

  const result = await prisma.pricingCatalogItem.updateMany({
    where: { id: { in: ids } },
    data: { hidden: false },
  });

  revalidatePath("/admin/settings/ai-pricing");
  return { count: result.count };
}
