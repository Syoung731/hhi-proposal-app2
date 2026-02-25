"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";
import type { Prisma } from "@/app/generated/prisma";
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
  const maxOrder = await prisma.roomType
    .aggregate({ _max: { sortOrder: true } })
    .then((r) => r._max.sortOrder ?? -1);
  await prisma.roomType.create({
    data: {
      name,
      sortOrder: maxOrder + 1,
      active: true,
      exterior,
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
