"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";
import type { Prisma } from "@/app/generated/prisma";
import type { SectionCategory, MeasurementMode, EstimateUnit, PricingBasis } from "@/app/generated/prisma";
import { SUPER_ADMIN_EMAIL } from "@/app/lib/constants";

/** Get or create the singleton CompanySettings. Auto-create on first visit with defaults. */
export async function getOrCreateCompanySettings() {
  await requireAdmin();
  let settings = await prisma.companySettings.findFirst();
  if (!settings) {
    settings = await prisma.companySettings.create({
      data: {
        companyName: "",
        defaultProposalDisclaimer: "",
      },
    });
  }
  return settings;
}

export async function saveCompanyProfileAction(
  formData: FormData
): Promise<{ error?: string }> {
  await requireAdmin();
  const settings = await prisma.companySettings.findFirst();
  if (!settings) return { error: "Settings not found" };
  const companyName = (formData.get("companyName") as string)?.trim() ?? "";
  const addressLine1 = (formData.get("addressLine1") as string)?.trim() || null;
  const addressLine2 = (formData.get("addressLine2") as string)?.trim() || null;
  const city = (formData.get("city") as string)?.trim() || null;
  const state = (formData.get("state") as string)?.trim() || null;
  const zip = (formData.get("zip") as string)?.trim() || null;
  const phone = (formData.get("phone") as string)?.trim() || null;
  const email = (formData.get("email") as string)?.trim() || null;
  await prisma.companySettings.update({
    where: { id: settings.id },
    data: {
      companyName: companyName || "",
      addressLine1,
      addressLine2,
      city,
      state,
      zip,
      phone,
      email,
    },
  });
  revalidatePath("/admin/settings");
  return {};
}

const HEX_REGEX = /^#([0-9a-fA-F]{6})$/;

function normalizeHex(value: string | null): string | null {
  if (!value || typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!HEX_REGEX.test(trimmed)) return null;
  return trimmed.toUpperCase();
}

export async function saveBrandingAction(
  formData: FormData
): Promise<{ error?: string }> {
  await requireAdmin();
  const settings = await prisma.companySettings.findFirst();
  if (!settings) return { error: "Settings not found" };
  const logoLightUrl = (formData.get("logoLightUrl") as string)?.trim() || null;
  const logoDarkUrl = (formData.get("logoDarkUrl") as string)?.trim() || null;
  const primaryColorHexRaw = (formData.get("primaryColorHex") as string)?.trim() || null;
  const textColorHexRaw = (formData.get("textColorHex") as string)?.trim() || null;
  const primaryColorLegacy = (formData.get("primaryColor") as string)?.trim() || null;
  const primaryColorHex = normalizeHex(primaryColorHexRaw) ?? normalizeHex(primaryColorLegacy);
  const textColorHex = normalizeHex(textColorHexRaw);
  await prisma.companySettings.update({
    where: { id: settings.id },
    data: {
      logoLightUrl,
      logoDarkUrl,
      primaryColorHex: primaryColorHex ?? undefined,
      textColorHex: textColorHex ?? undefined,
      ...(primaryColorLegacy !== null && { primaryColor: primaryColorLegacy }),
    },
  });
  revalidatePath("/admin/settings");
  return {};
}

/** Save only logo URLs after upload. Used by Branding tab after successful upload. */
export async function saveBrandingLogosAction(
  logoLightUrl: string | null,
  logoDarkUrl: string | null
): Promise<{ error?: string }> {
  await requireAdmin();
  const settings = await prisma.companySettings.findFirst();
  if (!settings) return { error: "Settings not found" };
  await prisma.companySettings.update({
    where: { id: settings.id },
    data: {
      logoLightUrl: logoLightUrl ?? undefined,
      logoDarkUrl: logoDarkUrl ?? undefined,
    },
  });
  revalidatePath("/admin/settings");
  return {};
}

export async function saveProposalDefaultsAction(
  formData: FormData
): Promise<{ error?: string }> {
  await requireAdmin();
  const settings = await prisma.companySettings.findFirst();
  if (!settings) return { error: "Settings not found" };
  const defaultProposalDisclaimer =
    (formData.get("defaultProposalDisclaimer") as string)?.trim() ?? "";
  const defaultTimelineNote =
    (formData.get("defaultTimelineNote") as string)?.trim() || null;
  await prisma.companySettings.update({
    where: { id: settings.id },
    data: {
      defaultProposalDisclaimer,
      defaultTimelineNote,
    },
  });
  revalidatePath("/admin/settings");
  return {};
}

// Room type global percentage offsets: low = target * (1 + lowPct/100), high = target * (1 + highPct/100)
const ROOM_TYPE_LOW_PCT_MIN = -80;
const ROOM_TYPE_LOW_PCT_MAX = 0;
const ROOM_TYPE_HIGH_PCT_MIN = 0;
const ROOM_TYPE_HIGH_PCT_MAX = 200;

