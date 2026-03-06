"use server";

import { Prisma } from "@/app/generated/prisma";
import { prisma } from "@/app/lib/prisma";

const DEFAULT_COMPANY_NAME = "Default Company";

/** DEV only: log current database name/host/port (safe raw query). */
export async function logDbInfoInDev(): Promise<void> {
  if (process.env.NODE_ENV !== "development") return;
  try {
    const rows = await prisma.$queryRaw<
      { db: string; host: string | null; port: number | null }[]
    >(
      Prisma.sql`SELECT current_database() AS db, inet_server_addr()::text AS host, inet_server_port() AS port`
    );
    console.log("[value-pillars DEV] Database connection:", rows[0] ?? "no row");
  } catch (e) {
    console.warn("[value-pillars DEV] Could not get DB info:", e);
  }
}

/** DEV only: log column names for ValuePillar, WhyUsDefaults, Company, BrandIcon. */
export async function logTableColumnsInDev(): Promise<void> {
  if (process.env.NODE_ENV !== "development") return;
  try {
    const rows = await prisma.$queryRaw<
      { table_name: string; column_name: string; data_type: string }[]
    >(
      Prisma.sql`
        SELECT table_name, column_name, data_type
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name IN ('ValuePillar', 'WhyUsDefaults', 'Company', 'BrandIcon')
        ORDER BY table_name, ordinal_position`
    );
    console.log(
      "[value-pillars DEV] Table columns:",
      JSON.stringify(rows, null, 2)
    );
  } catch (e) {
    console.warn("[value-pillars DEV] Could not list columns:", e);
  }
}

/** Get or create the single company (single-tenant). Returns company id. */
export async function getDefaultCompanyId(): Promise<string> {
  if (!("company" in prisma) || prisma.company == null) {
    throw new Error(
      "Prisma client is missing the 'company' delegate. Run `npx prisma generate` and restart the dev server."
    );
  }
  let company = await prisma.company.findFirst();
  if (!company) {
    company = await prisma.company.create({
      data: { name: DEFAULT_COMPANY_NAME },
    });
  }
  return company.id;
}

export type WhyUsDefaultsRow = {
  id: string;
  companyId: string;
  title: string;
};

export type ValuePillarRow = {
  id: string;
  companyId: string;
  title: string;
  body: string;
  brandIconId: string | null;
  sortOrder: number;
  brandIcon?: { id: string; imageUrl: string; name: string } | null;
};

/** Get Why Us defaults for the company (creates row with defaults if none). Returns { title }. */
export async function getWhyUsDefaults(
  companyId: string
): Promise<WhyUsDefaultsRow> {
  let row = await prisma.whyUsDefaults.findUnique({
    where: { companyId },
  });
  if (!row) {
    row = await prisma.whyUsDefaults.create({
      data: { companyId, title: "Why Us" },
    });
  }
  return {
    id: row.id,
    companyId: row.companyId,
    title: row.title,
  };
}

/** Upsert Why Us defaults (title only). */
export async function upsertWhyUsDefaults(
  companyId: string,
  data: { title: string }
): Promise<WhyUsDefaultsRow> {
  const row = await prisma.whyUsDefaults.upsert({
    where: { companyId },
    create: { companyId, title: data.title.trim() || "Why Us" },
    update: { title: data.title.trim() || "Why Us" },
  });
  return {
    id: row.id,
    companyId: row.companyId,
    title: row.title,
  };
}

const MAX_PILLARS = 4;

