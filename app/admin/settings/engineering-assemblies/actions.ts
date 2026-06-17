"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";
import { uploadBuffer, deleteR2Objects } from "@/app/lib/s3";
import { AssemblyReviewStatus } from "@/app/generated/prisma";
import type {
  EngineeringAssembly,
  EngineeringAssemblyComponent,
  EngineeringAssemblySource,
  Prisma,
} from "@/app/generated/prisma";

// ---------------------------------------------------------------------------
// Engineering Assemblies knowledge base — admin CRUD
//
// Curates the engineer-vetted assembly library that the AI estimate retrieves
// from. Every action is gated by requireAdmin(); all return the
// {ok:true,...}|{ok:false,errorCode,message} convention used across settings.
// ---------------------------------------------------------------------------

const SETTINGS_PATH = "/admin/settings/engineering-assemblies";

export type AssemblyActionErrorCode =
  | "NOT_FOUND"
  | "VALIDATION"
  | "CONFLICT"
  | "UNKNOWN";

/** An assembly with its components + sources eagerly loaded for the editor. */
export type AssemblyWithRelations = EngineeringAssembly & {
  components: EngineeringAssemblyComponent[];
  sources: EngineeringAssemblySource[];
};

export type AssemblyActionResult =
  | { ok: true; assembly: AssemblyWithRelations }
  | { ok: false; errorCode: AssemblyActionErrorCode; message: string };

export type AssemblySimpleResult =
  | { ok: true }
  | { ok: false; errorCode: AssemblyActionErrorCode; message: string };

export type ComponentActionResult =
  | { ok: true; component: EngineeringAssemblyComponent }
  | { ok: false; errorCode: AssemblyActionErrorCode; message: string };

// ─── Input shapes ──────────────────────────────────────────────────────────

export type AssemblyCreateInput = {
  name: string;
  category: string;
  slug?: string | null;
  discriminator?: string | null;
  whenToUse?: string | null;
  methodSummary?: string | null;
  codeBasis?: string | null;
  quantityBasis?: string | null;
  caveats?: string | null;
  unitOfAssembly?: string | null;
  triggerKeywords?: string[] | null;
  tags?: string[] | null;
  sourceFirm?: string | null;
  engineerName?: string | null;
  engineerLicense?: string | null;
  sourceRef?: string | null;
  sourceDrawingUrl?: string | null;
  sourceDrawingKey?: string | null;
  sortOrder?: number | null;
  isActive?: boolean | null;
};

export type AssemblyUpdateInput = Partial<AssemblyCreateInput>;

export type ComponentInput = {
  kind?: string | null; // MEMBER | CONNECTOR
  name: string;
  spec?: string | null;
  model?: string | null;
  qtyRule?: string | null;
  unit?: string | null;
  isConditional?: boolean | null;
  notes?: string | null;
  sortOrder?: number | null;
};

export type ComponentPatch = Partial<ComponentInput>;

const COMPONENT_KINDS = ["MEMBER", "CONNECTOR"] as const;

// ─── Helpers ─────────────────────────────────────────────────────────────────

const SLUG_REGEX = /^[a-z0-9-]{2,80}$/;

function normalizeSlug(raw: string): string {
  const trimmed = (raw ?? "").toString().trim().toLowerCase();
  if (!trimmed) return "";
  return trimmed
    .replace(/[_\s]+/g, "-")
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Build a kebab slug from name (+ optional discriminator) when none is given. */
function deriveSlug(name: string, discriminator?: string | null): string {
  const base = [name, discriminator]
    .filter((p) => p && p.toString().trim().length > 0)
    .join(" ");
  return normalizeSlug(base);
}

/** Find a slug not already taken, appending -2, -3, … on collision. */
async function ensureUniqueSlug(
  base: string,
  excludeId?: string
): Promise<string> {
  const root = base || "assembly";
  let candidate = root;
  let i = 2;
  // Bounded loop — practically never iterates more than a handful of times.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const existing = await prisma.engineeringAssembly.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });
    if (!existing || (excludeId && existing.id === excludeId)) {
      return candidate;
    }
    candidate = `${root}-${i}`;
    i += 1;
  }
}

