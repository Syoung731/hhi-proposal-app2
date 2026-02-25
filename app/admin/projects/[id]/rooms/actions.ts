"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";
import { normalizeRoomName } from "@/app/lib/room-utils";
import {
  extractRoomsFromTranscript,
  rewriteRoomScopeNarrative,
} from "@/app/lib/ai/extract-from-transcript";

export type UnmatchedRoomItem = { name: string; roomIds: string[] };

/** Normalize for dedupe comparison: trim, collapse spaces, normalize separators, collapse again, lowercase. */
function normalizeRoomNameForCompare(name: string): string {
  const collapsed = name.trim().replace(/\s+/g, " ");
  const withSpaces = collapsed.replace(/[\/\\\-&,:]/g, " ");
  return withSpaces.replace(/\s+/g, " ").toLowerCase();
}

/** Canonical room name aliases (normalized key -> canonical normalized). Conservative to avoid merging different rooms. */
const ROOM_ALIAS_MAP: Record<string, string> = {
  "master bath": "primary bath",
  "master bathroom": "primary bath",
  "primary bathroom": "primary bath",
  "foyer": "entry/hall",
  "entry": "entry/hall",
  "screen porch": "screened porch",
};

/** Display labels for canonical names when we want something nicer than titleCase. */
const CANONICAL_DISPLAY: Record<string, string> = {
  "entry/hall": "Entry/Hall",
  "primary bath": "Primary Bath",
  "screened porch": "Screened Porch",
  "wet dry bar": "Wet / Dry Bar",
  "wet/dry bar": "Wet / Dry Bar",
};

/**
 * Apply alias normalization to a trimmed/collapsed/lower name.
 * "porch" -> "screened porch" only when transcriptContext contains "screen" (conservative).
 */
function applyAlias(normalizedName: string, transcriptContext: string): string {
  const lowerContext = transcriptContext.toLowerCase();
  if (normalizedName === "porch" && (lowerContext.includes("screen") || lowerContext.includes("screened"))) {
    return "screened porch";
  }
  return ROOM_ALIAS_MAP[normalizedName] ?? normalizedName;
}

/** Stored name: display label for canonical, or titleCase of canonical. */
function displayNameForCanonical(canonicalName: string): string {
  return CANONICAL_DISPLAY[canonicalName] ?? titleCaseRoomName(canonicalName);
}

/** Simple title case for room names. */
function titleCaseRoomName(name: string): string {
  return name
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .map((w) => (w.length ? w[0]!.toUpperCase() + w.slice(1).toLowerCase() : w))
    .join(" ");
}

/** Build map: normalized room name -> roomTypeId for matching. Exact normalized match only (high confidence). */
async function getRoomTypeNormalizedMap(): Promise<Map<string, string>> {
  const types = await prisma.roomType.findMany({
    where: { active: true },
    select: { id: true, name: true },
  });
  const map = new Map<string, string>();
  for (const t of types) {
    const key = normalizeRoomName(t.name);
    if (key && !map.has(key)) map.set(key, t.id);
  }
  return map;
}

export async function createRoomAction(projectId: string, formData: FormData): Promise<{ error?: string }> {
  await requireAdmin();
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return { error: "Project not found" };
  const name = (formData.get("name") as string)?.trim() ?? "";
  const scopeNarrative = (formData.get("scopeNarrative") as string)?.trim() ?? "";
  const maxOrder = await prisma.room
    .aggregate({ where: { projectId }, _max: { sortOrder: true } })
    .then((r) => r._max.sortOrder ?? -1);
  await prisma.room.create({
    data: {
      projectId,
      name: name || "Room",
      scopeNarrative,
      scopeSource: "MANUAL",
      scopeUpdatedAt: new Date(),
      sortOrder: maxOrder + 1,
    },
  });
  revalidatePath(`/admin/projects/${projectId}`);
  revalidatePath(`/admin/projects/${projectId}/preview`);
  return {};
}