function validateRoomTypePct(
  lowPct: number | null | undefined,
  highPct: number | null | undefined
): { error?: string } {
  if (lowPct !== null && lowPct !== undefined) {
    if (typeof lowPct !== "number" || Number.isNaN(lowPct))
      return { error: "Low % must be a number" };
    if (lowPct < ROOM_TYPE_LOW_PCT_MIN || lowPct > ROOM_TYPE_LOW_PCT_MAX)
      return { error: `Low % must be between ${ROOM_TYPE_LOW_PCT_MIN} and ${ROOM_TYPE_LOW_PCT_MAX}` };
    if (lowPct >= 0) return { error: "Low % should be below target (negative)" };
  }
  if (highPct !== null && highPct !== undefined) {
    if (typeof highPct !== "number" || Number.isNaN(highPct))
      return { error: "High % must be a number" };
    if (highPct < ROOM_TYPE_HIGH_PCT_MIN || highPct > ROOM_TYPE_HIGH_PCT_MAX)
      return { error: `High % must be between ${ROOM_TYPE_HIGH_PCT_MIN} and ${ROOM_TYPE_HIGH_PCT_MAX}` };
    if (highPct <= 0) return { error: "High % should be above target (positive)" };
  }
  if (
    lowPct != null && highPct != null &&
    typeof lowPct === "number" && !Number.isNaN(lowPct) &&
    typeof highPct === "number" && !Number.isNaN(highPct) &&
    lowPct >= highPct
  ) {
    return { error: "Low % must be less than High %" };
  }
  return {};
}

export async function saveRoomTypePctAction(
  lowPct: number | null,
  highPct: number | null
): Promise<{ error?: string }> {
  await requireAdmin();
  const err = validateRoomTypePct(lowPct, highPct);
  if (err.error) return err;
  const settings = await prisma.companySettings.findFirst();
  if (!settings) return { error: "Settings not found" };
  await prisma.companySettings.update({
    where: { id: settings.id },
    data: {
      roomTypeLowPct: lowPct ?? undefined,
      roomTypeHighPct: highPct ?? undefined,
    },
  });
  revalidatePath("/admin/settings");
  return {};
}

const DEFAULT_ROOM_TYPE_LOW_PCT = -10;
const DEFAULT_ROOM_TYPE_HIGH_PCT = 10;

/** Recompute and persist Low/High for all RoomTypes that have a Target, using global % from CompanySettings. Does not overwrite manual overrides (non-null Low/High). */
export async function recomputeRoomTypeLowHighAction(): Promise<{ error?: string }> {
  await requireAdmin();
  const settings = await prisma.companySettings.findFirst();
  if (!settings) return { error: "Settings not found" };
  const lowPct = settings.roomTypeLowPct ?? DEFAULT_ROOM_TYPE_LOW_PCT;
  const highPct = settings.roomTypeHighPct ?? DEFAULT_ROOM_TYPE_HIGH_PCT;

  const roomTypes = await prisma.roomType.findMany({
    where: { pricePerSqFtTarget: { not: null } },
    select: {
      id: true,
      pricePerSqFtTarget: true,
      pricePerSqFtLow: true,
      pricePerSqFtHigh: true,
    },
  });

  const updates: Array<{ id: string; pricePerSqFtLow?: number; pricePerSqFtHigh?: number }> = [];
  for (const rt of roomTypes) {
    const target = rt.pricePerSqFtTarget!;
    const computedLow = Math.floor(target * (1 + lowPct / 100));
    const computedHigh = Math.ceil(target * (1 + highPct / 100));
    const newLow = rt.pricePerSqFtLow == null ? computedLow : undefined;
    const newHigh = rt.pricePerSqFtHigh == null ? computedHigh : undefined;
    if (newLow !== undefined || newHigh !== undefined) {
      updates.push({
        id: rt.id,
        ...(newLow !== undefined && { pricePerSqFtLow: newLow }),
        ...(newHigh !== undefined && { pricePerSqFtHigh: newHigh }),
      });
    }
  }

  if (updates.length > 0) {
    await prisma.$transaction(
      updates.map((u) =>
        prisma.roomType.update({
          where: { id: u.id },
          data: {
            ...(u.pricePerSqFtLow !== undefined && { pricePerSqFtLow: u.pricePerSqFtLow }),
            ...(u.pricePerSqFtHigh !== undefined && { pricePerSqFtHigh: u.pricePerSqFtHigh }),
          },
        })
      )
    );
  }
  revalidatePath("/admin/settings");
  return {};
}

export async function saveIntegrationsAction(
  formData: FormData
): Promise<{ error?: string }> {
  await requireAdmin();
  const settings = await prisma.companySettings.findFirst();
  if (!settings) return { error: "Settings not found" };
  const integrationsJsonRaw = (formData.get("integrationsJson") as string)?.trim();
  let integrationsJson: unknown = null;
  if (integrationsJsonRaw) {
    try {
      integrationsJson = JSON.parse(integrationsJsonRaw) as unknown;
    } catch {
      return { error: "Invalid JSON" };
    }
  }
  await prisma.companySettings.update({
    where: { id: settings.id },
    data: { integrationsJson: integrationsJson as Prisma.InputJsonValue },
  });
  revalidatePath("/admin/settings");
  return {};
}

const PRICE_PER_SQ_FT_MAX = 5000;
const SECTION_TYPE_PRICE_MAX = 10_000_000;

function validatePricePerSqFt(value: number | null | undefined): { error?: string } {
  if (value === null || value === undefined) return {};
  if (typeof value !== "number" || Number.isNaN(value)) return { error: "Price must be a number" };
  if (value <= 0) return { error: "Price per sq ft must be greater than 0" };
  if (value >= PRICE_PER_SQ_FT_MAX) return { error: `Price per sq ft must be less than ${PRICE_PER_SQ_FT_MAX}` };
  return {};
}