/** Normalize a free-form tag/keyword list: trim, lowercase, kebab, dedupe. */
function normalizeKeywords(list: string[] | null | undefined): string[] {
  if (!list) return [];
  const normalized = list
    .flatMap((t) => (Array.isArray(t) ? t : [t]))
    .map((t) => normalizeSlug((t ?? "").toString()))
    .filter(Boolean);
  return Array.from(new Set(normalized));
}

/** Normalize free tags (allow looser content than keywords — just trim+dedupe). */
function normalizeTags(list: string[] | null | undefined): string[] {
  if (!list) return [];
  const normalized = list
    .flatMap((t) => (Array.isArray(t) ? t : [t]))
    .map((t) => (t ?? "").toString().trim())
    .filter(Boolean);
  return Array.from(new Set(normalized));
}

function cleanOptionalString(v: string | null | undefined): string | null {
  if (v == null) return null;
  const trimmed = v.toString().trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeKind(kind: string | null | undefined): string {
  const k = (kind ?? "").toString().trim().toUpperCase();
  return (COMPONENT_KINDS as readonly string[]).includes(k) ? k : "MEMBER";
}

// ─── List ────────────────────────────────────────────────────────────────────

export async function listEngineeringAssemblies(): Promise<
  AssemblyWithRelations[]
> {
  await requireAdmin();
  return prisma.engineeringAssembly.findMany({
    orderBy: [{ category: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
    include: {
      components: { orderBy: [{ kind: "asc" }, { sortOrder: "asc" }, { name: "asc" }] },
      sources: { orderBy: { createdAt: "asc" } },
    },
  });
}

// ─── Create ──────────────────────────────────────────────────────────────────

export async function createEngineeringAssembly(
  input: AssemblyCreateInput
): Promise<AssemblyActionResult> {
  await requireAdmin();

  const name = (input.name ?? "").toString().trim();
  if (!name) {
    return { ok: false, errorCode: "VALIDATION", message: "Name is required." };
  }
  const category = (input.category ?? "").toString().trim();
  if (!category) {
    return { ok: false, errorCode: "VALIDATION", message: "Category is required." };
  }

  const discriminator = cleanOptionalString(input.discriminator);

  // Derive a kebab slug from name+discriminator if none provided; validate either way.
  let slug = input.slug ? normalizeSlug(input.slug) : deriveSlug(name, discriminator);
  if (!slug || !SLUG_REGEX.test(slug)) {
    slug = deriveSlug(name, discriminator);
  }
  if (!slug) {
    return { ok: false, errorCode: "VALIDATION", message: "Could not derive a valid slug from the name." };
  }
  slug = await ensureUniqueSlug(slug);

  try {
    const created = await prisma.engineeringAssembly.create({
      data: {
        slug,
        name,
        category,
        discriminator,
        whenToUse: cleanOptionalString(input.whenToUse),
        methodSummary: cleanOptionalString(input.methodSummary),
        codeBasis: cleanOptionalString(input.codeBasis),
        quantityBasis: cleanOptionalString(input.quantityBasis),
        caveats: cleanOptionalString(input.caveats),
        unitOfAssembly: cleanOptionalString(input.unitOfAssembly),
        triggerKeywords: normalizeKeywords(input.triggerKeywords),
        tags: normalizeTags(input.tags),
        sourceFirm: cleanOptionalString(input.sourceFirm),
        engineerName: cleanOptionalString(input.engineerName),
        engineerLicense: cleanOptionalString(input.engineerLicense),
        sourceRef: cleanOptionalString(input.sourceRef),
        sourceDrawingUrl: cleanOptionalString(input.sourceDrawingUrl),
        sourceDrawingKey: cleanOptionalString(input.sourceDrawingKey),
        sortOrder: input.sortOrder != null ? Number(input.sortOrder) : 0,
        isActive: input.isActive ?? true,
        // reviewStatus defaults to DRAFT in the schema.
      },
      include: {
        components: true,
        sources: true,
      },
    });

    revalidatePath(SETTINGS_PATH);
    return { ok: true, assembly: created };
  } catch (err) {
    return mapPrismaError(err, "create");
  }
}

// ─── Update ──────────────────────────────────────────────────────────────────

export async function updateEngineeringAssembly(
  id: string,
  patch: AssemblyUpdateInput
): Promise<AssemblyActionResult> {
  await requireAdmin();

  const existing = await prisma.engineeringAssembly.findUnique({ where: { id } });
  if (!existing) {
    return { ok: false, errorCode: "NOT_FOUND", message: "Assembly not found." };
  }

  // Build a sparse update — only touch keys present on the patch.
  const data: Prisma.EngineeringAssemblyUpdateInput = {};

  if ("name" in patch) {
    const name = (patch.name ?? "").toString().trim();
    if (!name) {
      return { ok: false, errorCode: "VALIDATION", message: "Name cannot be empty." };
    }
    data.name = name;
  }
  if ("category" in patch) {
    const category = (patch.category ?? "").toString().trim();
    if (!category) {
      return { ok: false, errorCode: "VALIDATION", message: "Category cannot be empty." };
    }
    data.category = category;
  }
  if ("discriminator" in patch) data.discriminator = cleanOptionalString(patch.discriminator);
  if ("whenToUse" in patch) data.whenToUse = cleanOptionalString(patch.whenToUse);
  if ("methodSummary" in patch) data.methodSummary = cleanOptionalString(patch.methodSummary);
  if ("codeBasis" in patch) data.codeBasis = cleanOptionalString(patch.codeBasis);
  if ("quantityBasis" in patch) data.quantityBasis = cleanOptionalString(patch.quantityBasis);
  if ("caveats" in patch) data.caveats = cleanOptionalString(patch.caveats);
  if ("unitOfAssembly" in patch) data.unitOfAssembly = cleanOptionalString(patch.unitOfAssembly);
  if ("triggerKeywords" in patch) data.triggerKeywords = normalizeKeywords(patch.triggerKeywords);
  if ("tags" in patch) data.tags = normalizeTags(patch.tags);
  if ("sourceFirm" in patch) data.sourceFirm = cleanOptionalString(patch.sourceFirm);
  if ("engineerName" in patch) data.engineerName = cleanOptionalString(patch.engineerName);
  if ("engineerLicense" in patch) data.engineerLicense = cleanOptionalString(patch.engineerLicense);
  if ("sourceRef" in patch) data.sourceRef = cleanOptionalString(patch.sourceRef);
  if ("sourceDrawingUrl" in patch) data.sourceDrawingUrl = cleanOptionalString(patch.sourceDrawingUrl);
  if ("sourceDrawingKey" in patch) data.sourceDrawingKey = cleanOptionalString(patch.sourceDrawingKey);
  if ("sortOrder" in patch && patch.sortOrder != null) data.sortOrder = Number(patch.sortOrder);
  if ("isActive" in patch && patch.isActive != null) data.isActive = Boolean(patch.isActive);

  // Slug: only recompute if the caller explicitly passed one.
  if ("slug" in patch && patch.slug != null) {
    const normalized = normalizeSlug(patch.slug);
    if (!normalized || !SLUG_REGEX.test(normalized)) {
      return {
        ok: false,
        errorCode: "VALIDATION",
        message: "Slug must be 2–80 characters: lowercase letters, numbers, and dashes.",
      };
    }
    data.slug = await ensureUniqueSlug(normalized, id);
  }

  try {
    const updated = await prisma.engineeringAssembly.update({
      where: { id },
      data,
      include: {
        components: { orderBy: [{ kind: "asc" }, { sortOrder: "asc" }, { name: "asc" }] },
        sources: { orderBy: { createdAt: "asc" } },
      },
    });
    revalidatePath(SETTINGS_PATH);
    return { ok: true, assembly: updated };
  } catch (err) {
    return mapPrismaError(err, "update");
  }
}

// ─── Review-status gate (the engineer-vetting approve/archive control) ────────

export async function setAssemblyReviewStatus(
  id: string,
  status: AssemblyReviewStatus
): Promise<AssemblyActionResult> {
  await requireAdmin();

  if (!Object.values(AssemblyReviewStatus).includes(status)) {
    return { ok: false, errorCode: "VALIDATION", message: "Invalid review status." };
  }

  const existing = await prisma.engineeringAssembly.findUnique({ where: { id } });
  if (!existing) {
    return { ok: false, errorCode: "NOT_FOUND", message: "Assembly not found." };
  }

  try {
    const updated = await prisma.engineeringAssembly.update({
      where: { id },
      data: { reviewStatus: status },
      include: {
        components: { orderBy: [{ kind: "asc" }, { sortOrder: "asc" }, { name: "asc" }] },
        sources: { orderBy: { createdAt: "asc" } },
      },
    });
    revalidatePath(SETTINGS_PATH);
    return { ok: true, assembly: updated };
  } catch (err) {
    return mapPrismaError(err, "update");
  }
}

// ─── Delete ──────────────────────────────────────────────────────────────────

export async function deleteEngineeringAssembly(
  id: string
): Promise<AssemblySimpleResult> {
  await requireAdmin();

  const existing = await prisma.engineeringAssembly.findUnique({ where: { id } });
  if (!existing) {
    // Idempotent: treat a missing record as already-deleted success.
    revalidatePath(SETTINGS_PATH);
    return { ok: true };
  }

  const drawingKey = existing.sourceDrawingKey ?? null;

  try {
    // Components + sources cascade on delete (onDelete: Cascade in schema).
    await prisma.engineeringAssembly.delete({ where: { id } });
  } catch (err) {
    return mapPrismaError(err, "delete") as AssemblySimpleResult;
  }

  if (drawingKey) {
    try {
      await deleteR2Objects([drawingKey]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      revalidatePath(SETTINGS_PATH);
      return {
        ok: false,
        errorCode: "UNKNOWN",
        message: `Assembly deleted, but failed to remove its source drawing from storage: ${msg}`,
      };
    }
  }

  revalidatePath(SETTINGS_PATH);
  return { ok: true };
}

// ─── Component CRUD ──────────────────────────────────────────────────────────

export async function addAssemblyComponent(
  assemblyId: string,
  input: ComponentInput
): Promise<ComponentActionResult> {
  await requireAdmin();

  const assembly = await prisma.engineeringAssembly.findUnique({
    where: { id: assemblyId },
    select: { id: true },
  });
  if (!assembly) {
    return { ok: false, errorCode: "NOT_FOUND", message: "Assembly not found." };
  }

  const name = (input.name ?? "").toString().trim();
  if (!name) {
    return { ok: false, errorCode: "VALIDATION", message: "Component name is required." };
  }

  // Append at the end of the list by default.
  const maxOrder = await prisma.engineeringAssemblyComponent.aggregate({
    where: { assemblyId },
    _max: { sortOrder: true },
  });
  const nextSortOrder =
    input.sortOrder != null
      ? Number(input.sortOrder)
      : (maxOrder._max.sortOrder ?? -1) + 1;

  try {
    const component = await prisma.engineeringAssemblyComponent.create({
      data: {
        assemblyId,
        kind: normalizeKind(input.kind),
        name,
        spec: cleanOptionalString(input.spec),
        model: cleanOptionalString(input.model),
        qtyRule: cleanOptionalString(input.qtyRule),
        unit: cleanOptionalString(input.unit),
        isConditional: input.isConditional ?? false,
        notes: cleanOptionalString(input.notes),
        sortOrder: nextSortOrder,
      },
    });
    revalidatePath(SETTINGS_PATH);
    return { ok: true, component };
  } catch (err) {
    return mapPrismaError(err, "create") as ComponentActionResult;
  }
}

export async function updateAssemblyComponent(
  id: string,
  patch: ComponentPatch
): Promise<ComponentActionResult> {
  await requireAdmin();

  const existing = await prisma.engineeringAssemblyComponent.findUnique({ where: { id } });
  if (!existing) {
    return { ok: false, errorCode: "NOT_FOUND", message: "Component not found." };
  }

  const data: Prisma.EngineeringAssemblyComponentUpdateInput = {};
  if ("kind" in patch) data.kind = normalizeKind(patch.kind);
  if ("name" in patch) {
    const name = (patch.name ?? "").toString().trim();
    if (!name) {
      return { ok: false, errorCode: "VALIDATION", message: "Component name cannot be empty." };
    }
    data.name = name;
  }
  if ("spec" in patch) data.spec = cleanOptionalString(patch.spec);
  if ("model" in patch) data.model = cleanOptionalString(patch.model);
  if ("qtyRule" in patch) data.qtyRule = cleanOptionalString(patch.qtyRule);
  if ("unit" in patch) data.unit = cleanOptionalString(patch.unit);
  if ("isConditional" in patch && patch.isConditional != null) data.isConditional = Boolean(patch.isConditional);
  if ("notes" in patch) data.notes = cleanOptionalString(patch.notes);
  if ("sortOrder" in patch && patch.sortOrder != null) data.sortOrder = Number(patch.sortOrder);

  try {
    const component = await prisma.engineeringAssemblyComponent.update({
      where: { id },
      data,
    });
    revalidatePath(SETTINGS_PATH);
    return { ok: true, component };
  } catch (err) {
    return mapPrismaError(err, "update") as ComponentActionResult;
  }
}

export async function deleteAssemblyComponent(
  id: string
): Promise<AssemblySimpleResult> {
  await requireAdmin();

  const existing = await prisma.engineeringAssemblyComponent.findUnique({ where: { id } });
  if (!existing) {
    revalidatePath(SETTINGS_PATH);
    return { ok: true };
  }

  try {
    await prisma.engineeringAssemblyComponent.delete({ where: { id } });
    revalidatePath(SETTINGS_PATH);
    return { ok: true };
  } catch (err) {
    return mapPrismaError(err, "delete") as AssemblySimpleResult;
  }
}

// ─── Source-drawing upload (image or PDF) ─────────────────────────────────────

/**
 * Upload an assembly source-drawing to R2.
 *
 * Accepts a FormData payload with a single "file" field. Allowed types:
 * image/png, image/jpeg, image/webp, application/pdf. Max 5 MB (matches the
 * Server Action bodySizeLimit in next.config.ts). Returns the R2 key + URL —
 * the caller persists them onto the assembly via updateEngineeringAssembly.
 *
 * Cloned from uploadReferenceImageAction in the backgrounds library, with a
 * dedicated "engineering-assemblies/" object-key prefix and PDF support.
 */
export async function uploadAssemblyDrawingAction(
  formData: FormData
): Promise<{ ok: true; key: string; url: string } | { ok: false; error: string }> {
  await requireAdmin();

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "No file provided." };
  }

  const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp", "application/pdf"];
  if (!ALLOWED_TYPES.includes(file.type)) {
    return { ok: false, error: "Source drawing must be a PNG, JPEG, WebP, or PDF." };
  }

  const MAX_BYTES = 5 * 1024 * 1024; // 5 MB — matches serverActions.bodySizeLimit
  if (file.size > MAX_BYTES) {
    return { ok: false, error: "Source drawing must be under 5 MB." };
  }

  const ext =
    file.type === "image/png"
      ? "png"
      : file.type === "image/webp"
      ? "webp"
      : file.type === "application/pdf"
      ? "pdf"
      : "jpg";
  const objectKey = `engineering-assemblies/${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}.${ext}`;

  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    const { publicUrl, fileKey } = await uploadBuffer(objectKey, bytes, file.type);
    return { ok: true, key: fileKey, url: publicUrl };
  } catch (err) {
    console.error("[uploadAssemblyDrawingAction] R2 upload failed:", err);
    return { ok: false, error: "Failed to upload source drawing. Please try again." };
  }
}

// ─── Error mapping ────────────────────────────────────────────────────────────

function mapPrismaError(
  err: unknown,
  op: "create" | "update" | "delete"
): AssemblyActionResult {
  // P2002 = unique constraint (slug collision); P2025 = record not found.
  const code = (err as { code?: string })?.code;
  if (code === "P2002") {
    return {
      ok: false,
      errorCode: "CONFLICT",
      message: "An assembly with this slug already exists. Choose a different name or slug.",
    };
  }
  if (code === "P2025") {
    return { ok: false, errorCode: "NOT_FOUND", message: "Record not found." };
  }
  console.error(`[engineering-assemblies] ${op} failed`, err);
  return {
    ok: false,
    errorCode: "UNKNOWN",
    message: err instanceof Error ? err.message : `Failed to ${op} assembly.`,
  };
}
