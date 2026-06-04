import "server-only";
import { prisma } from "@/app/lib/prisma";
import { MediaType } from "@/app/generated/prisma";
import { generateRoomRendering } from "@/app/lib/gemini";
import { uploadBuffer } from "@/app/lib/s3";

/**
 * Auth-free core of the room before/after render, extracted from
 * startRoomRenderAction so it can run BOTH:
 *   - synchronously inside the admin action (Media tab "Render New"), and
 *   - inside the QStash background worker (/api/jobs/studio-render), which has
 *     no Clerk session and therefore can't call a requireAdmin server action.
 *
 * It does NOT create or update the Media row — the caller owns that DB
 * lifecycle (QUEUED → RENDERING → DONE/FAILED). This function only does the
 * prompt build + Gemini call + R2 upload and returns the result.
 *
 * NOTE: performs no authorization — callers must have already validated access.
 */

/**
 * Resolve effective style prompt for rendering: project-level preset only.
 * Returns null if no project preset; otherwise project.stylePreset.prompt.
 */
export function getEffectiveStylePromptForProject(project: {
  stylePresetId: string | null;
  stylePreset: { id: string; prompt: string } | null;
}): string | null {
  if (!project.stylePresetId || !project.stylePreset?.prompt) return null;
  return project.stylePreset.prompt.trim() || null;
}

/** Phrases that indicate non-visual / construction language; stripped before Gemini. */
const NON_VISUAL_PATTERNS = [
  /\bto\s+remain\b/i,
  /\bno\s+change\b/i,
  /\bno\s+work\b/i,
  /\bdemolition\b/i,
  /\bdemo\s/i,
  /\bprotect(?:ion)?\b/i,
  /\bclean-?up\b/i,
  /\bdebris\b/i,
  /\bhaul-?(?:off|away)\b/i,
  /\brough-?in\b/i,
  /\bsupply\s+line/i,
  /\bdrain\s+line/i,
  /\bp-?trap\b/i,
  /\bshut-?off\s+valve/i,
  /\bwater\s+supply\b/i,
  /\bwater\s+line\b/i,
  /\bwater\s+heater\b/i,
  /\breconnect\s+plumbing\b/i,
  /\bplumbing\s+(?:rough|connection|hook-?up|tie-?in|reroute|relocat)/i,
  /\bgas\s+line\b/i,
  /\bvent(?:ing)?\s+(?:pipe|stack|line)\b/i,
  /\belectrical\s+(?:rough|circuit|panel|wire|wiring|hook-?up|connection|service)\b/i,
  /\bjunction\s+box\b/i,
  /\bGFCI\b/i,
  /\bframing\b/i,
  /\bblocking\b/i,
  /\bsistering\b/i,
  /\bstructural\b/i,
  /\bsub-?floor\b/i,
  /\bjoist\b/i,
  /\bsubstrate\b/i,
  /\bwaterproofing\b/i,
  /\bmembrane\b/i,
  /\bunderlayment\b/i,
  /\bbacker\s*board\b/i,
  /\bdrywall\s+(?:repair|patch|tape|mud|finish|hang)\b/i,
  /\bskim\s+coat\b/i,
  /\bleveling\s+compound\b/i,
  /\bHVAC\b/i,
  /\bductwork\b/i,
  /\binsulation\b/i,
  /\bvapor\s+barrier\b/i,
  /\bpermit\b/i,
  /\binspection\b/i,
  /\bper\s+code\b/i,
  /\bcode\s+complian/i,
  /\b(?:as\s+)?required\b/i,
  /\b(?:as\s+)?specified\b/i,
  /\bto\s+be\s+performed\b/i,
  /\bper\s+manufacturer\b/i,
  /\binstallation\s+activities\b/i,
  /\bconstruction\s+impacts?\b/i,
  /\bdue\s+to\s+construction\b/i,
  /\bcoordinate\s+with\b/i,
  /\bfield\s+(?:verify|measure)\b/i,
  /\btouch-?up\s+(?:as\s+)?needed\b/i,
  /\bpaint\s+to\s+be\s+performed\b/i,
  /\bpunch\s*list\b/i,
  /\bfinal\s+clean\b/i,
  /\bcaulk(?:ing)?\b/i,
  /\bsealant\b/i,
  /\bshoring\b/i,
  /\bflashing\b/i,
  /\bas\s+needed\b/i,
];