/** Validate generic section type price (any basis). Do not treat blank as 0. */
function validateSectionTypePrice(value: number | null | undefined): { error?: string } {
  if (value === null || value === undefined) return {};
  if (typeof value !== "number" || Number.isNaN(value)) return { error: "Price must be a number" };
  if (value <= 0) return { error: "Price must be greater than 0" };
  if (value >= SECTION_TYPE_PRICE_MAX) return { error: `Price must be less than ${SECTION_TYPE_PRICE_MAX}` };
  return {};
}

function parseOptionalFloat(formData: FormData, key: string): number | null {
  const raw = formData.get(key);
  if (raw === null || raw === undefined || raw === "") return null;
  const n = Number(String(raw).trim());
  return Number.isNaN(n) ? null : n;
}

export async function getRoomTypes() {
  await requireAdmin();
  return prisma.roomType.findMany({ orderBy: { sortOrder: "asc" } });
}

export async function addRoomTypeAction(
  formData: FormData
): Promise<{ error?: string }> {
  await requireAdmin();
  const name = (formData.get("name") as string)?.trim() ?? "";
  if (!name) return { error: "Name is required" };
  const exterior = formData.get("exterior") === "on" || formData.get("exterior") === "true";
  const pricePerSqFtTarget = parseOptionalFloat(formData, "pricePerSqFtTarget");
  const vTarget = validatePricePerSqFt(pricePerSqFtTarget);
  if (vTarget.error) return vTarget;
  const maxOrder = await prisma.roomType
    .aggregate({ _max: { sortOrder: true } })
    .then((r) => r._max.sortOrder ?? -1);
  await prisma.roomType.create({
    data: {
      name,
      sortOrder: maxOrder + 1,
      active: true,
      exterior,
      pricePerSqFtTarget: pricePerSqFtTarget ?? undefined,
    },
  });
  revalidatePath("/admin/settings");
  return {};
}

export async function updateRoomTypeNameAction(
  roomTypeId: string,
  name: string
): Promise<{ error?: string }> {
  await requireAdmin();
  const trimmed = name?.trim() ?? "";
  if (!trimmed) return { error: "Name is required" };
  await prisma.roomType.update({
    where: { id: roomTypeId },
    data: { name: trimmed },
  });
  revalidatePath("/admin/settings");
  return {};
}

export type UpdateRoomTypePricingData = {
  pricePerSqFtLow?: number | null;
  pricePerSqFtTarget?: number | null;
  pricePerSqFtHigh?: number | null;
};

/** Round low/high to whole dollars for storage. Low: floor, High: ceil. */
function roundLowForStorage(value: number): number {
  return Math.floor(value);
}
function roundHighForStorage(value: number): number {
  return Math.ceil(value);
}

/** Section type generic pricing: low round DOWN to 2 decimals, target round to 2, high round UP to 2. */
function roundSectionTypeLow(value: number): number {
  return Math.floor(value * 100) / 100;
}
function roundSectionTypeTarget(value: number): number {
  return Math.round(value * 100) / 100;
}
function roundSectionTypeHigh(value: number): number {
  return Math.ceil(value * 100) / 100;
}

const PRICING_BASIS_VALUES: PricingBasis[] = ["NONE", "PER_SF", "PER_EACH", "PER_JOB"];

export async function updateSectionTypePricingBasisAction(
  sectionTypeId: string,
  pricingBasis: string
): Promise<{ error?: string }> {
  await requireAdmin();
  if (!PRICING_BASIS_VALUES.includes(pricingBasis as PricingBasis)) {
    return { error: "Invalid pricing basis" };
  }
  const existing = await prisma.sectionType.findUnique({
    where: { id: sectionTypeId },
    select: { id: true },
  });
  if (!existing) return { error: "Section type not found" };
  await prisma.sectionType.update({
    where: { id: sectionTypeId },
    data: { pricingBasis: pricingBasis as PricingBasis },
  });
  revalidatePath("/admin/settings");
  return {};
}

export async function updateRoomTypePricingAction(
  roomTypeId: string,
  data: UpdateRoomTypePricingData
): Promise<{ error?: string }> {
  await requireAdmin();
  let target: number | null | undefined = data.pricePerSqFtTarget;
  let low: number | null | undefined = data.pricePerSqFtLow;
  let high: number | null | undefined = data.pricePerSqFtHigh;

  if (target !== undefined && target !== null) {
    const vTarget = validatePricePerSqFt(target);
    if (vTarget.error) return vTarget;
    target = Math.round(target * 100) / 100;
  }
  if (low !== undefined && low !== null) {
    const vLow = validatePricePerSqFt(low);
    if (vLow.error) return vLow;
    low = roundLowForStorage(low);
  }
  if (high !== undefined && high !== null) {
    const vHigh = validatePricePerSqFt(high);
    if (vHigh.error) return vHigh;
    high = roundHighForStorage(high);
  }

  const existing = await prisma.roomType.findUnique({
    where: { id: roomTypeId },
    select: { pricePerSqFtLow: true, pricePerSqFtHigh: true },
  });
  const lowVal = low !== undefined ? low : (existing?.pricePerSqFtLow ?? undefined);
  const highVal = high !== undefined ? high : (existing?.pricePerSqFtHigh ?? undefined);
  if (lowVal != null && highVal != null && lowVal > highVal) {
    return { error: "Low must be less than or equal to High" };
  }

  await prisma.roomType.update({
    where: { id: roomTypeId },
    data: {
      ...(target !== undefined && { pricePerSqFtTarget: target ?? null }),
      ...(low !== undefined && { pricePerSqFtLow: low ?? null }),
      ...(high !== undefined && { pricePerSqFtHigh: high ?? null }),
    },
  });
  revalidatePath("/admin/settings");
  return {};
}