export async function updateRoomAction(
  projectId: string,
  roomId: string,
  formData: FormData
): Promise<{ error?: string }> {
  await requireAdmin();
  const room = await prisma.room.findFirst({ where: { id: roomId, projectId } });
  if (!room) return { error: "Room not found" };
  const name = (formData.get("name") as string)?.trim() ?? "";
  const scopeNarrative = (formData.get("scopeNarrative") as string)?.trim() ?? "";
  await prisma.room.update({
    where: { id: roomId },
    data: {
      name: name || "Room",
      scopeNarrative,
      scopeSource: "MANUAL",
      scopeUpdatedAt: new Date(),
    },
  });
  revalidatePath(`/admin/projects/${projectId}`);
  revalidatePath(`/admin/projects/${projectId}/preview`);
  return {};
}

export async function updateRoomStylePresetAction(
  projectId: string,
  roomId: string,
  stylePresetId: string | null
): Promise<{ error?: string }> {
  await requireAdmin();
  const room = await prisma.room.findFirst({ where: { id: roomId, projectId } });
  if (!room) return { error: "Room not found" };
  if (stylePresetId) {
    const preset = await prisma.stylePreset.findUnique({ where: { id: stylePresetId } });
    if (!preset?.isActive) return { error: "Style preset not found or inactive" };
  }
  await prisma.room.update({
    where: { id: roomId },
    data: { stylePresetId },
  });
  revalidatePath(`/admin/projects/${projectId}`);
  revalidatePath(`/admin/projects/${projectId}/preview`);
  return {};
}

export async function deleteRoomAction(projectId: string, roomId: string): Promise<{ error?: string }> {
  await requireAdmin();
  const room = await prisma.room.findFirst({ where: { id: roomId, projectId } });
  if (!room) return { error: "Room not found" };
  await prisma.room.delete({ where: { id: roomId } });
  revalidatePath(`/admin/projects/${projectId}`);
  revalidatePath(`/admin/projects/${projectId}/preview`);
  return {};
}

export async function moveRoomOrderAction(
  projectId: string,
  roomId: string,
  direction: "up" | "down"
): Promise<{ error?: string }> {
  await requireAdmin();
  const room = await prisma.room.findFirst({ where: { id: roomId, projectId } });
  if (!room) return { error: "Room not found" };
  const list = await prisma.room.findMany({
    where: { projectId },
    orderBy: { sortOrder: "asc" },
    select: { id: true, sortOrder: true },
  });
  const idx = list.findIndex((r) => r.id === roomId);
  if (idx < 0) return { error: "Room not found" };
  const swapIdx = direction === "up" ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= list.length) return {};
  const other = list[swapIdx]!;
  await prisma.$transaction([
    prisma.room.update({ where: { id: roomId }, data: { sortOrder: other.sortOrder } }),
    prisma.room.update({ where: { id: other.id }, data: { sortOrder: room.sortOrder } }),
  ]);
  revalidatePath(`/admin/projects/${projectId}`);
  revalidatePath(`/admin/projects/${projectId}/preview`);
  return {};
}

export async function reorderRoomsAction(
  projectId: string,
  orderedIds: string[]
): Promise<{ error?: string }> {
  await requireAdmin();

  if (!orderedIds.length) {
    return {};
  }

  const rooms = await prisma.room.findMany({
    where: {
      projectId,
      id: { in: orderedIds },
    },
    select: { id: true },
  });

  // Validate all provided IDs belong to this project
  const validIds = new Set(rooms.map((r) => r.id));
  if (validIds.size !== orderedIds.length) {
    return { error: "Invalid room ids for this project." };
  }

  await prisma.$transaction(
    orderedIds.map((id, index) =>
      prisma.room.update({
        where: { id },
        data: { sortOrder: index },
      })
    )
  );

  revalidatePath(`/admin/projects/${projectId}`);
  revalidatePath(`/preview`);

  return {};
}