/** List value pillars for company, ordered by sortOrder asc. */
export async function listValuePillars(
  companyId: string
): Promise<ValuePillarRow[]> {
  const rows = await prisma.valuePillar.findMany({
    where: { companyId },
    orderBy: { sortOrder: "asc" },
    include: {
      brandIcon: { select: { id: true, imageUrl: true, name: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    companyId: r.companyId,
    title: r.title,
    body: r.body,
    brandIconId: r.brandIconId,
    sortOrder: r.sortOrder,
    brandIcon: r.brandIcon ?? null,
  }));
}

/** Create a value pillar. Enforces max 4 total per company. Accepts title, body, brandIconId (optional). */
export async function createValuePillar(
  companyId: string,
  data: { title: string; body: string; brandIconId?: string | null }
): Promise<ValuePillarRow> {
  return await prisma.$transaction(async (tx) => {
    const count = await tx.valuePillar.count({ where: { companyId } });
    if (count >= MAX_PILLARS) {
      throw new Error("Maximum of 4 pillars.");
    }
    const maxOrder = await tx.valuePillar.aggregate({
      where: { companyId },
      _max: { sortOrder: true },
    });
    const sortOrder = (maxOrder._max.sortOrder ?? -1) + 1;
    const created = await tx.valuePillar.create({
      data: {
        companyId,
        title: (data.title ?? "").trim() || "Pillar",
        body: (data.body ?? "").trim(),
        brandIconId: data.brandIconId ?? null,
        sortOrder,
      },
      include: {
        brandIcon: { select: { id: true, imageUrl: true, name: true } },
      },
    });
    return {
      id: created.id,
      companyId: created.companyId,
      title: created.title,
      body: created.body,
      brandIconId: created.brandIconId,
      sortOrder: created.sortOrder,
      brandIcon: created.brandIcon ?? null,
    };
  });
}

/** Update a value pillar. title, body, brandIconId, and sortOrder are updatable. */
export async function updateValuePillar(
  companyId: string,
  pillarId: string,
  patch: { title?: string; body?: string; brandIconId?: string | null; sortOrder?: number }
): Promise<ValuePillarRow | null> {
  const existing = await prisma.valuePillar.findFirst({
    where: { id: pillarId, companyId },
  });
  if (!existing) return null;

  const updated = await prisma.valuePillar.update({
    where: { id: pillarId },
    data: {
      ...(patch.title !== undefined && {
        title: (patch.title ?? "").trim() || "Pillar",
      }),
      ...(patch.body !== undefined && { body: (patch.body ?? "").trim() }),
      ...(patch.brandIconId !== undefined && { brandIconId: patch.brandIconId }),
      ...(patch.sortOrder !== undefined && { sortOrder: patch.sortOrder }),
    },
    include: {
      brandIcon: { select: { id: true, imageUrl: true, name: true } },
    },
  });
  return {
    id: updated.id,
    companyId: updated.companyId,
    title: updated.title,
    body: updated.body,
    brandIconId: updated.brandIconId,
    sortOrder: updated.sortOrder,
    brandIcon: updated.brandIcon ?? null,
  };
}

/** Delete a value pillar. */
export async function deleteValuePillar(
  companyId: string,
  pillarId: string
): Promise<boolean> {
  const deleted = await prisma.valuePillar.deleteMany({
    where: { id: pillarId, companyId },
  });
  return deleted.count > 0;
}

/** Swap a pillar's sortOrder with the previous (up) or next (down) in the library. */
export async function swapPillarOrder(
  companyId: string,
  pillarId: string,
  direction: "up" | "down"
): Promise<ValuePillarRow[] | null> {
  const all = await prisma.valuePillar.findMany({
    where: { companyId },
    orderBy: { sortOrder: "asc" },
  });
  const idx = all.findIndex((p) => p.id === pillarId);
  if (idx < 0) return null;
  const swapIdx = direction === "up" ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= all.length) return null;
  const [a, b] = [all[idx], all[swapIdx]];
  await prisma.$transaction([
    prisma.valuePillar.update({
      where: { id: a.id },
      data: { sortOrder: b.sortOrder },
    }),
    prisma.valuePillar.update({
      where: { id: b.id },
      data: { sortOrder: a.sortOrder },
    }),
  ]);
  return listValuePillars(companyId);
}