export async function deleteRoomTypeAction(roomTypeId: string): Promise<{ error?: string }> {
  await requireAdmin();
  await prisma.roomType.delete({ where: { id: roomTypeId } });
  revalidatePath("/admin/settings");
  return {};
}

export async function toggleRoomTypeActiveAction(
  roomTypeId: string,
  active: boolean
): Promise<{ error?: string }> {
  await requireAdmin();
  await prisma.roomType.update({
    where: { id: roomTypeId },
    data: { active },
  });
  revalidatePath("/admin/settings");
  return {};
}

export async function toggleRoomTypeExteriorAction(
  roomTypeId: string,
  exterior: boolean
): Promise<{ error?: string }> {
  await requireAdmin();
  await prisma.roomType.update({
    where: { id: roomTypeId },
    data: { exterior },
  });
  revalidatePath("/admin/settings");
  return {};
}

export async function reorderRoomTypeAction(
  roomTypeId: string,
  direction: "up" | "down"
): Promise<{ error?: string }> {
  await requireAdmin();
  const roomTypes = await prisma.roomType.findMany({
    orderBy: { sortOrder: "asc" },
  });
  const idx = roomTypes.findIndex((r) => r.id === roomTypeId);
  if (idx < 0) return { error: "Room type not found" };
  const swapIdx = direction === "up" ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= roomTypes.length) return {};
  const a = roomTypes[idx]!;
  const b = roomTypes[swapIdx]!;
  await prisma.$transaction([
    prisma.roomType.update({
      where: { id: a.id },
      data: { sortOrder: b.sortOrder },
    }),
    prisma.roomType.update({
      where: { id: b.id },
      data: { sortOrder: a.sortOrder },
    }),
  ]);
  revalidatePath("/admin/settings");
  return {};
}

/** Persist new order of room types by ID. sortOrder = 1-based index. */
export async function reorderRoomTypes(
  idsInNewOrder: string[]
): Promise<{ error?: string }> {
  await requireAdmin();
  await prisma.$transaction(
    idsInNewOrder.map((id, index) =>
      prisma.roomType.update({
        where: { id },
        data: { sortOrder: index + 1 },
      })
    )
  );
  revalidatePath("/admin/settings");
  return {};
}

// ——— Employees ———

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateEmployeeInput(data: {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
}): { error?: string } {
  const firstName = (data.firstName ?? "").trim();
  const lastName = (data.lastName ?? "").trim();
  if (!firstName) return { error: "First name is required" };
  if (!lastName) return { error: "Last name is required" };
  const email = (data.email ?? "").trim();
  if (email && !EMAIL_REGEX.test(email)) return { error: "Invalid email format" };
  return {};
}

export async function listEmployees() {
  await requireAdmin();
  return prisma.employee.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] });
}

export type CreateEmployeeData = {
  firstName: string;
  lastName: string;
  roleTitle?: string | null;
  email?: string | null;
  phone?: string | null;
};

export async function createEmployee(
  data: CreateEmployeeData
): Promise<{ error?: string }> {
  await requireAdmin();
  const err = validateEmployeeInput(data);
  if (err.error) return err;
  const firstName = data.firstName.trim();
  const lastName = data.lastName.trim();
  const email = (data.email ?? "").trim() || null;
  const roleTitle = (data.roleTitle ?? "").trim() || null;
  const phone = (data.phone ?? "").trim() || null;
  if (email) {
    const existing = await prisma.employee.findUnique({ where: { email } });
    if (existing) return { error: "An employee with this email already exists" };
  }
  const maxOrder = await prisma.employee
    .aggregate({ _max: { sortOrder: true } })
    .then((r) => r._max.sortOrder ?? -1);
  await prisma.employee.create({
    data: {
      firstName,
      lastName,
      roleTitle,
      email,
      phone,
      sortOrder: maxOrder + 1,
    },
  });
  revalidatePath("/admin/settings");
  return {};
}

export type UpdateEmployeeData = {
  firstName?: string;
  lastName?: string;
  roleTitle?: string | null;
  email?: string | null;
  phone?: string | null;
};

export async function updateEmployee(
  id: string,
  data: UpdateEmployeeData
): Promise<{ error?: string }> {
  await requireAdmin();
  const existing = await prisma.employee.findUnique({ where: { id } });
  if (!existing) return { error: "Employee not found" };
  const firstName = (data.firstName ?? existing.firstName).trim();
  const lastName = (data.lastName ?? existing.lastName).trim();
  const email = (data.email ?? existing.email ?? "").trim() || null;
  const roleTitle = (data.roleTitle ?? existing.roleTitle ?? "").trim() || null;
  const phone = (data.phone ?? existing.phone ?? "").trim() || null;
  const err = validateEmployeeInput({ firstName, lastName, email });
  if (err.error) return err;
  if (email) {
    const duplicate = await prisma.employee.findFirst({
      where: { email, id: { not: id } },
    });
    if (duplicate) return { error: "An employee with this email already exists" };
  }
  await prisma.employee.update({
    where: { id },
    data: { firstName, lastName, roleTitle, email, phone },
  });
  revalidatePath("/admin/settings");
  return {};
}