export async function generateRoomsFromTranscriptAction(projectId: string): Promise<{
  created: number;
  skipped: number;
  error?: string;
  unmatchedRooms?: UnmatchedRoomItem[];
}> {
  await requireAdmin();
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, transcriptText: true },
  });
  if (!project) {
    return { created: 0, skipped: 0, error: "Project not found." };
  }
  const transcriptText = project.transcriptText?.trim() ?? "";
  if (!transcriptText) {
    return { created: 0, skipped: 0, error: "No transcript available." };
  }

  let rooms: { name: string; scopeNarrative: string }[];
  try {
    const result = await extractRoomsFromTranscript(transcriptText);
    rooms = result.rooms ?? [];
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to extract rooms from transcript.";
    return { created: 0, skipped: 0, error: message };
  }

  const existing = await prisma.room.findMany({
    where: { projectId },
    select: { name: true },
  });
  const existingKeys = new Set(
    existing.map((r) => applyAlias(normalizeRoomNameForCompare(r.name), transcriptText))
  );
  const { _max } = await prisma.room.aggregate({
    where: { projectId },
    _max: { sortOrder: true },
  });
  const maxOrder = _max.sortOrder ?? -1;

  const roomTypeMap = await getRoomTypeNormalizedMap();
  const toCreate: { name: string; scopeNarrative: string; sortOrder: number; roomTypeId?: string }[] = [];
  let nextOrder = maxOrder + 1;
  let skipped = 0;

  for (const r of rooms) {
    const rawName = (r.name ?? "").trim();
    const scopeNarrative = (r.scopeNarrative ?? "").trim();
    if (!rawName || !scopeNarrative) {
      skipped++;
      continue;
    }
    const canonicalName = applyAlias(normalizeRoomNameForCompare(rawName), transcriptText);
    if (existingKeys.has(canonicalName)) {
      skipped++;
      continue;
    }
    existingKeys.add(canonicalName);
    const name = displayNameForCanonical(canonicalName);
    const normalizedForMatch = normalizeRoomName(name);
    const roomTypeId = normalizedForMatch ? roomTypeMap.get(normalizedForMatch) : undefined;
    toCreate.push({ name, scopeNarrative, sortOrder: nextOrder++, roomTypeId });
  }

  let unmatchedRooms: UnmatchedRoomItem[] = [];
  if (toCreate.length > 0) {
    const created = await prisma.room.createManyAndReturn({
      data: toCreate.map((row) => ({
        projectId,
        name: row.name,
        scopeNarrative: row.scopeNarrative,
        scopeSource: "AI",
        scopeUpdatedAt: new Date(),
        sortOrder: row.sortOrder,
        roomTypeId: row.roomTypeId ?? null,
      })),
    });
    const byName = new Map<string, string[]>();
    for (const room of created) {
      if (!room.roomTypeId) {
        const arr = byName.get(room.name) ?? [];
        arr.push(room.id);
        byName.set(room.name, arr);
      }
    }
    unmatchedRooms = [...byName.entries()].map(([name, roomIds]) => ({ name, roomIds }));
  }

  revalidatePath(`/admin/projects/${projectId}`);
  revalidatePath(`/admin/projects/${projectId}/preview`);
  return { created: toCreate.length, skipped, unmatchedRooms: unmatchedRooms.length > 0 ? unmatchedRooms : undefined };
}