/** Filter checklist items to prompt-safe visual actions only. */
export function filterChecklistToPromptSafeVisualActions(bullets: string[]): string[] {
  return bullets.filter((b) => {
    const t = b.trim();
    if (t.length < 4) return false;
    const lower = t.toLowerCase();
    return !NON_VISUAL_PATTERNS.some((re) => re.test(lower));
  });
}

/** Strip parenthetical/suffix metadata from a room name so Gemini doesn't infer unseen fixtures. */
export function sanitizeRoomNameForRender(roomName: string): string {
  if (!roomName?.trim()) return "";
  let s = roomName.trim();
  s = s.replace(/\s*\([^)]*\)\s*/g, " ").trim();
  s = s.replace(/\s*[-–—]\s*.*$/g, " ").trim();
  return s.replace(/\s+/g, " ").trim() || roomName.trim();
}

export type RenderRoomCoreResult = { publicUrl: string; fileKey: string; tags: string[] };

/**
 * Build the prompt, call Gemini, and upload the result to R2. No DB writes,
 * no auth. `checkedBullets` (when non-empty) restricts the remodel scope to
 * those prompt-safe visual actions; otherwise the room's full scope narrative
 * (+ project transcript) is used.
 */
export async function renderRoomCore(input: {
  projectId: string;
  roomId: string;
  sourceMediaId: string;
  createdMediaId: string;
  checkedBullets?: string[] | null;
}): Promise<RenderRoomCoreResult> {
  const { projectId, roomId, sourceMediaId, createdMediaId, checkedBullets } = input;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { stylePreset: { select: { id: true, name: true, prompt: true } } },
  });
  if (!project) throw new Error("Project not found");

  const room = await prisma.room.findFirst({ where: { id: roomId, projectId } });
  if (!room) throw new Error("Room not found");

  const sourceMedia = await prisma.media.findFirst({
    where: { id: sourceMediaId, projectId, roomId },
  });
  if (!sourceMedia) throw new Error("Source photo not found");
  if (sourceMedia.type !== MediaType.EXISTING) {
    throw new Error("Source must be an existing photo");
  }

  const stylePresetPrompt = getEffectiveStylePromptForProject(project) ?? "";
  const hasChecklistPayload =
    Array.isArray(checkedBullets) && checkedBullets.length > 0;
  const promptSafeBullets = hasChecklistPayload
    ? filterChecklistToPromptSafeVisualActions(checkedBullets as string[])
    : [];
  const roomNameForPrompt = sanitizeRoomNameForRender(room.name);
  const scopeNarrativeForPrompt = hasChecklistPayload
    ? promptSafeBullets.join(". ")
    : room.scopeNarrative ?? "";
  const transcriptTextForPrompt = hasChecklistPayload
    ? undefined
    : project.transcriptText ?? undefined;

  const { bytes, mimeType } = await generateRoomRendering({
    imageUrl: sourceMedia.url,
    roomName: roomNameForPrompt,
    scopeNarrative: scopeNarrativeForPrompt,
    transcriptText: transcriptTextForPrompt,
    stylePresetPrompt: stylePresetPrompt || undefined,
    promptVersion: 1,
  });

  const isJpeg = mimeType === "image/jpeg" || mimeType === "image/jpg";
  const ext = isJpeg ? "jpg" : "png";
  const contentType = isJpeg ? "image/jpeg" : "image/png";
  const fileKey = `projects/${projectId}/rooms/${roomId}/renderings/${createdMediaId}.${ext}`;
  const { publicUrl } = await uploadBuffer(fileKey, bytes, contentType);

  const tags = [
    "AI_RENDERED",
    ...(project.stylePreset?.name ? [`STYLE:${project.stylePreset.name}`] : []),
  ];
  return { publicUrl, fileKey, tags };
}