export async function toggleEmployeeActive(id: string): Promise<{ error?: string }> {
  await requireAdmin();
  const emp = await prisma.employee.findUnique({ where: { id } });
  if (!emp) return { error: "Employee not found" };
  await prisma.employee.update({
    where: { id },
    data: { isActive: !emp.isActive },
  });
  revalidatePath("/admin/settings");
  return {};
}

export async function deleteEmployee(id: string): Promise<{ error?: string }> {
  await requireAdmin();
  await prisma.employee.delete({ where: { id } });
  revalidatePath("/admin/settings");
  return {};
}

function parseCsv(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/** Only admins may call. Prevents changing Super Admin; prevents removing admin if it would leave zero admins. */
export async function toggleEmployeeAdmin(
  employeeId: string,
  isAdmin: boolean
): Promise<{ error?: string }> {
  const { email: currentEmail } = await requireAdmin();

  const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
  if (!employee) return { error: "Employee not found" };

  const employeeEmailLower = (employee.email ?? "").toLowerCase();
  if (employeeEmailLower === SUPER_ADMIN_EMAIL.toLowerCase()) {
    return { error: "Cannot change Super Admin." };
  }

  if (employee.isAdmin === isAdmin) return {}; // no-op

  if (!isAdmin) {
    const employeeAdminCount = await prisma.employee.count({ where: { isAdmin: true } });
    const bootstrapAdminCount = parseCsv(process.env.ADMIN_EMAILS).length;
    const superAdminCount = 1; // Super Admin always passes requireAdmin() regardless of Employee
    const remainingAdmins = (employeeAdminCount - 1) + bootstrapAdminCount + superAdminCount;
    if (remainingAdmins < 1) {
      return { error: "Cannot remove the last admin. At least one admin is required." };
    }
    const isSelfDemotion = employeeEmailLower === (currentEmail ?? "");
    if (isSelfDemotion && employeeAdminCount <= 1 && bootstrapAdminCount === 0) {
      return { error: "Cannot remove your own admin rights while you are the only employee admin." };
    }
  }

  await prisma.employee.update({
    where: { id: employeeId },
    data: { isAdmin },
  });
  revalidatePath("/admin/settings");
  return {};
}

// ——— Style Presets ———

/** All presets for Settings tab (table): order by sortOrder. */
export async function listStylePresets() {
  await requireAdmin();
  return prisma.stylePreset.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
}

/** Active presets only, for dropdowns (project default, room override, per-render): order by sortOrder. */
export async function listActiveStylePresets() {
  await requireAdmin();
  return prisma.stylePreset.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true },
  });
}

export type CreateStylePresetData = {
  name: string;
  prompt: string;
  isActive?: boolean;
  sortOrder?: number;
};

export async function createStylePreset(
  data: CreateStylePresetData
): Promise<{ error?: string }> {
  await requireAdmin();
  const name = (data.name ?? "").trim();
  const prompt = (data.prompt ?? "").trim();
  if (!name) return { error: "Name is required" };
  if (!prompt) return { error: "Prompt is required" };
  const existing = await prisma.stylePreset.findUnique({ where: { name } });
  if (existing) return { error: "A preset with this name already exists" };
  const maxOrder = await prisma.stylePreset
    .aggregate({ _max: { sortOrder: true } })
    .then((r) => r._max.sortOrder ?? -1);
  await prisma.stylePreset.create({
    data: {
      name,
      prompt,
      isActive: data.isActive ?? true,
      sortOrder: data.sortOrder ?? maxOrder + 10,
    },
  });
  revalidatePath("/admin/settings");
  return {};
}

export type UpdateStylePresetData = {
  name?: string;
  prompt?: string;
  isActive?: boolean;
  sortOrder?: number;
};

export async function updateStylePreset(
  id: string,
  data: UpdateStylePresetData
): Promise<{ error?: string }> {
  await requireAdmin();
  const preset = await prisma.stylePreset.findUnique({ where: { id } });
  if (!preset) return { error: "Style preset not found" };
  const name = data.name !== undefined ? (data.name ?? "").trim() : undefined;
  const prompt = data.prompt !== undefined ? (data.prompt ?? "").trim() : undefined;
  if (name !== undefined && !name) return { error: "Name is required" };
  if (prompt !== undefined && !prompt) return { error: "Prompt is required" };
  if (name !== undefined && name !== preset.name) {
    const existing = await prisma.stylePreset.findUnique({ where: { name } });
    if (existing) return { error: "A preset with this name already exists" };
  }
  await prisma.stylePreset.update({
    where: { id },
    data: {
      ...(name !== undefined && { name }),
      ...(prompt !== undefined && { prompt }),
      ...(data.isActive !== undefined && { isActive: data.isActive }),
      ...(data.sortOrder !== undefined && { sortOrder: data.sortOrder }),
    },
  });
  revalidatePath("/admin/settings");
  return {};
}

export async function deleteStylePreset(id: string): Promise<{ error?: string }> {
  await requireAdmin();
  const preset = await prisma.stylePreset.findUnique({ where: { id } });
  if (!preset) return { error: "Style preset not found" };
  // Set FKs to null and allow delete (safer option per spec)
  await prisma.$transaction([
    prisma.project.updateMany({ where: { stylePresetId: id }, data: { stylePresetId: null } }),
    prisma.room.updateMany({ where: { stylePresetId: id }, data: { stylePresetId: null } }),
    prisma.media.updateMany({ where: { stylePresetId: id }, data: { stylePresetId: null } }),
    prisma.stylePreset.delete({ where: { id } }),
  ]);
  revalidatePath("/admin/settings");
  return {};
}