export async function updateRoomScopesFromTranscriptAction(projectId: string): Promise<{
  created: number;
  updated: number;
  skipped: number;
  error?: string;
  unmatchedRooms?: UnmatchedRoomItem[];
}> {
  await requireAdmin();
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, transcriptText: true },
  });
  if (!project) {
    return { created: 0, updated: 0, skipped: 0, error: "Project not found." };
  }
  const transcriptText = project.transcriptText?.trim() ?? "";
  if (!transcriptText) {
    return { created: 0, updated: 0, skipped: 0, error: "No transcript available." };
  }

  let roomsFromAi: { name: string; scopeNarrative: string }[];
  try {
    const result = await extractRoomsFromTranscript(transcriptText);
    roomsFromAi = result.rooms ?? [];
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to extract rooms from transcript.";
    return { created: 0, updated: 0, skipped: 0, error: message };
  }

  const existingRooms = await prisma.room.findMany({
    where: { projectId },
    select: { id: true, name: true, sortOrder: true },
  });

  const canonicalToExisting = new Map<string, { id: string }>();
  for (const room of existingRooms) {
    const canonical = applyAlias(normalizeRoomNameForCompare(room.name), transcriptText);
    if (!canonicalToExisting.has(canonical)) {
      canonicalToExisting.set(canonical, { id: room.id });
    }
  }

  const { _max } = await prisma.room.aggregate({
    where: { projectId },
    _max: { sortOrder: true },
  });
  let nextOrder = (_max.sortOrder ?? -1) + 1;

  const roomTypeMap = await getRoomTypeNormalizedMap();
  const updateOps: Promise<unknown>[] = [];
  const toCreate: { name: string; scopeNarrative: string; sortOrder: number; roomTypeId?: string }[] = [];
  let updated = 0;
  let skipped = 0;
  const seenCanonicals = new Set<string>();

  for (const r of roomsFromAi) {
    const rawName = (r.name ?? "").trim();
    const scopeNarrative = (r.scopeNarrative ?? "").trim();
    if (!rawName || !scopeNarrative) {
      skipped++;
      continue;
    }

    const canonicalName = applyAlias(normalizeRoomNameForCompare(rawName), transcriptText);

    if (seenCanonicals.has(canonicalName)) {
      skipped++;
      continue;
    }
    seenCanonicals.add(canonicalName);

    const existing = canonicalToExisting.get(canonicalName);
    if (existing) {
      updateOps.push(
        prisma.room.update({
          where: { id: existing.id },
          data: {
            scopeNarrative,
            scopeSource: "AI",
            scopeUpdatedAt: new Date(),
          },
        })
      );
      updated++;
    } else {
      const name = displayNameForCanonical(canonicalName);
      const normalizedForMatch = normalizeRoomName(name);
      const roomTypeId = normalizedForMatch ? roomTypeMap.get(normalizedForMatch) : undefined;
      toCreate.push({ name, scopeNarrative, sortOrder: nextOrder++, roomTypeId });
    }
  }

  let unmatchedRooms: UnmatchedRoomItem[] = [];
  if (toCreate.length > 0) {
    const created = await prisma.room.createManyAndReturn({
      data: toCreate.map((row) => ({
        projectId,
        name: row.name,
        scopeNarrative: row.scopeNarrative,
        scopeSource: "AI",
        scopeUpdatedAt: new Date(),
        sortOrder: row.sortOrder,
        roomTypeId: row.roomTypeId ?? null,
      })),
    });
    const byName = new Map<string, string[]>();
    for (const room of created) {
      if (!room.roomTypeId) {
        const arr = byName.get(room.name) ?? [];
        arr.push(room.id);
        byName.set(room.name, arr);
      }
    }
    unmatchedRooms = [...byName.entries()].map(([name, roomIds]) => ({ name, roomIds }));
  }

  if (updateOps.length > 0) {
    await Promise.all(updateOps);
  }

  revalidatePath(`/admin/projects/${projectId}`);
  revalidatePath(`/admin/projects/${projectId}/preview`);
  return {
    created: toCreate.length,
    updated,
    skipped,
    unmatchedRooms: unmatchedRooms.length > 0 ? unmatchedRooms : undefined,
  };
}