export async function reorderStylePreset(
  id: string,
  direction: "up" | "down"
): Promise<{ error?: string }> {
  await requireAdmin();
  const presets = await prisma.stylePreset.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, sortOrder: true },
  });
  const idx = presets.findIndex((p) => p.id === id);
  if (idx < 0) return { error: "Style preset not found" };
  const swapIdx = direction === "up" ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= presets.length) return {};
  const a = presets[idx]!;
  const b = presets[swapIdx]!;
  await prisma.$transaction([
    prisma.stylePreset.update({ where: { id: a.id }, data: { sortOrder: b.sortOrder } }),
    prisma.stylePreset.update({ where: { id: b.id }, data: { sortOrder: a.sortOrder } }),
  ]);
  revalidatePath("/admin/settings");
  return {};
}

/** Set order of style presets by passing ids in desired order. sortOrder = 1-based index. */
export async function reorderStylePresets(
  orderedIds: string[]
): Promise<{ error?: string }> {
  await requireAdmin();
  await prisma.$transaction(
    orderedIds.map((id, index) =>
      prisma.stylePreset.update({
        where: { id },
        data: { sortOrder: index + 1 },
      })
    )
  );
  revalidatePath("/admin/settings");
  return {};
}

/** Prevent deactivating the last active preset. */
export async function toggleStylePresetActive(
  id: string,
  isActive: boolean
): Promise<{ error?: string }> {
  await requireAdmin();
  const preset = await prisma.stylePreset.findUnique({ where: { id } });
  if (!preset) return { error: "Style preset not found" };
  if (isActive) {
    await prisma.stylePreset.update({ where: { id }, data: { isActive: true } });
    revalidatePath("/admin/settings");
    return {};
  }
  const activeCount = await prisma.stylePreset.count({ where: { isActive: true } });
  if (activeCount <= 1) {
    return { error: "At least one active preset is required. Add another preset first, then deactivate this one." };
  }
  await prisma.stylePreset.update({ where: { id }, data: { isActive: false } });
  revalidatePath("/admin/settings");
  return {};
}

// ——— Section Types ———

export async function listSectionTypes() {
  await requireAdmin();
  return prisma.sectionType.findMany({
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });
}

export type CreateSectionTypeData = {
  name: string;
  category: SectionCategory;
  defaultMeasurementMode: MeasurementMode;
  defaultEstimateUnit: EstimateUnit;
  customUnitLabel?: string | null;
};

export async function createSectionType(
  data: CreateSectionTypeData
): Promise<{ error?: string }> {
  await requireAdmin();
  const name = (data.name ?? "").trim();
  if (!name) return { error: "Name is required" };
  if (data.defaultEstimateUnit === "CUSTOM") {
    const label = (data.customUnitLabel ?? "").trim();
    if (!label) return { error: "Custom unit label is required when estimate unit is CUSTOM" };
  }
  const existing = await prisma.sectionType.findUnique({ where: { name } });
  if (existing) return { error: "A section type with this name already exists" };
  await prisma.sectionType.create({
    data: {
      name,
      category: data.category,
      defaultMeasurementMode: data.defaultMeasurementMode,
      defaultEstimateUnit: data.defaultEstimateUnit,
      customUnitLabel: data.defaultEstimateUnit === "CUSTOM" ? (data.customUnitLabel ?? "").trim() || null : null,
    },
  });
  revalidatePath("/admin/settings");
  return {};
}

export type UpdateSectionTypeData = {
  name?: string;
  category?: SectionCategory;
  defaultMeasurementMode?: MeasurementMode;
  defaultEstimateUnit?: EstimateUnit;
  customUnitLabel?: string | null;
};

export async function updateSectionType(
  id: string,
  data: UpdateSectionTypeData
): Promise<{ error?: string }> {
  await requireAdmin();
  const existing = await prisma.sectionType.findUnique({ where: { id } });
  if (!existing) return { error: "Section type not found" };
  const name = data.name !== undefined ? (data.name ?? "").trim() : undefined;
  if (name !== undefined && !name) return { error: "Name is required" };
  const unit = data.defaultEstimateUnit !== undefined ? data.defaultEstimateUnit : existing.defaultEstimateUnit;
  const labelRaw = data.customUnitLabel !== undefined ? data.customUnitLabel : existing.customUnitLabel;
  const label = (labelRaw ?? "").trim() || null;
  if (unit === "CUSTOM" && !label) {
    return { error: "Custom unit label is required when estimate unit is CUSTOM" };
  }
  if (name !== undefined && name !== existing.name) {
    const duplicate = await prisma.sectionType.findUnique({ where: { name } });
    if (duplicate) return { error: "A section type with this name already exists" };
  }
  await prisma.sectionType.update({
    where: { id },
    data: {
      ...(name !== undefined && { name }),
      ...(data.category !== undefined && { category: data.category }),
      ...(data.defaultMeasurementMode !== undefined && { defaultMeasurementMode: data.defaultMeasurementMode }),
      ...(data.defaultEstimateUnit !== undefined && { defaultEstimateUnit: data.defaultEstimateUnit }),
      customUnitLabel: unit === "CUSTOM" ? label : null,
    },
  });
  revalidatePath("/admin/settings");
  return {};
}

export async function deleteSectionType(id: string): Promise<{ error?: string }> {
  await requireAdmin();
  const st = await prisma.sectionType.findUnique({ where: { id } });
  if (!st) return { error: "Section type not found" };
  await prisma.$transaction([
    prisma.room.updateMany({ where: { sectionTypeId: id }, data: { sectionTypeId: null } }),
    prisma.sectionType.delete({ where: { id } }),
  ]);
  revalidatePath("/admin/settings");
  return {};
}

export type UpdateSectionTypePricingData = {
  priceLow?: number | null;
  priceTarget?: number | null;
  priceHigh?: number | null;
};

/** Update generic pricing for a SectionType. Accepts number > 0, null (clear), or undefined (don't touch).
 * Rounding: low down to 2 decimals, target to 2, high up to 2. Never coerce blank to 0. */
export async function updateSectionTypePricingAction(
  sectionTypeId: string,
  data: UpdateSectionTypePricingData
): Promise<{ error?: string }> {
  await requireAdmin();
  const existing = await prisma.sectionType.findUnique({
    where: { id: sectionTypeId },
    select: { priceLow: true, priceTarget: true, priceHigh: true },
  });
  if (!existing) return { error: "Section type not found" };

  let target: number | null | undefined = data.priceTarget;
  let low: number | null | undefined = data.priceLow;
  let high: number | null | undefined = data.priceHigh;

  if (target !== undefined && target !== null) {
    const vTarget = validateSectionTypePrice(target);
    if (vTarget.error) return vTarget;
    target = roundSectionTypeTarget(target);
  }
  if (low !== undefined && low !== null) {
    const vLow = validateSectionTypePrice(low);
    if (vLow.error) return vLow;
    low = roundSectionTypeLow(low);
  }
  if (high !== undefined && high !== null) {
    const vHigh = validateSectionTypePrice(high);
    if (vHigh.error) return vHigh;
    high = roundSectionTypeHigh(high);
  }

  const lowVal = low !== undefined ? low : (existing.priceLow ?? undefined);
  const highVal = high !== undefined ? high : (existing.priceHigh ?? undefined);
  if (lowVal != null && highVal != null && lowVal > highVal) {
    return { error: "Low must be less than or equal to High" };
  }

  await prisma.sectionType.update({
    where: { id: sectionTypeId },
    data: {
      ...(target !== undefined && { priceTarget: target }),
      ...(low !== undefined && { priceLow: low }),
      ...(high !== undefined && { priceHigh: high }),
    },
  });
  revalidatePath("/admin/settings");
  return {};
}

/** Recompute display only: does NOT write priceLow/priceHigh to DB. PER_SF Low/High are computed from Target + % in UI; overrides are explicit only. */
export async function recomputeSectionTypeLowHighForOneAction(
  sectionTypeId: string
): Promise<{ error?: string }> {
  await requireAdmin();
  // No DB writes: computed values must not be materialized. Display is computed client-side when priceLow/priceHigh are null.
  revalidatePath("/admin/settings");
  return {};
}

/** Recompute display only: does NOT write priceLow/priceHigh to DB. PER_SF Low/High are computed from Target + % in UI; overrides are explicit only. */
export async function recomputeSectionTypeLowHighAction(): Promise<{ error?: string }> {
  await requireAdmin();
  // No DB writes: computed values must not be materialized. Display is computed client-side when priceLow/priceHigh are null.
  revalidatePath("/admin/settings");
  return {};
}

const CLEANUP_OVERRIDE_TOLERANCE = 0.01;

/** One-time cleanup: for PER_SF section types, set priceLow/priceHigh to null when they match computed values (within tolerance). Returns number of rows updated. */
export async function cleanupSectionTypeComputedOverridesAction(): Promise<
  { error?: string; cleaned?: number }
> {
  await requireAdmin();
  const settings = await prisma.companySettings.findFirst();
  const lowPct = settings?.roomTypeLowPct ?? DEFAULT_ROOM_TYPE_LOW_PCT;
  const highPct = settings?.roomTypeHighPct ?? DEFAULT_ROOM_TYPE_HIGH_PCT;

  const sectionTypes = await prisma.sectionType.findMany({
    where: { pricingBasis: "PER_SF", priceTarget: { not: null } },
    select: {
      id: true,
      priceTarget: true,
      priceLow: true,
      priceHigh: true,
    },
  });

  let cleaned = 0;
  const updates: Array<{ id: string; priceLow?: number | null; priceHigh?: number | null }> = [];

  for (const st of sectionTypes) {
    const target = st.priceTarget!;
    const expectedLow = roundSectionTypeLow(target * (1 + lowPct / 100));
    const expectedHigh = roundSectionTypeHigh(target * (1 + highPct / 100));
    const clearLow =
      st.priceLow != null &&
      Math.abs(st.priceLow - expectedLow) <= CLEANUP_OVERRIDE_TOLERANCE;
    const clearHigh =
      st.priceHigh != null &&
      Math.abs(st.priceHigh - expectedHigh) <= CLEANUP_OVERRIDE_TOLERANCE;
    if (clearLow || clearHigh) {
      updates.push({
        id: st.id,
        ...(clearLow && { priceLow: null }),
        ...(clearHigh && { priceHigh: null }),
      });
      cleaned += 1;
    }
  }

  if (updates.length > 0) {
    await prisma.$transaction(
      updates.map((u) =>
        prisma.sectionType.update({
          where: { id: u.id },
          data: {
            ...(u.priceLow !== undefined && { priceLow: u.priceLow }),
            ...(u.priceHigh !== undefined && { priceHigh: u.priceHigh }),
          },
        })
      )
    );
  }
  revalidatePath("/admin/settings");
  return { cleaned };
}