export async function rewriteRoomScopeAction(
  projectId: string,
  roomId: string
): Promise<{ error?: string }> {
  await requireAdmin();
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { transcriptText: true },
  });
  if (!project) return { error: "Project not found." };
  const transcriptText = project.transcriptText?.trim() ?? "";
  if (!transcriptText) return { error: "No transcript available." };

  const room = await prisma.room.findFirst({
    where: { id: roomId, projectId },
    select: { id: true, name: true, scopeNarrative: true },
  });
  if (!room) return { error: "Room not found." };

  let newNarrative: string;
  try {
    newNarrative = await rewriteRoomScopeNarrative(
      transcriptText,
      room.name,
      room.scopeNarrative ?? ""
    );
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Failed to rewrite scope.";
    return { error: message };
  }

  await prisma.room.update({
    where: { id: roomId },
    data: {
      scopeNarrative: newNarrative,
      scopeSource: "AI",
      scopeUpdatedAt: new Date(),
    },
  });
  revalidatePath(`/admin/projects/${projectId}`);
  revalidatePath(`/admin/projects/${projectId}/preview`);
  return {};
}

/** Create a RoomType or return existing one (case-insensitive name). Enforces unique name. */
export async function createRoomType(name: string, exterior: boolean): Promise<{ roomTypeId?: string; error?: string }> {
  await requireAdmin();
  const trimmed = name?.trim() ?? "";
  if (!trimmed) return { error: "Name is required" };
  const normalized = normalizeRoomName(trimmed);
  const all = await prisma.roomType.findMany({ select: { id: true, name: true } });
  const existingByNorm = all.find((t) => normalizeRoomName(t.name) === normalized);
  if (existingByNorm) {
    return { roomTypeId: existingByNorm.id };
  }
  const maxOrder = await prisma.roomType.aggregate({ _max: { sortOrder: true } }).then((r) => r._max.sortOrder ?? -1);
  const created = await prisma.roomType.create({
    data: {
      name: trimmed,
      sortOrder: maxOrder + 1,
      active: true,
      exterior,
    },
  });
  revalidatePath("/admin/settings");
  revalidatePath("/admin/projects");
  return { roomTypeId: created.id };
}

/** Set roomTypeId on the given rooms. Pass null for roomTypeId to clear (Custom). */
export async function updateRoomsRoomType(
  roomIds: string[],
  roomTypeId: string | null
): Promise<{ error?: string }> {
  await requireAdmin();
  if (!roomIds.length) return {};
  await prisma.room.updateMany({
    where: { id: { in: roomIds } },
    data: { roomTypeId },
  });
  revalidatePath("/admin/projects");
  const project = await prisma.room.findFirst({
    where: { id: roomIds[0] },
    select: { projectId: true },
  });
  if (project) {
    revalidatePath(`/admin/projects/${project.projectId}`);
    revalidatePath(`/admin/projects/${project.projectId}/preview`);
  }
  return {};
}

export type NewRoomTypeResolution = {
  name: string;
  roomIds: string[];
  roomTypeId?: string;
  createNew?: { exterior: boolean };
};

/** Apply mappings/creates from the New Room Types modal. */
export async function bulkResolveNewRoomTypes(
  projectId: string,
  resolutions: NewRoomTypeResolution[]
): Promise<{ error?: string }> {
  await requireAdmin();
  for (const res of resolutions) {
    if (!res.roomIds.length) continue;
    let roomTypeId: string | undefined;
    if (res.roomTypeId) {
      roomTypeId = res.roomTypeId;
    } else if (res.createNew) {
      const out = await createRoomType(res.name, res.createNew.exterior);
      if (out.error) return { error: out.error };
      roomTypeId = out.roomTypeId;
    }
    if (roomTypeId) {
      await updateRoomsRoomType(res.roomIds, roomTypeId);
    }
  }
  revalidatePath(`/admin/projects/${projectId}`);
  revalidatePath(`/admin/projects/${projectId}/preview`);
  return {};
}