/** One-time seed of HHI default section types. Only Super Admin can run. Does not duplicate existing names. */
export async function seedSectionTypesAction(): Promise<{ error?: string; inserted?: number }> {
  const { email } = await requireAdmin();
  if (email?.toLowerCase() !== SUPER_ADMIN_EMAIL.toLowerCase()) {
    return { error: "Only the Super Admin can run the section types seed." };
  }

  type SeedRow = {
    name: string;
    category: SectionCategory;
    defaultMeasurementMode: MeasurementMode;
    defaultEstimateUnit: EstimateUnit;
    customUnitLabel: string | null;
  };

  const defaults: SeedRow[] = [
    { name: "Kitchen", category: "INTERIOR", defaultMeasurementMode: "AREA", defaultEstimateUnit: "SF", customUnitLabel: null },
    { name: "Bathroom", category: "INTERIOR", defaultMeasurementMode: "AREA", defaultEstimateUnit: "SF", customUnitLabel: null },
    { name: "Bedroom", category: "INTERIOR", defaultMeasurementMode: "AREA", defaultEstimateUnit: "SF", customUnitLabel: null },
    { name: "Living Room", category: "INTERIOR", defaultMeasurementMode: "AREA", defaultEstimateUnit: "SF", customUnitLabel: null },
    { name: "Dining", category: "INTERIOR", defaultMeasurementMode: "AREA", defaultEstimateUnit: "SF", customUnitLabel: null },
    { name: "Hallway", category: "INTERIOR", defaultMeasurementMode: "AREA", defaultEstimateUnit: "SF", customUnitLabel: null },
    { name: "Laundry", category: "INTERIOR", defaultMeasurementMode: "AREA", defaultEstimateUnit: "SF", customUnitLabel: null },
    { name: "Pantry", category: "INTERIOR", defaultMeasurementMode: "AREA", defaultEstimateUnit: "SF", customUnitLabel: null },
    { name: "Deck", category: "EXTERIOR", defaultMeasurementMode: "AREA", defaultEstimateUnit: "SF", customUnitLabel: null },
    { name: "Screened Porch", category: "EXTERIOR", defaultMeasurementMode: "AREA", defaultEstimateUnit: "SF", customUnitLabel: null },
    { name: "Exterior Paint", category: "EXTERIOR", defaultMeasurementMode: "AREA", defaultEstimateUnit: "SF", customUnitLabel: null },
    { name: "Roof", category: "EXTERIOR", defaultMeasurementMode: "AREA", defaultEstimateUnit: "SQ", customUnitLabel: null },
    { name: "Landscaping", category: "EXTERIOR", defaultMeasurementMode: "NONE", defaultEstimateUnit: "CUSTOM", customUnitLabel: "Job" },
    { name: "Water Heater", category: "SYSTEMS", defaultMeasurementMode: "COUNT", defaultEstimateUnit: "EA", customUnitLabel: null },
    { name: "HVAC", category: "SYSTEMS", defaultMeasurementMode: "COUNT", defaultEstimateUnit: "EA", customUnitLabel: null },
    { name: "Electrical", category: "SYSTEMS", defaultMeasurementMode: "NONE", defaultEstimateUnit: "CUSTOM", customUnitLabel: "Job" },
    { name: "Plumbing", category: "SYSTEMS", defaultMeasurementMode: "NONE", defaultEstimateUnit: "CUSTOM", customUnitLabel: "Job" },
    { name: "Whole-Home Interior", category: "WHOLE_HOME", defaultMeasurementMode: "AREA", defaultEstimateUnit: "SF", customUnitLabel: null },
    { name: "Whole-Home Remodel", category: "WHOLE_HOME", defaultMeasurementMode: "NONE", defaultEstimateUnit: "CUSTOM", customUnitLabel: "Job" },
    { name: "Addition", category: "ADDITION", defaultMeasurementMode: "AREA", defaultEstimateUnit: "SF", customUnitLabel: null },
    { name: "Replace Faucet", category: "FAST", defaultMeasurementMode: "COUNT", defaultEstimateUnit: "EA", customUnitLabel: null },
    { name: "Replace Toilet", category: "FAST", defaultMeasurementMode: "COUNT", defaultEstimateUnit: "EA", customUnitLabel: null },
    { name: "Replace Water Heater", category: "FAST", defaultMeasurementMode: "COUNT", defaultEstimateUnit: "EA", customUnitLabel: null },
    { name: "Patch Drywall", category: "FAST", defaultMeasurementMode: "NONE", defaultEstimateUnit: "CUSTOM", customUnitLabel: "Job" },
  ];

  const existingNames = new Set(
    (await prisma.sectionType.findMany({ select: { name: true } })).map((r) => r.name)
  );
  let inserted = 0;
  for (const row of defaults) {
    if (existingNames.has(row.name)) continue;
    await prisma.sectionType.create({
      data: {
        name: row.name,
        category: row.category,
        defaultMeasurementMode: row.defaultMeasurementMode,
        defaultEstimateUnit: row.defaultEstimateUnit,
        customUnitLabel: row.customUnitLabel,
      },
    });
    existingNames.add(row.name);
    inserted++;
  }
  revalidatePath("/admin/settings");
  return { inserted };
}
