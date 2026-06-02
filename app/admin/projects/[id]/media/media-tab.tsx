"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  getPresignedUploadUrlAction,
  createMediaAction,
  deleteMediaAction,
  updateMediaRoomAction,
  linkRenderingToBeforePhotoAction,
  startRoomRenderAction,
  setSelectedRenderAction,
  clearSelectedRenderAction,
  startRenderUpdateAction,
  createExtensionPairCodeAction,
  startDirectConnectionAction,
  getConnectionStatusAction,
  markConnectionFailedAction,
  extractRenderChecklistAction,
  cleanupOrphanedRenderingsAction,
  importRendrPhotosAction,
  setRenderCheckAction,
} from "./actions";
import { ChangesDetectedSummary } from "./changes-detected-summary";
import { FrontPageHeroEditor } from "./front-page-hero-editor";
import { LocalImportModal } from "./components/LocalImportModal";
import { PhoneUploadModal } from "./components/PhoneUploadModal";
import { MediaType } from "@/app/generated/prisma";
import { isBadPlaceholderUrl, isAllowedHostForNextImage } from "@/app/lib/media";
import {
  detectZillowConnectionReadiness,
  sendBeginHandshake,
  sendOpenZillowForAddress,
  type ZillowConnectionReadinessState,
  type DetectionResult,
} from "@/app/lib/zillow-extension-detection";

type MediaItem = {
  id: string;
  createdAt: Date | string;
  type: string;
  kind?: string;
  caption: string | null;
  tags: string[];
  roomId: string | null;
  url: string;
  /**
   * Optional 400px-wide WebP thumbnail (Phase 9 bulk local import).
   * UI prefers this for grid views; falls back to `url` when null
   * (legacy rows + thumbnail-generation failures).
   */
  thumbnailUrl?: string | null;
  sortOrder: number;
  room: { id: string; name: string } | null;
  fileKey?: string;
  sourceMediaId?: string | null;
  parentMediaId?: string | null;
  editInstruction?: string | null;
  renderStatus?: string | null;
  renderError?: string | null;
  placement?: string;
};

type RoomItem = {
  id: string;
  name: string;
  sortOrder: number;
  selectedRenderMediaId?: string | null;
  /** Room scope/renovation description; used to extract Render Changes bullets */
  scopeNarrative?: string | null;
  /**
   * Phase 10: itemText of every RoomRenderCheck row for this room.
   * Presence = checked. Hydrated from `Room.renderChecks` on page load.
   */
  checkedRenderItems?: string[];
};

type Props = {
  projectId: string;
  media: MediaItem[];
  rooms: RoomItem[];
  /** Project-level style preset (Sections tab); used for render label only */
  projectStylePreset?: { id: string; name: string } | null;
  /** Selected hero media id (project.coverHeroImageId); hero thumbnail uses this or type HERO */
  coverHeroImageId?: string | null;
  /** When opening via URL ?tab=media&roomId=..., preselect this room. */
  initialRoomId?: string;
  /** Project property address (Overview) for opening Zillow after direct handshake. */
  projectAddress?: string | null;
  /** Linked Rendr space id (Project.rendrSpaceId); when set, Rendr Photos section is available. */
  rendrSpaceId?: number | null;
};

export type UploadBatchResult = {
  successCount: number;
  failed: { name: string; error: string }[];
};

/** Upload multiple files sequentially; each file: get presigned URL -> PUT -> createMedia. Continues on per-file failure. */
async function uploadFiles(
  files: File[],
  opts: {
    projectId: string;
    type: typeof MediaType.EXISTING | typeof MediaType.RENDERING;
    roomId: string;
    onProgress?: (current: number, total: number) => void;
  }
): Promise<UploadBatchResult> {
  const failed: { name: string; error: string }[] = [];
  let successCount = 0;
  const total = files.length;
  for (let i = 0; i < files.length; i++) {
    opts.onProgress?.(i + 1, total);
    const file = files[i]!;
    try {
      const result = await getPresignedUploadUrlAction(
        opts.projectId,
        file.name,
        file.type || "application/octet-stream"
      );
      if ("error" in result) {
        failed.push({ name: file.name, error: result.error });
        continue;
      }
      const putRes = await fetch(result.uploadUrl, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type || "application/octet-stream" },
      });
      if (!putRes.ok) {
        failed.push({ name: file.name, error: "Upload failed: " + putRes.statusText });
        continue;
      }
      const formData = new FormData();
      formData.set("projectId", opts.projectId);
      formData.set("fileKey", result.fileKey);
      formData.set("url", result.publicUrl);
      formData.set("type", opts.type);
      formData.set("roomId", opts.roomId);
      const res = await createMediaAction(formData);
      if (res.error) {
        failed.push({ name: file.name, error: res.error });
      } else {
        successCount++;
      }
    } catch (e) {
      failed.push({
        name: file.name,
        error: e instanceof Error ? e.message : "Upload failed",
      });
    }
  }
  return { successCount, failed };
}

/** Legacy blob URLs (e.g. blob.vercel-storage.com) can trigger next/image remote host errors; render with plain <img> instead. */
function isLegacyBlobUrl(url: string): boolean {
  return url.includes("blob.vercel-storage.com");
}

// ---------------------------------------------------------------------------
// Phase 9.2 — time formatting helpers (batch labels + EXIF captions)
// ---------------------------------------------------------------------------

/**
 * Parse a Phase 9 batch id tag `batch-YYYYMMDD-HHmmss` (local time when
 * the LocalImportModal issued it) back into a Date. Returns null if the
 * tag doesn't match the format — defensive against hand-edited tags.
 */
function parseBatchIdToDate(batchId: string): Date | null {
  const m = batchId.match(/^batch-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})$/);
  if (!m) return null;
  const [, y, mo, d, hh, mm, ss] = m;
  // Construct in local time to match how LocalImportModal formatted it.
  const dt = new Date(
    Number(y),
    Number(mo) - 1,
    Number(d),
    Number(hh),
    Number(mm),
    Number(ss)
  );
  return Number.isNaN(dt.getTime()) ? null : dt;
}

/**
 * Human-readable relative/absolute date label. Used for both import-batch
 * dropdown options and per-photo EXIF captions.
 *
 * Styles:
 *   - "Today 2:47 PM"              (same calendar day)
 *   - "Yesterday 9:15 AM"          (one calendar day ago)
 *   - "Apr 20, 2:30 PM"            (earlier this year)
 *   - "Apr 20, 2025"               (older than this year — no time; archival)
 *
 * `mode: "batch"` forces time to always appear (batches include year+time
 * when older than yesterday for precision; a user might run two imports
 * the same day so the time is the distinguishing bit).
 */
function formatTimestamp(d: Date, mode: "photo" | "batch" = "photo"): string {
  const now = new Date();
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return `Today ${time}`;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return `Yesterday ${time}`;
  const sameYear = d.getFullYear() === now.getFullYear();
  if (sameYear) {
    const dateStr = d.toLocaleDateString([], { month: "short", day: "numeric" });
    return `${dateStr}, ${time}`;
  }
  // Older than this year.
  const dateStr = d.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return mode === "batch" ? `${dateStr} ${time}` : dateStr;
}

/**
 * Treat Media.sortOrder as a unix-seconds EXIF capture timestamp when it
 * falls in a plausible range, otherwise null. Phase 9 local imports
 * populate sortOrder with `Math.floor(ms / 1000)`; Zillow and legacy
 * uploads use small integers for display ordering, which we filter out.
 *
 * Lower bound: 10^9 (2001-09-09) — any image with EXIF "taken" before
 * then probably isn't a real photo walkthrough. Upper bound: now + 1 day
 * to tolerate tiny clock skew.
 */
function exifTimestampFromSortOrder(sortOrder: number): Date | null {
  if (!Number.isFinite(sortOrder)) return null;
  const MIN_EPOCH_SEC = 1_000_000_000;
  const MAX_EPOCH_SEC = Math.floor(Date.now() / 1000) + 86_400;
  if (sortOrder < MIN_EPOCH_SEC || sortOrder > MAX_EPOCH_SEC) return null;
  const d = new Date(sortOrder * 1000);
  return Number.isNaN(d.getTime()) ? null : d;
}

const POLL_INTERVAL_MS = 7000;
/** Poll interval for direct connection status (Zillow extension handshake). */
const DIRECT_CONNECTION_POLL_MS = 2000;
/** Stop polling after this long when waiting for extension to verify. */
const DIRECT_CONNECTION_TIMEOUT_MS = 3 * 60 * 1000;
export const FRONT_PAGE_ID = "__front_page__";
/** Pseudo-section id for the Zillow import staging page (not a real room). */
export const ZILLOW_IMPORT_ID = "__zillow_import__";
/** Pseudo-section id for generic unassigned photos (not Zillow-tagged). */
export const UNASSIGNED_PHOTOS_ID = "__unassigned_photos__";
/** Tag used to mark media imported from Zillow; Phase 4 import flow should set this. */
export const ZILLOW_IMPORT_TAG = "zillow";
/** Pseudo-section id for the Rendr Photos staging page (not a real room). */
export const RENDR_PHOTOS_ID = "__rendr_photos__";
/** Tag used to mark media imported from Rendr. Each imported item also gets `rendr-photo:<photoId>`. */
export const RENDR_IMPORT_TAG = "rendr";
/** Prefix used on tags to record the original Rendr photo id, so we can detect re-imports. */
export const RENDR_PHOTO_TAG_PREFIX = "rendr-photo:";

/** When set (e.g. Chrome Web Store or Edge Add-ons URL), "Install Extension" opens this; otherwise dev: "Open Chrome Extensions" → chrome://extensions. Production TODO: set NEXT_PUBLIC_ZILLOW_EXTENSION_STORE_URL to store listing URL. */
const ZILLOW_EXTENSION_STORE_URL = typeof process !== "undefined" ? process.env.NEXT_PUBLIC_ZILLOW_EXTENSION_STORE_URL ?? null : null;

/**
 * Phase 10: per-room checked-state cache mirroring RoomRenderCheck rows from the DB.
 * `checked[bullet] === true` = a RoomRenderCheck row exists for this (room, bullet).
 * Hydrated from `RoomItem.checkedRenderItems` on mount + when rooms prop changes.
 * Writes flow through setRenderCheckAction (single-toggle); no localStorage.
 */
export type RenderChangesChecklistState = {
  checked: Record<string, boolean>;
};

/**
 * @deprecated — rendering checklist now uses AI extraction (extractRenderChecklistAction).
 * Extract raw scope fragments (bullets/phrases) from the CURRENT ROOM's scope only.
 * Used as input for normalizeRemodelBullets. Do NOT pass full project transcript.
 */
function extractRemodelBullets(roomScopeOnly: string): string[] {
  const raw = roomScopeOnly?.trim() ?? "";
  if (!raw) return [];

  // Separate base scope from AI Review clarifications section.
  // The clarifications section has Q&A lines like "- Question?: Answer".
  // We extract ONLY the answer portions — those contain real scope details.
  const clarificationsMarker = "--- Scope Clarifications";
  const markerIdx = raw.indexOf(clarificationsMarker);
  const baseScope = markerIdx !== -1 ? raw.slice(0, markerIdx).trim() : raw;
  const clarificationsBlock = markerIdx !== -1 ? raw.slice(markerIdx) : "";

  // Extract answer portions from "- Question?: Answer" lines
  const clarificationAnswers: string[] = [];
  if (clarificationsBlock) {
    for (const line of clarificationsBlock.split("\n")) {
      // Match "- Some question?: Some answer" — grab only the answer after "?: "
      const qaMatch = line.match(/^-\s*.+\?:\s*(.+)$/);
      if (qaMatch) {
        const answer = qaMatch[1].trim();
        // Only keep answers that describe something visual (not just "Yes", "No", "8 ft", "2", etc.)
        if (answer.length > 10 && !/^\d+(\.\d+)?\s*(ft|sf|lf|inches|count)?$/i.test(answer) && !/^(yes|no)$/i.test(answer)) {
          clarificationAnswers.push(answer);
        }
      }
    }
  }

  const splitByDelimiters = (text: string): string[] => {
    return text
      .split(/\n+|;\s*|\s+and\s+|(?:\s+[-–—]\s+)/)
      .map((s) => s.replace(/^[\s•*\-–—.]+\s*|\s*[\s•*\-–—.]+\s*$/g, "").trim())
      .filter((s) => s.length > 0);
  };

  // Combine base scope fragments + clarification answers
  const phrases = [...splitByDelimiters(baseScope), ...clarificationAnswers];
  const rawFragments: string[] = [];
  const seen = new Set<string>();

  for (const p of phrases) {
    const parts = p.split(/,(?=\s*(?:replace|install|add|remove|update|change|paint|refinish|upgrade|new))/i);
    for (let part of parts) {
      part = part.trim();
      if (part.length < 2) continue;
      const lower = part.toLowerCase();
      const key = lower.slice(0, 80);
      if (seen.has(key)) continue;
      seen.add(key);
      rawFragments.push(part.charAt(0).toLowerCase() + part.slice(1));
    }
  }

  return rawFragments;
}

/** Non-visual / construction-only phrases to exclude from the checklist.
 *  Only items you would SEE in a finished photo belong on the checklist.
 *  Everything below is invisible in a rendering (behind walls, under floors, procedural). */
const NON_VISUAL_PATTERNS = [
  // --- status-quo / no-work indicators ---
  /\bto\s+remain\b/i,
  /\bexisting\s+to\s+remain\b/i,
  /\bcomponents?\s+to\s+remain\b/i,
  /\ball\s+other\s+.*\s+remain\b/i,
  /\bno\s+change\b/i,
  /\bno\s+work\b/i,
  /\bremove\s*$/i, // bare "Remove" with no object

  // --- demolition & protection ---
  /\bdemolition\b/i,
  /\bdemo\s/i, // "demo work" but not "demonstrate"
  /\bprotect(?:ion)?\b/i,
  /\bclean-?up\b/i,
  /\bdust\s+barrier\b/i,
  /\bdebris\b/i,
  /\bhaul-?(?:off|away)\b/i,
  /\bdumpster\b/i,

  // --- plumbing (behind-wall) ---
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

  // --- electrical (behind-wall) ---
  /\belectrical\s+(?:rough|circuit|panel|wire|wiring|hook-?up|connection|service)\b/i,
  /\bjunction\s+box\b/i,
  /\bcircuit\s+breaker\b/i,
  /\bwire\s+(?:run|pull)\b/i,
  /\bamp\s+service\b/i,
  /\bGFCI\b/i,
  /\barc[- ]?fault\b/i,

  // --- structural / framing ---
  /\bframing\b/i,
  /\bblocking\b/i,
  /\bsistering\b/i,
  /\bload[- ]?bearing\b/i,
  /\bstructural\b/i,
  /\bsub-?floor\b/i,
  /\bjoist\b/i,

  // --- substrate / prep ---
  /\bsubstrate\b/i,
  /\bwaterproofing\b/i,
  /\bmembrane\b/i,
  /\bunderlayment\b/i,
  /\bconcrete\s+board\b/i,
  /\bbacker\s*board\b/i,
  /\bcement\s+board\b/i,
  /\bdrywall\s+(?:repair|patch|tape|mud|finish|hang)\b/i,
  /\bskim\s+coat\b/i,
  /\bleveling\s+compound\b/i,
  /\bfurring\s+strip\b/i,
  /\bshim(?:s|ming)?\b/i,

  // --- HVAC / mechanical ---
  /\bHVAC\b/i,
  /\bductwork\b/i,
  /\bduct\s+(?:run|routing)\b/i,
  /\brefrigerant\b/i,
  /\bcondensate\b/i,

  // --- insulation ---
  /\binsulation\b/i,
  /\bvapor\s+barrier\b/i,
  /\bfire\s*(?:stop|block|caulk)\b/i,

  // --- permits / inspections / code ---
  /\bpermit\b/i,
  /\binspection\b/i,
  /\bper\s+code\b/i,
  /\bcode\s+complian/i,
  /\bas\s+required\b/i,
  /\b(?:as\s+)?specified\b/i,
  /\bto\s+be\s+performed\b/i,
  /\bper\s+manufacturer\b/i,

  // --- procedural / labor descriptions ---
  /\binstallation\s+activities\b/i,
  /\bconstruction\s+impacts?\b/i,
  /\bdue\s+to\s+construction\b/i,
  /\bcoordinate\s+with\b/i,
  /\bfield\s+(?:verify|measure)\b/i,
  /\btouch-?up\s+(?:as\s+)?needed\b/i,
  /\btouch-?up\s+due\s+to\b/i,
  /\bpaint\s+to\s+be\s+performed\b/i,
  /\btemporary\b/i,
  /\bpunch\s*list\b/i,
  /\bfinal\s+clean\b/i,

  // --- caulk / sealant (prep, not visible finish) ---
  /\bcaulk(?:ing)?\b/i,
  /\bsealant\b/i,
  /\bgrout\s+seal/i,

  // --- misc behind-the-scenes ---
  /\bshoring\b/i,
  /\bbracing\b/i,
  /\banchoring\b/i,
  /\bfastener/i,
  /\blag\s+bolt/i,
  /\bflashing\b/i,

  // --- ventilation / exhaust (mechanical, not visible finish) ---
  /\bventilation\s+system\b/i,
  /\bPanasonic\b/i, // brand name for mechanical spec, not visual
  /\bwhisper\b/i, // Panasonic Whisper fan model name

  // --- AI review question residue (safety net — extractor strips most of these) ---
  /\?\s*:/i, // "Question?: Answer" format leftover
  /^scope\s+clarification/i,
];

/** Incomplete fragments (single word or too short) that should be dropped unless we expand them. */
const INCOMPLETE_FRAGMENTS = new Set([
  "remove",
  "backsplash",
  "installation activities",
  "installation",
  "activities",
  "flooring",
  "plumbing",
  "electrical",
  "code",
  "required",
  "specified",
  "touch-up",
  "demolition",
  "waterproofing",
  "rough-in",
  "framing",
  "insulation",
  "wiring",
  "ductwork",
  "substrate",
  "permit",
  "inspection",
  "debris",
  "protection",
  "cleanup",
  "caulking",
  "sealant",
]);

/** Map fragment (lowercase) or short phrase to a clear visible action. */
const FRAGMENT_TO_ACTION: Record<string, string> = {
  backsplash: "Install tile backsplash",
  "tile backsplash": "Install tile backsplash",
  countertop: "Replace countertop",
  "countertops": "Replace countertops",
  vanity: "Replace vanity",
  "vanity cabinet": "Replace vanity",
  faucet: "Replace faucet",
  "faucets": "Replace faucets",
  sink: "Install sink",
  "laundry sink": "Install laundry sink",
  "kitchen sink": "Replace kitchen sink",
  tub: "Replace tub",
  shower: "Replace shower",
  "walk-in shower": "Install walk-in shower",
  "tiled shower": "Install tiled shower",
  flooring: "Install new flooring",
  "flooring in place": "Install new flooring",
  "floor tile": "Install floor tile",
  paint: "Paint walls",
  "paint walls": "Paint walls",
  "paint touch-up": "Paint touch-up as needed",
  "wall paint": "Paint walls",
  "light fixtures": "Update light fixtures",
  "lighting": "Update lighting",
  "cabinet": "Replace cabinets",
  "cabinets": "Replace cabinets",
  toilet: "Replace toilet",
  "mirror": "Install mirror",
  "hardware": "Replace hardware",
  "freestanding tub": "Install freestanding tub",
  "soaking tub": "Install freestanding soaking tub",
  "freestanding soaking tub": "Install freestanding soaking tub",
  "wall tile": "Install wall tile",
  "floor-to-ceiling tile": "Install floor-to-ceiling tile",
  "door casing": "Install door casing",
  "crown molding": "Install crown molding",
  "baseboards": "Install baseboards",
  "wainscoting": "Install wainscoting",
  "accent wall": "Install accent wall",
  "shower door": "Install shower door",
  "glass enclosure": "Install glass enclosure",
  "niche": "Install shower niche",
  "shower niche": "Install shower niche",
  "bench": "Install shower bench",
  "shower bench": "Install shower bench",
};

/**
 * Normalize raw scope fragments into clear, short remodel actions suitable for checkboxes and the render prompt.
 * - Drops non-visual construction phrases and incomplete fragments.
 * - Converts references like "Backsplash" into "Install tile backsplash".
 * - Keeps bullets short (3–6 words); removes duplicates.
 */
function normalizeRemodelBullets(rawBullets: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();

  for (let raw of rawBullets) {
    raw = raw.trim();
    if (!raw) continue;
    const lower = raw.toLowerCase();

    // Drop if matches non-visual construction language
    if (NON_VISUAL_PATTERNS.some((re) => re.test(lower))) continue;

    // Drop fragments that are clearly truncated mid-sentence (end with dangling articles/conjunctions)
    if (/\b(?:the|a|an)\s*$/i.test(raw)) continue;
    // Drop items that are just "Configuration" or similar section headers with no action
    if (/^(?:configuration|specifications?|options?|notes?|scope\s+clarifications?)$/i.test(lower)) continue;

    const words = lower.split(/\s+/).filter(Boolean);
    // Drop standalone incomplete fragments that we don't have an expansion for (e.g. "Remove", "Installation activities")
    const normalizedLower = lower.replace(/\s+/g, " ").trim();
    const hasExpansion = FRAGMENT_TO_ACTION[normalizedLower] ?? FRAGMENT_TO_ACTION[words[0] ?? ""];
    if (words.length <= 1 && INCOMPLETE_FRAGMENTS.has(lower) && !hasExpansion) continue;
    if (words.length === 1 && raw.length < 8 && !hasExpansion) continue; // e.g. "Remove" without expansion

    // Convert known fragment to clear action
    let action: string | undefined =
      FRAGMENT_TO_ACTION[normalizedLower] ??
      FRAGMENT_TO_ACTION[words[0] ?? ""] ??
      (words.length >= 2 ? FRAGMENT_TO_ACTION[words.slice(0, 2).join(" ")] : undefined);

    if (!action) {
      // Already looks like an action (starts with verb) or is a short phrase
      const hasVerb = /^(replace|install|add|update|paint|refinish|upgrade|remove)\s+/i.test(raw);
      if (hasVerb) {
        action = raw
          .replace(/\s+\([^)]*\)/g, "")
          .replace(/\s+as\s+required\.?$/gi, "")
          .replace(/\s+per\s+code\.?$/gi, "")
          .replace(/\s+/g, " ")
          .trim();
      } else {
        // Fragment references a visible item: prefix with Install or Replace
        if (/\b(backsplash|tile|shower|sink|vanity|countertop|faucet|toilet|mirror|cabinet|flooring|paint)\b/i.test(raw)) {
          action = raw.replace(/\s+\([^)]*\)/g, "").replace(/\s+/g, " ").trim();
          if (!/^(install|replace|add|paint|update)\s+/i.test(action)) {
            action = /backsplash|tile|shower|sink|vanity|countertop|faucet|toilet|mirror/i.test(action)
              ? `Install ${action}`
              : `Replace ${action}`;
          }
        } else {
          action = raw.replace(/\s+\([^)]*\)/g, "").replace(/\s+/g, " ").trim();
        }
      }
    }

    if (!action || action.length < 5) continue;

    // Trim to ~3–6 words for display and prompt
    const actionWords = action.split(/\s+/).filter(Boolean);
    const trimmed = actionWords.length > 6 ? actionWords.slice(0, 6).join(" ") : action;

    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed.charAt(0).toUpperCase() + trimmed.slice(1));
  }

  return out;
}

/**
 * Convert raw extracted bullet text into a short, user-friendly display label for the checklist UI.
 * Raw text is preserved for state/key and for the render prompt; this is for readability only.
 */
function normalizeChecklistDisplayLabel(raw: string): string {
  const t = raw.trim();
  if (!t) return t;
  const lower = t.toLowerCase();
  // Remain / keep-unchanged phrasing → single clear label
  if (/\ball other .* (?:to )?remain\b/i.test(lower) || /\bcomponents? to remain\b/i.test(lower)) {
    return "Keep remaining visible elements unchanged";
  }
  if (/\b(?:existing )?(?:bathroom |room )?components? to remain\b/i.test(lower)) {
    return "Keep remaining visible elements unchanged";
  }
  // "X), with paint to be performed as needed" or "light fixtures), with paint..."
  if (/\), with paint .*$/i.test(t)) {
    return "Paint as needed";
  }
  if (/light fixtures\).*$/i.test(t)) {
    return "Update light fixtures";
  }
  // "constructing a new tiled shower with new waterproofing as required" → "Install new tiled shower"
  let out = t
    .replace(/^\s*constructing\s+(?:a\s+)?new\s+/i, "Install new ")
    .replace(/\s+with\s+new\s+waterproofing\s+as\s+required\.?$/i, "")
    .replace(/\s+as\s+required\.?$/gi, "")
    .replace(/\s+due\s+to\s+construction\s+impacts\.?$/gi, "")
    .replace(/\s+to\s+be\s+performed\s+as\s+needed\.?$/gi, "")
    .replace(/\s+\([^)]*\)\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (out.length > 60) out = out.slice(0, 57) + "…";
  return out.charAt(0).toUpperCase() + out.slice(1);
}

/** Resolve root id by walking parentMediaId; if parent missing, return self (orphan). */
function resolveRootId(byId: Map<string, MediaItem>, item: MediaItem): string {
  if (!item.parentMediaId) return item.id;
  const parent = byId.get(item.parentMediaId);
  return parent ? resolveRootId(byId, parent) : item.id;
}

/** Group renders by root (parentMediaId null). Children have parentMediaId === root.id. Orphan children become their own root. */
function buildRenderGroups(
  items: MediaItem[],
  sourceMediaId: string | null
): { rootId: string; root: MediaItem; children: MediaItem[]; allInOrder: MediaItem[] }[] {
  if (!sourceMediaId || !items.length) return [];
  const bySource = items.filter((m) => m.sourceMediaId === sourceMediaId);
  const byId = new Map(bySource.map((m) => [m.id, m]));
  const rootIds = new Set<string>();
  for (const m of bySource) {
    if (m.parentMediaId == null) rootIds.add(m.id);
  }
  for (const m of bySource) {
    if (m.parentMediaId != null) {
      const rid = resolveRootId(byId, m);
      if (!rootIds.has(rid)) rootIds.add(m.id);
    }
  }
  const roots = bySource.filter((m) => rootIds.has(m.id));
  const sortByOrder = (a: MediaItem, b: MediaItem) =>
    a.sortOrder - b.sortOrder || new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  roots.sort(sortByOrder);
  const groups: { rootId: string; root: MediaItem; children: MediaItem[]; allInOrder: MediaItem[] }[] = [];
  for (const root of roots) {
    const rootId = root.id;
    const children = bySource.filter((m) => m.parentMediaId === rootId).sort(sortByOrder);
    const allInOrder = [root, ...children];
    groups.push({ rootId, root, children, allInOrder });
  }
  return groups;
}

type ConceptGroup = {
  rootId: string;
  root: MediaItem;
  children: MediaItem[];
  allInOrder: MediaItem[];
  conceptIndex: number;
  conceptLabel: string;
  versions: MediaItem[];
};

const CONCEPT_LABELS = ["Concept A", "Concept B", "Concept C"] as const;

/** Map render groups to concept groups with stable labels (by createdAt/sortOrder). */
function buildConceptGroups(
  groups: { rootId: string; root: MediaItem; children: MediaItem[]; allInOrder: MediaItem[] }[]
): ConceptGroup[] {
  return groups.map((g, i) => ({
    ...g,
    conceptIndex: i,
    conceptLabel: CONCEPT_LABELS[i] ?? `Concept ${i + 1}`,
    versions: g.allInOrder,
  }));
}

/** Version label within a concept: root = v1, updates = v1.1, v1.2, v1.3. */
function getVersionLabel(group: ConceptGroup, media: MediaItem): string {
  if (media.id === group.root.id) return "v1";
  const idx = group.children.findIndex((c) => c.id === media.id);
  return idx >= 0 ? `v1.${idx + 1}` : "v1";
}

/** UI-only: treat missing status as DONE when url is present so completed renders allow Set Selected / Update. */
function getNormalizedRenderStatus(render: MediaItem): string {
  return render.renderStatus ?? (render.url ? "DONE" : "PENDING");
}

/** Tooltip lines for a render thumbnail. */
function getThumbnailTooltip(media: MediaItem, group: ConceptGroup, parentLabel: string): string {
  const lines: string[] = [];
  const created = new Date(media.createdAt);
  lines.push(`Created: ${created.toLocaleString()}`);
  if (media.parentMediaId) {
    lines.push(parentLabel);
  }
  if (media.editInstruction?.trim()) {
    lines.push(`Instruction: ${media.editInstruction.trim().slice(0, 120)}${media.editInstruction.length > 120 ? "…" : ""}`);
  }
  if (media.renderStatus === "FAILED" && media.renderError?.trim()) {
    lines.push(`Error: ${media.renderError.trim().slice(0, 120)}${media.renderError.length > 120 ? "…" : ""}`);
  }
  return lines.join("\n");
}

/** Latest DONE in list by createdAt (uses normalized status so url-without-status counts as DONE). */
function latestDone(items: MediaItem[]): MediaItem | null {
  const done = items.filter((m) => getNormalizedRenderStatus(m) === "DONE");
  if (!done.length) return null;
  return done.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0] ?? null;
}

export function MediaTab({
  projectId,
  media,
  rooms,
  projectStylePreset = null,
  coverHeroImageId = null,
  initialRoomId,
  projectAddress = null,
  rendrSpaceId = null,
}: Props) {
  const router = useRouter();
  const roomIds = new Set(rooms.map((r) => r.id));
  const validInitialRoomId =
    initialRoomId && roomIds.has(initialRoomId) ? initialRoomId : null;
  const [activeRoomId, setActiveRoomId] = useState<string | null>(
    validInitialRoomId ?? FRONT_PAGE_ID
  );
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadResult, setUploadResult] = useState<UploadBatchResult | null>(null);
  /** Phase 9: Bulk Local Media Import modal open state. */
  const [localImportOpen, setLocalImportOpen] = useState(false);
  const [phoneUploadOpen, setPhoneUploadOpen] = useState(false);
  const [activeSourceMediaId, setActiveSourceMediaId] = useState<string | null>(null);
  const [activeRenderMediaId, setActiveRenderMediaId] = useState<string | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [rendering, setRendering] = useState(false);
  const [updateModalRenderId, setUpdateModalRenderId] = useState<string | null>(null);
  const [updateInstruction, setUpdateInstruction] = useState("");
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [updateSubmitting, setUpdateSubmitting] = useState(false);
  /** Optimistic placeholder media for just-queued update renders (until server data arrives). */
  const [optimisticRenderMedia, setOptimisticRenderMedia] = useState<MediaItem[]>([]);
  /** Per-room checked-state cache; hydrated from RoomRenderCheck rows (Phase 10). */
  const [renderChangesChecklistByRoom, setRenderChangesChecklistByRoom] = useState<Record<string, RenderChangesChecklistState>>({});
  /** Custom change for first render: when checked and has text, appended to render bullets. */
  const [customChangeEnabled, setCustomChangeEnabled] = useState(false);
  const [customChangeText, setCustomChangeText] = useState("");
  /** Loading state for Existing Photos grid actions (Remove from Section / Delete). */
  const [existingPhotoAction, setExistingPhotoAction] = useState<"idle" | "remove" | "delete">("idle");
  /** Zillow Import pair code modal. */
  const [zillowImportModalOpen, setZillowImportModalOpen] = useState(false);
  const [pairCode, setPairCode] = useState<string | null>(null);
  const [pairCodeExpiresAt, setPairCodeExpiresAt] = useState<Date | null>(null);
  const [pairCodeLoading, setPairCodeLoading] = useState(false);
  const [pairCodeError, setPairCodeError] = useState<string | null>(null);
  /** Direct browser connection (nonce handshake). */
  const [directSessionId, setDirectSessionId] = useState<string | null>(null);
  const [directNonce, setDirectNonce] = useState<string | null>(null);
  const [directStatus, setDirectStatus] = useState<"idle" | "connecting" | "connected" | "failed" | "expired">("idle");
  const [directError, setDirectError] = useState<string | null>(null);
  const [showManualFallback, setShowManualFallback] = useState(false);
  /** Zillow Import: compatibility and extension detection before connection. */
  const [zillowDetectionStatus, setZillowDetectionStatus] = useState<"idle" | "detecting" | "done">("idle");
  const [zillowReadinessState, setZillowReadinessState] = useState<ZillowConnectionReadinessState | null>(null);
  const [zillowDetectionMessage, setZillowDetectionMessage] = useState<string | null>(null);
  const [zillowDetectionDetail, setZillowDetectionDetail] = useState<DetectionResult | null>(null);
  /** Bulk selection on Unassigned Photos page (generic, non-Zillow). */
  const [selectedGenericUnassignedIds, setSelectedGenericUnassignedIds] = useState<Set<string>>(new Set());
  const [genericUnassignedAssignRoomId, setGenericUnassignedAssignRoomId] = useState("");
  const [genericUnassignedAssigning, setGenericUnassignedAssigning] = useState(false);
  /**
   * Phase 9.2: filter the Unassigned Photos grid by import batch tag.
   * Value is "all" (default), "untagged" (no batch tag), or a literal
   * `batch-YYYYMMDD-HHmmss` tag from a Phase 9 local-import batch.
   */
  const [unassignedBatchFilter, setUnassignedBatchFilter] = useState<string>("all");
  /** Bulk selection on Imported from Zillow page. */
  const [selectedZillowIds, setSelectedZillowIds] = useState<Set<string>>(new Set());
  const [zillowAssignRoomId, setZillowAssignRoomId] = useState("");
  const [zillowAssigning, setZillowAssigning] = useState(false);
  /** Rendr Photos page: list of photos for the project's linked Rendr space, selection, and assignment. */
  const [rendrPhotos, setRendrPhotos] = useState<
    { id: string; created?: string; space_photo_thumbnail_url?: string }[]
  >([]);
  const [rendrPhotosLoading, setRendrPhotosLoading] = useState(false);
  const [rendrPhotosError, setRendrPhotosError] = useState<string | null>(null);
  const [rendrPhotosLoaded, setRendrPhotosLoaded] = useState(false);
  const [selectedRendrPhotoIds, setSelectedRendrPhotoIds] = useState<Set<string>>(new Set());
  const [rendrAssignRoomId, setRendrAssignRoomId] = useState("");
  const [rendrImporting, setRendrImporting] = useState(false);
  const [rendrImportResult, setRendrImportResult] = useState<string | null>(null);

  /** Ref: have we already tried to start direct connection this modal open (avoid double-run). */
  const directStartAttemptedRef = useRef(false);
  /** Ref: have we already started detection this modal open (avoid double-run and effect cleanup cancelling the promise). */
  const zillowDetectionStartedRef = useRef(false);
  /** Ref: have we already sent openZillowForAddress this connection success (avoid opening multiple tabs). */
  const openedZillowForAddressRef = useRef(false);

  // When Zillow Import modal opens, run compatibility/extension detection once.
  // Use a ref (not zillowDetectionStatus) in the guard so that when we set "detecting", this effect does not re-run and its cleanup does not set cancelled=true (which would prevent setZillowDetectionStatus("done") from ever running).
  useEffect(() => {
    if (!zillowImportModalOpen) return;
    if (zillowDetectionStartedRef.current) return;
    zillowDetectionStartedRef.current = true;
    setZillowDetectionStatus("detecting");
    let cancelled = false;
    const debug = typeof window !== "undefined" && window.localStorage?.getItem("zillowImportDebug") === "true";
    console.log("[Zillow detection] starting");
    detectZillowConnectionReadiness({
      pingTimeoutMs: 2500,
      capabilitiesTimeoutMs: 2500,
      debug: !!debug,
    }).then((result) => {
      if (cancelled) {
        console.log("[Zillow detection] cancelled, skipping setState");
        return;
      }
      setZillowReadinessState(result.state);
      setZillowDetectionMessage(result.message ?? null);
      setZillowDetectionDetail(result);
      setZillowDetectionStatus("done");
      console.log("[Zillow detection] setZillowDetectionStatus('done') executed", result.state);
    });
    return () => {
      cancelled = true;
    };
  }, [zillowImportModalOpen]);

  // When detection is done and state is supportedDirectHandshakeReady, start direct connection once (feature-flagged on server).
  useEffect(() => {
    if (!zillowImportModalOpen || zillowDetectionStatus !== "done" || zillowReadinessState !== "supportedDirectHandshakeReady") return;
    if (directStartAttemptedRef.current) return;
    directStartAttemptedRef.current = true;
    let cancelled = false;
    (async () => {
      console.log("[Zillow direct] starting direct handshake");
      const result = await startDirectConnectionAction(projectId);
      if (cancelled) return;
      console.log("[Zillow direct] session creation result", "error" in result ? result : { sessionId: result.sessionId, hasNonce: !!result.nonce });
      if ("error" in result) {
        setShowManualFallback(true);
        setDirectError(result.error);
        return;
      }
      setDirectSessionId(result.sessionId);
      setDirectNonce(result.nonce);
      setDirectStatus("connecting");
      console.log("[Zillow direct] handshake request sent to extension");
      sendBeginHandshake(result.nonce, result.sessionId).then((handshakeResponse) => {
        if (cancelled) return;
        console.log("[Zillow direct] beginHandshake response from extension", handshakeResponse);
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [zillowImportModalOpen, zillowDetectionStatus, zillowReadinessState, projectId]);

  // After direct handshake success, open Zillow in a new tab with project address (if available).
  useEffect(() => {
    if (directStatus !== "connected") return;
    if (openedZillowForAddressRef.current) return;
    const address = typeof projectAddress === "string" ? projectAddress.trim() : "";
    if (!address) return;
    openedZillowForAddressRef.current = true;
    console.log("[Zillow direct] address found", address);
    sendOpenZillowForAddress(address).then((res) => {
      console.log("[Zillow direct] openZillowForAddress sent", res);
    });
  }, [directStatus, projectAddress]);

  // Poll connection status while waiting for extension to verify.
  useEffect(() => {
    if (directStatus !== "connecting" || !directSessionId) return;
    const startedAt = Date.now();
    const intervalId = setInterval(async () => {
      if (Date.now() - startedAt > DIRECT_CONNECTION_TIMEOUT_MS) {
        setDirectStatus("failed");
        setShowManualFallback(true);
        return;
      }
      const result = await getConnectionStatusAction(directSessionId);
      if ("error" in result) return;
      if (result.status === "CONNECTED") {
        setDirectStatus("connected");
        return;
      }
      if (result.status === "FAILED" || result.status === "EXPIRED") {
        setDirectStatus(result.status === "EXPIRED" ? "expired" : "failed");
        setShowManualFallback(true);
      }
    }, DIRECT_CONNECTION_POLL_MS);
    return () => clearInterval(intervalId);
  }, [directStatus, directSessionId]);

  /** Set of Rendr photo ids already imported into this project (derived from tags). */
  const importedRendrPhotoIds = new Set<string>();
  for (const m of media) {
    for (const t of m.tags ?? []) {
      if (t.startsWith(RENDR_PHOTO_TAG_PREFIX)) {
        importedRendrPhotoIds.add(t.slice(RENDR_PHOTO_TAG_PREFIX.length));
      }
    }
  }

  /** Lazy-load the Rendr photo list the first time the user opens the Rendr Photos page. */
  useEffect(() => {
    if (activeRoomId !== RENDR_PHOTOS_ID) return;
    if (!rendrSpaceId) return;
    if (rendrPhotosLoaded || rendrPhotosLoading) return;
    setRendrPhotosLoading(true);
    setRendrPhotosError(null);
    fetch(`/api/rendr/spaces/${rendrSpaceId}/detail`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) {
          setRendrPhotosError(d.error);
          setRendrPhotos([]);
        } else {
          setRendrPhotos(Array.isArray(d.photos) ? d.photos : []);
        }
        setRendrPhotosLoaded(true);
      })
      .catch((e) => {
        setRendrPhotosError(e instanceof Error ? e.message : "Failed to load Rendr photos");
      })
      .finally(() => setRendrPhotosLoading(false));
  }, [activeRoomId, rendrSpaceId, rendrPhotosLoaded, rendrPhotosLoading]);

  /** Renderings (room or cover) must never appear in Unassigned Media. */
  const isRendering = (m: MediaItem) =>
    m.type === MediaType.RENDERING;

  const existingByRoom = (roomId: string) =>
    media
      .filter((m) => m.type === MediaType.EXISTING && m.roomId === roomId)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  const renderingsByRoom = (roomId: string) =>
    media
      .filter((m) => m.type === MediaType.RENDERING && m.roomId === roomId)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  /** Unassigned: non-HERO, non-rendering media with no room (or room not in project). */
  const unassigned = media.filter(
    (m) =>
      m.type !== MediaType.HERO &&
      !isRendering(m) &&
      (m.placement === "UNASSIGNED" ||
        (m.placement == null && (m.roomId == null || !roomIds.has(m.roomId))))
  );
  /** Zillow-imported photos that are still unassigned; shown on the Imported from Zillow page. */
  const zillowImportedUnassigned = unassigned.filter((m) =>
    (m.tags ?? []).includes(ZILLOW_IMPORT_TAG)
  );
  /**
   * Generic unassigned photos (not Zillow-tagged); shown on the Unassigned
   * Photos page only.
   *
   * Sorted by sortOrder DESC so newest walkthrough photos surface at the
   * top. Phase 9 local imports populate sortOrder with the EXIF
   * DateTimeOriginal as Unix seconds, so DESC == newest-first. Legacy
   * uploads have low sortOrder (~0) and naturally fall to the bottom.
   */
  const genericUnassigned = unassigned
    .filter((m) => !(m.tags ?? []).includes(ZILLOW_IMPORT_TAG))
    .sort((a, b) => b.sortOrder - a.sortOrder);

  /**
   * Phase 9.2: build the list of available import batches for the
   * Unassigned Photos batch-filter dropdown. One entry per distinct
   * `batch-*` tag found in the current unassigned set, with the count
   * of photos in that batch. Sorted newest-first by parsing the
   * batch-id timestamp (which is itself locally-formatted YYYYMMDD-HHmmss).
   */
  const availableBatches = (() => {
    const counts = new Map<string, number>();
    for (const m of genericUnassigned) {
      for (const t of m.tags ?? []) {
        if (t.startsWith("batch-")) {
          counts.set(t, (counts.get(t) ?? 0) + 1);
        }
      }
    }
    // Lexicographic sort on the batch-id string is reverse-chronological
    // because the format is batch-YYYYMMDD-HHmmss — string compare is
    // chronological, so descending string sort == newest-first.
    return Array.from(counts.entries())
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([id, count]) => ({ id, count }));
  })();
  /** True if any unassigned photo has no batch tag (Zillow imports were
   *  already filtered out, but Rendr / legacy / manual uploads land here). */
  const hasUntaggedUnassigned = genericUnassigned.some(
    (m) => !(m.tags ?? []).some((t) => t.startsWith("batch-"))
  );

  /**
   * Apply the batch filter to genericUnassigned. "all" passes everything
   * through; "untagged" keeps only photos with no batch tag; any other
   * value is treated as a literal batch id.
   */
  const filteredGenericUnassigned = (() => {
    if (unassignedBatchFilter === "all") return genericUnassigned;
    if (unassignedBatchFilter === "untagged") {
      return genericUnassigned.filter(
        (m) => !(m.tags ?? []).some((t) => t.startsWith("batch-"))
      );
    }
    return genericUnassigned.filter((m) =>
      (m.tags ?? []).includes(unassignedBatchFilter)
    );
  })();
  /**
   * Renderings that lost their room (e.g. section was deleted under them).
   * Surfaced separately so they don't silently eat R2 storage.
   *
   * Excludes kind === "COVER": Front Page covers are intentionally
   * roomless (project-level asset, not section-level — see
   * generateFrontPageCover() in actions.ts). Without this guard every
   * Front Page cover looks "orphaned" because the filter can't tell
   * "roomless by design" from "roomless because a section got deleted."
   */
  const orphanedRenderings = media.filter(
    (m) =>
      isRendering(m) &&
      m.kind !== "COVER" &&
      (m.roomId == null || !roomIds.has(m.roomId))
  );

  const activeRoom = rooms.find((r) => r.id === activeRoomId) ?? null;
  const existingForActive = activeRoomId ? existingByRoom(activeRoomId) : [];
  const serverRenderingsForActive = activeRoomId ? renderingsByRoom(activeRoomId) : [];
  // Merge optimistic placeholders so "Generating…" appears immediately in the version strip
  const renderingsForActive = (() => {
    if (!activeRoomId || !serverRenderingsForActive.length) return serverRenderingsForActive;
    const serverIds = new Set(serverRenderingsForActive.map((m) => m.id));
    const extra = optimisticRenderMedia.filter(
      (o) => o.roomId === activeRoomId && !serverIds.has(o.id)
    );
    if (!extra.length) return serverRenderingsForActive;
    return [...serverRenderingsForActive, ...extra].sort(
      (a, b) => a.sortOrder - b.sortOrder || new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
  })();
  const rootRenderCount = renderingsForActive.filter((m) => m.parentMediaId == null).length;
  const selectedRenderIdOnRoom = activeRoom?.selectedRenderMediaId ?? null;
  const selectedRenderMedia = selectedRenderIdOnRoom
    ? renderingsForActive.find((m) => m.id === selectedRenderIdOnRoom)
    : null;

  const defaultSourceForRoom =
    (selectedRenderMedia?.sourceMediaId as string | null | undefined) ??
    existingForActive[0]?.id ??
    null;

  const selectedBefore =
    activeSourceMediaId != null
      ? existingForActive.find((m) => m.id === activeSourceMediaId) ?? existingForActive[0] ?? null
      : existingForActive[0] ?? null;

  const effectiveSourceMediaId = selectedBefore?.id ?? defaultSourceForRoom;

  // Only RENDERING media for the selected before photo in this room (single source of truth for "concepts for this photo")
  const conceptVersionsForSelectedBefore =
    effectiveSourceMediaId != null && activeRoomId != null
      ? renderingsForActive.filter(
          (r) => r.sourceMediaId === effectiveSourceMediaId && r.roomId === activeRoomId
        )
      : [];
  const filteredRenders = conceptVersionsForSelectedBefore;
  const renderGroups = buildRenderGroups(renderingsForActive, effectiveSourceMediaId ?? null);
  const conceptGroups = buildConceptGroups(renderGroups);

  // Room-orphan concepts: rendering is linked to the room but its Before-photo
  // binding is broken — either sourceMediaId is null (typical when an orphan
  // is restored via "Assign to section", which only sets roomId) OR
  // sourceMediaId points to a photo that no longer lives in this room
  // (dangling reference, e.g. the original Before was deleted). Either way,
  // the per-photo render panel can never surface them, so we show them here
  // with a "Link to selected Before" rescue button.
  const existingPhotoIdsInRoom = new Set(existingForActive.map((m) => m.id));
  const unlinkedRoomConcepts =
    activeRoomId != null
      ? renderingsForActive.filter(
          (r) =>
            r.roomId === activeRoomId &&
            r.parentMediaId == null &&
            (r.sourceMediaId == null || !existingPhotoIdsInRoom.has(r.sourceMediaId)),
        )
      : [];
  const latestDoneInFiltered = latestDone(filteredRenders);

  // Priority: 1) viewing (clicked thumb), 2) selected (if DONE and in filtered), 3) latest DONE
  const selectedInFilteredAndDone =
    selectedRenderIdOnRoom && filteredRenders.some((r) => r.id === selectedRenderIdOnRoom)
      ? filteredRenders.find((r) => r.id === selectedRenderIdOnRoom && getNormalizedRenderStatus(r) === "DONE") ?? null
      : null;
  const viewingInFiltered =
    activeRenderMediaId && filteredRenders.some((r) => r.id === activeRenderMediaId)
      ? filteredRenders.find((r) => r.id === activeRenderMediaId) ?? null
      : null;
  const bigPreviewMedia =
    viewingInFiltered ??
    selectedInFilteredAndDone ??
    latestDoneInFiltered;

  const hasPendingRenders = renderingsForActive.some(
    (m) => getNormalizedRenderStatus(m) === "QUEUED" || getNormalizedRenderStatus(m) === "RENDERING"
  );

  // Remove optimistic placeholders once server data includes them
  useEffect(() => {
    const serverIds = new Set(media.filter((m) => m.type === MediaType.RENDERING).map((m) => m.id));
    setOptimisticRenderMedia((prev) => prev.filter((o) => !serverIds.has(o.id)));
  }, [media]);

  // One-time cleanup: remove orphaned rendering children that lost their parent.
  // These are legacy orphans created before cascade-delete was added to deleteMediaAction.
  const orphanCleanupRanRef = useRef(false);
  useEffect(() => {
    if (orphanCleanupRanRef.current) return;
    orphanCleanupRanRef.current = true;
    cleanupOrphanedRenderingsAction(projectId).then((result) => {
      if (result.deleted > 0) {
        console.log(`[media-tab] Cleaned up ${result.deleted} orphaned rendering(s)`);
        router.refresh();
      }
    }).catch(() => {/* non-fatal */});
  }, [projectId, router]);

  useEffect(() => {
    if (!activeRoomId || !hasPendingRenders) return;
    const t = setInterval(() => router.refresh(), POLL_INTERVAL_MS);
    return () => clearInterval(t);
  }, [activeRoomId, hasPendingRenders, router]);

  useEffect(() => {
    setActiveRoomId((prev) =>
      prev &&
      (prev === FRONT_PAGE_ID ||
        prev === ZILLOW_IMPORT_ID ||
        prev === UNASSIGNED_PHOTOS_ID ||
        prev === RENDR_PHOTOS_ID ||
        roomIds.has(prev))
        ? prev
        : rooms[0]?.id ?? null
    );
  }, [rooms, roomIds]);
  // Phase 10: hydrate the per-room checked map from the rooms prop on mount +
  // whenever the server-fetched rooms list changes (router.refresh, navigation).
  // Shape derived entirely from DB — no localStorage.
  useEffect(() => {
    const next: Record<string, RenderChangesChecklistState> = {};
    for (const r of rooms) {
      const checked: Record<string, boolean> = {};
      for (const item of r.checkedRenderItems ?? []) {
        checked[item] = true;
      }
      next[r.id] = { checked };
    }
    setRenderChangesChecklistByRoom(next);
  }, [rooms]);

  useEffect(() => {
    const firstBefore = existingForActive[0]?.id ?? null;
    const preferredSourceId =
      (selectedRenderMedia?.sourceMediaId as string | null | undefined) ?? firstBefore ?? null;

    setActiveSourceMediaId((prev) => {
      if (prev && existingForActive.some((m) => m.id === prev)) {
        return prev;
      }
      return preferredSourceId;
    });
  }, [activeRoomId, existingForActive, selectedRenderMedia?.sourceMediaId]);

  useEffect(() => {
    const inFiltered = (id: string) => filteredRenders.some((r) => r.id === id);
    const defaultId = selectedRenderIdOnRoom && inFiltered(selectedRenderIdOnRoom)
      ? selectedRenderIdOnRoom
      : latestDoneInFiltered?.id ?? null;
    setActiveRenderMediaId((prev) => {
      if (prev && inFiltered(prev)) return prev;
      return defaultId;
    });
  }, [activeRoomId, effectiveSourceMediaId, selectedRenderIdOnRoom, latestDoneInFiltered?.id]);

  /** Refresh on return from extension (e.g. after Zillow import); throttled to avoid excessive refreshes. */
  const lastFocusRefreshRef = useRef<number>(0);
  const FOCUS_REFRESH_THROTTLE_MS = 2500;
  useEffect(() => {
    function doRefresh(reason: "focus" | "visibility") {
      const now = Date.now();
      if (now - lastFocusRefreshRef.current < FOCUS_REFRESH_THROTTLE_MS) return;
      lastFocusRefreshRef.current = now;
      if (typeof console !== "undefined" && console.log) {
        console.log("[Media tab] " + reason + " refresh");
      }
      router.refresh();
    }
    function onFocus() {
      doRefresh("focus");
    }
    function onVisibilityChange() {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        doRefresh("visibility");
      }
    }
    if (typeof window === "undefined") return;
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [router]);

  /** Current room: AI-extracted visual rendering checklist from scope narrative. */
  const [activeRoomBullets, setActiveRoomBullets] = useState<string[]>([]);
  const [bulletsLoading, setBulletsLoading] = useState(false);
  const prevActiveRoomIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (activeRoomId === prevActiveRoomIdRef.current) return;
    prevActiveRoomIdRef.current = activeRoomId;

    if (!activeRoomId || !activeRoom?.scopeNarrative) {
      setActiveRoomBullets([]);
      return;
    }

    let cancelled = false;
    setBulletsLoading(true);
    extractRenderChecklistAction(activeRoomId)
      .then((items) => {
        if (!cancelled) setActiveRoomBullets(items);
      })
      .catch(() => {
        if (!cancelled) setActiveRoomBullets([]);
      })
      .finally(() => {
        if (!cancelled) setBulletsLoading(false);
      });

    return () => { cancelled = true; };
  }, [activeRoomId, activeRoom?.scopeNarrative]);

  /**
   * Current room: checked state per bullet. Source of truth is the hydrated
   * `checked` map, which mirrors RoomRenderCheck rows — presence = true,
   * absence = false. Fresh-extracted items are seeded server-side inside
   * extractRenderChecklistAction's transaction, so by the time the rooms
   * prop re-hydrates those items are already in the map.
   */
  const activeRoomBulletChecked = (bullet: string): boolean => {
    if (!activeRoomId) return false;
    return renderChangesChecklistByRoom[activeRoomId]?.checked?.[bullet] === true;
  };

  /**
   * Phase 10: toggle a bullet's checked state. Optimistic — React state flips
   * synchronously, server action runs in the background. On error, revert and
   * surface via setRenderError (the existing Render-section error banner).
   */
  async function setActiveRoomBulletChecked(bullet: string, checked: boolean) {
    if (!activeRoomId) return;
    const roomId = activeRoomId;
    const stored = renderChangesChecklistByRoom[roomId];
    const prevChecked = stored?.checked?.[bullet] === true;
    // Optimistic: apply the new state locally.
    setRenderChangesChecklistByRoom((curr) => ({
      ...curr,
      [roomId]: {
        checked: { ...curr[roomId]?.checked, [bullet]: checked },
      },
    }));
    const result = await setRenderCheckAction(projectId, roomId, bullet, checked);
    if (result?.error) {
      // Rollback to previous value.
      setRenderChangesChecklistByRoom((curr) => ({
        ...curr,
        [roomId]: {
          checked: { ...curr[roomId]?.checked, [bullet]: prevChecked },
        },
      }));
      setRenderError(result.error);
    }
  }

  /** Checked bullets only; used when calling Render New. */
  const checkedBulletsForRender: string[] = activeRoomBullets.filter((b) => activeRoomBulletChecked(b));
  /** Checklist + optional custom change; used as render payload. */
  const finalBulletsForRender: string[] = [
    ...checkedBulletsForRender,
    ...(customChangeEnabled && customChangeText.trim() ? [customChangeText.trim()] : []),
  ];

  async function handleRenderNew() {
    if (!activeRoomId || !effectiveSourceMediaId || rendering) return;
    setRendering(true);
    setRenderError(null);
    if (process.env.NODE_ENV !== "production") {
      console.log("[Media tab] Render New – bullets sent:", finalBulletsForRender);
    }
    const result = await startRoomRenderAction(
      projectId,
      activeRoomId,
      effectiveSourceMediaId,
      { checkedBullets: finalBulletsForRender }
    );
    setRendering(false);
    if ("error" in result) {
      setRenderError(result.error);
      return;
    }
    router.refresh();
  }

  async function handleSetSelected(mediaId: string) {
    if (!activeRoomId) return;
    const err = await setSelectedRenderAction(projectId, activeRoomId, mediaId);
    if (err?.error) setRenderError(err.error);
    else router.refresh();
  }

  async function handleClearSelected() {
    if (!activeRoomId) return;
    const result = await clearSelectedRenderAction(projectId, activeRoomId);
    if (result?.error) setRenderError(result.error);
    else router.refresh();
  }

  async function handleDeleteRender(mediaId: string) {
    if (!confirm("Delete this rendering?")) return;
    await deleteMediaAction(projectId, mediaId);
    router.refresh();
  }

  async function handleLinkRenderingToBefore(renderingId: string) {
    if (!effectiveSourceMediaId) return;
    const result = await linkRenderingToBeforePhotoAction(projectId, renderingId, effectiveSourceMediaId);
    if (result.error) setRenderError(result.error);
    else router.refresh();
  }

  function openUpdateModal(renderId: string) {
    setUpdateModalRenderId(renderId);
    setUpdateInstruction("");
    setUpdateError(null);
  }

  function closeUpdateModal() {
    setUpdateModalRenderId(null);
    setUpdateInstruction("");
    setUpdateError(null);
  }

  function canSubmitUpdate(): boolean {
    const instruction = updateInstruction.trim();
    return instruction.length >= 3 && instruction.length <= 500;
  }

  async function handleSubmitUpdate() {
    if (!activeRoomId || !updateModalRenderId) return;
    const instruction = updateInstruction.trim();
    if (instruction.length < 3) {
      setUpdateError("Instruction must be at least 3 characters.");
      return;
    }
    if (instruction.length > 500) {
      setUpdateError("Instruction must be 500 characters or less.");
      return;
    }
    setUpdateSubmitting(true);
    setUpdateError(null);
    const result = await startRenderUpdateAction(
      projectId,
      activeRoomId,
      updateModalRenderId,
      instruction
    );
    setUpdateSubmitting(false);
    if ("error" in result) {
      setUpdateError(result.error);
      return;
    }
    const newMediaId = result.mediaId ?? result.createdMediaId;
    // Placeholder must have parentMediaId = root of concept so it appears in same group (UI groups by root's direct children only).
    const groupForUpdated = conceptGroups.find((g) => g.versions.some((v) => v.id === updateModalRenderId));
    const rootIdForPlaceholder = groupForUpdated?.root.id ?? updateModalRenderId;
    const maxSortOrderInConcept = groupForUpdated
      ? Math.max(
          groupForUpdated.root.sortOrder,
          ...groupForUpdated.children.map((m) => m.sortOrder),
          0
        ) + 1
      : Math.max(0, ...renderingsForActive.map((m) => m.sortOrder)) + 1;
    const placeholder: MediaItem = {
      id: newMediaId,
      createdAt: new Date().toISOString(),
      type: MediaType.RENDERING,
      caption: null,
      tags: [],
      roomId: activeRoomId,
      url: "",
      sortOrder: maxSortOrderInConcept,
      room: activeRoom ? { id: activeRoom.id, name: activeRoom.name } : null,
      sourceMediaId: effectiveSourceMediaId ?? undefined,
      parentMediaId: rootIdForPlaceholder,
      renderStatus: "QUEUED",
    };
    setOptimisticRenderMedia((prev) => [...prev, placeholder]);
    setActiveRenderMediaId(newMediaId);
    closeUpdateModal();
    router.refresh();
  }

  function handleUpdateModalKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (e.nativeEvent.isComposing) return;
      if (!canSubmitUpdate()) return;
      void handleSubmitUpdate();
    }
  }

  // Precompute for Render preview (avoids IIFE in JSX)
  const bigPreviewRenderStatus = bigPreviewMedia ? getNormalizedRenderStatus(bigPreviewMedia) : null;
  const bigPreviewShowSpinner =
    bigPreviewMedia &&
    ((bigPreviewRenderStatus === "QUEUED" || bigPreviewRenderStatus === "RENDERING") ||
      isBadPlaceholderUrl(bigPreviewMedia.url));
  const bigPreviewUsePlainImg =
    bigPreviewMedia &&
    !bigPreviewShowSpinner &&
    (isLegacyBlobUrl(bigPreviewMedia.url) || !isAllowedHostForNextImage(bigPreviewMedia.url));

  // Precompute for concept labels (avoids IIFE in JSX)
  const viewingGroup = conceptGroups.find((cg) => cg.versions.some((v) => v.id === activeRenderMediaId));
  const viewingMedia = viewingGroup?.versions.find((v) => v.id === activeRenderMediaId);
  const viewingLabel =
    viewingGroup && viewingMedia
      ? `${viewingGroup.conceptLabel} — ${getVersionLabel(viewingGroup, viewingMedia)}`
      : null;
  const selectedGroup = conceptGroups.find((cg) => cg.versions.some((v) => v.id === selectedRenderIdOnRoom));
  const selectedMedia = selectedGroup?.versions.find((v) => v.id === selectedRenderIdOnRoom);
  const selectedLabel =
    selectedGroup && selectedMedia && selectedRenderIdOnRoom
      ? `${selectedGroup.conceptLabel} — ${getVersionLabel(selectedGroup, selectedMedia)}`
      : null;

  return (
    <div className="space-y-8">
      {uploadError && (
        <p className="text-sm text-red-600 dark:text-red-400">{uploadError}</p>
      )}
      {uploadResult != null && (
        <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm dark:border-zinc-700 dark:bg-zinc-800/50">
          <p className="text-zinc-800 dark:text-zinc-200">
            Uploaded {uploadResult.successCount} file{uploadResult.successCount !== 1 ? "s" : ""}.
            {uploadResult.failed.length > 0 && (
              <> {uploadResult.failed.length} failed.</>
            )}
          </p>
          {uploadResult.failed.length > 0 && (
            <ul className="mt-1 list-inside list-disc text-red-600 dark:text-red-400">
              {uploadResult.failed.map((f) => (
                <li key={f.name}>
                  {f.name}: {f.error}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {/* Project-level Zillow Import — single entry point; imported photos land in Imported from Zillow */}
      <section className="rounded-lg border border-zinc-200 bg-zinc-50/50 p-4 dark:border-zinc-800 dark:bg-zinc-800/30">
        <h2 className="mb-2 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          Zillow Import
        </h2>
        <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-400">
          Import photos from a Zillow listing at the project level. They will appear in <strong>Imported from Zillow</strong> in the Sections list; assign them to sections from there.
        </p>
        <div className="flex flex-col gap-1">
          <button
            type="button"
            onClick={() => {
              zillowDetectionStartedRef.current = false;
              openedZillowForAddressRef.current = false;
              setZillowImportModalOpen(true);
              setPairCode(null);
              setPairCodeExpiresAt(null);
              setPairCodeError(null);
              setZillowDetectionStatus("idle");
              setZillowReadinessState(null);
              setZillowDetectionMessage(null);
              setZillowDetectionDetail(null);
              setDirectSessionId(null);
              setDirectNonce(null);
              setDirectStatus("idle");
              setDirectError(null);
              setShowManualFallback(false);
              directStartAttemptedRef.current = false;
            }}
            className="w-fit rounded bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            Import Photos
          </button>
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            Import photos from a Zillow listing into this project.
          </span>
        </div>
        {/* Later: Import Selected status (Phase 4) */}
        <div className="min-h-[1.5rem] text-sm text-zinc-500 dark:text-zinc-400" aria-hidden="true">
          {/* Placeholder for "Import Selected" status */}
        </div>
      </section>

      {/* Phase 9: Bulk Local Media Import — parallel entry point to Zillow Import.
          Imported photos land in Unassigned Photos with tags ["local-import", batchId]. */}
      <section className="rounded-lg border border-zinc-200 bg-zinc-50/50 p-4 dark:border-zinc-800 dark:bg-zinc-800/30">
        <h2 className="mb-2 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          Local Photo Import
        </h2>
        <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-400">
          Bulk-import 30–100 photos straight from your computer (e.g. a walkthrough from your phone). They land in <strong>Unassigned Photos</strong>; assign them to sections from there.
        </p>
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setLocalImportOpen(true)}
              className="w-fit rounded bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              Import Local Photos
            </button>
            <button
              type="button"
              onClick={() => setPhoneUploadOpen(true)}
              className="w-fit rounded border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-900 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
            >
              Send from Phone
            </button>
          </div>
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            Drag a folder, select files, or pick a folder. JPG, PNG, HEIC, WebP supported.
            Or tap <strong>Send from Phone</strong> to scan a QR code and upload from your phone.
          </span>
        </div>
      </section>

      <PhoneUploadModal
        projectId={projectId}
        open={phoneUploadOpen}
        onClose={(didReceive) => {
          setPhoneUploadOpen(false);
          if (didReceive) {
            // New phone-uploaded photos land in Unassigned; refresh to show them.
            router.refresh();
          }
        }}
      />

      <LocalImportModal
        projectId={projectId}
        open={localImportOpen}
        onClose={(didImport) => {
          setLocalImportOpen(false);
          if (didImport) {
            // Reload the Media tab so newly-created Media rows appear in
            // Unassigned Photos. router.refresh() re-runs the server
            // component that fetches `media` — same pattern Zillow/Rendr
            // imports use after their assign actions.
            router.refresh();
          }
        }}
      />

      {/* Media workspace: room list (left) + active room (right) */}
      <section className="flex gap-0 overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
        <aside className="w-80 shrink-0 border-r border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800/50">
          <div className="p-2 font-medium text-zinc-700 dark:text-zinc-300">Sections</div>
          <div className="max-h-[60vh] overflow-y-auto p-2">
            <button
              type="button"
              onClick={() => setActiveRoomId(ZILLOW_IMPORT_ID)}
              className={`mb-1 flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm ${
                activeRoomId === ZILLOW_IMPORT_ID
                  ? "border-zinc-400 bg-white dark:border-zinc-500 dark:bg-zinc-900"
                  : "border-transparent hover:bg-zinc-200/80 dark:hover:bg-zinc-700/50"
              }`}
            >
              <span className="truncate font-medium">Imported from Zillow</span>
              {zillowImportedUnassigned.length > 0 && (
                <span className="shrink-0 rounded bg-zinc-200 px-1.5 py-0.5 text-xs dark:bg-zinc-600">
                  {zillowImportedUnassigned.length}
                </span>
              )}
            </button>
            {rendrSpaceId != null && (
              <button
                type="button"
                onClick={() => setActiveRoomId(RENDR_PHOTOS_ID)}
                className={`mb-1 flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm ${
                  activeRoomId === RENDR_PHOTOS_ID
                    ? "border-zinc-400 bg-white dark:border-zinc-500 dark:bg-zinc-900"
                    : "border-transparent hover:bg-zinc-200/80 dark:hover:bg-zinc-700/50"
                }`}
              >
                <span className="truncate font-medium">Imported from Rendr</span>
                {rendrPhotosLoaded && rendrPhotos.length > 0 && (
                  <span className="shrink-0 rounded bg-zinc-200 px-1.5 py-0.5 text-xs dark:bg-zinc-600">
                    {rendrPhotos.length}
                  </span>
                )}
              </button>
            )}
            <button
              type="button"
              onClick={() => setActiveRoomId(UNASSIGNED_PHOTOS_ID)}
              className={`mb-1 flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm ${
                activeRoomId === UNASSIGNED_PHOTOS_ID
                  ? "border-zinc-400 bg-white dark:border-zinc-500 dark:bg-zinc-900"
                  : "border-transparent hover:bg-zinc-200/80 dark:hover:bg-zinc-700/50"
              }`}
            >
              <span className="truncate font-medium">Unassigned Photos</span>
              {genericUnassigned.length > 0 && (
                <span className="shrink-0 rounded bg-zinc-200 px-1.5 py-0.5 text-xs dark:bg-zinc-600">
                  {genericUnassigned.length}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setActiveRoomId(FRONT_PAGE_ID)}
              className={`mb-1 flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm ${
                activeRoomId === FRONT_PAGE_ID
                  ? "border-zinc-400 bg-white dark:border-zinc-500 dark:bg-zinc-900"
                  : "border-transparent hover:bg-zinc-200/80 dark:hover:bg-zinc-700/50"
              }`}
            >
              <span className="truncate font-medium">Front Page</span>
              {coverHeroImageId && (
                <span className="shrink-0 rounded bg-blue-100 px-1.5 py-0.5 text-xs text-blue-700 dark:bg-blue-900/50 dark:text-blue-300">
                  Selected
                </span>
              )}
            </button>
            {rooms.map((room) => {
              const roomRenders = renderingsByRoom(room.id);
              // Count distinct root concepts: group by sourceMediaId and keep only one per source.
              // This excludes orphaned children whose parentMediaId was set to null when their parent was deleted.
              const potentialRoots = roomRenders.filter((r) => r.parentMediaId == null);
              const seenSources = new Set<string>();
              let roots = 0;
              for (const r of potentialRoots) {
                const key = r.sourceMediaId ?? r.id; // unique per source photo
                if (!seenSources.has(key)) {
                  seenSources.add(key);
                  roots++;
                }
              }
              const isSelected = room.selectedRenderMediaId != null;
              const active = room.id === activeRoomId;
              return (
                <button
                  key={room.id}
                  type="button"
                  onClick={() => setActiveRoomId(room.id)}
                  className={`mb-1 flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm ${
                    active
                      ? "border-zinc-400 bg-white dark:border-zinc-500 dark:bg-zinc-900"
                      : "border-transparent hover:bg-zinc-200/80 dark:hover:bg-zinc-700/50"
                  }`}
                >
                  <span className="truncate font-medium">{room.name}</span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    <span className="rounded bg-zinc-200 px-1.5 py-0.5 text-xs dark:bg-zinc-600">
                      Concepts: {roots}/3
                    </span>
                    {isSelected && (
                      <span className="rounded bg-blue-100 px-1.5 py-0.5 text-xs text-blue-700 dark:bg-blue-900/50 dark:text-blue-300">
                        Selected
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </aside>
        <div className="min-w-0 flex-1 p-6">
          {activeRoomId === ZILLOW_IMPORT_ID ? (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                Imported from Zillow
              </h2>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                These are photos imported from a Zillow listing. They are not yet assigned to a section. Select photos below and assign them to a section or move to Front Page Photos.
              </p>
              {zillowImportedUnassigned.length > 0 && (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedZillowIds(new Set(zillowImportedUnassigned.map((m) => m.id)))
                      }
                      className="rounded border border-zinc-300 px-2 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    >
                      Select All
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedZillowIds(new Set());
                        setZillowAssignRoomId("");
                      }}
                      className="rounded border border-zinc-300 px-2 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    >
                      Clear selection
                    </button>
                    {selectedZillowIds.size > 0 && (
                      <>
                        <select
                          value={zillowAssignRoomId}
                          onChange={(e) => setZillowAssignRoomId(e.target.value)}
                          className="rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                          aria-label="Assign to section"
                        >
                          <option value="">Assign to Section…</option>
                          <option value={FRONT_PAGE_ID}>Front Page</option>
                          {rooms.map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.name}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={async () => {
                            if (!zillowAssignRoomId) return;
                            setZillowAssigning(true);
                            for (const mediaId of selectedZillowIds) {
                              if (zillowAssignRoomId === FRONT_PAGE_ID) {
                                await updateMediaRoomAction(projectId, mediaId, null, "FRONT_PAGE");
                              } else {
                                await updateMediaRoomAction(projectId, mediaId, zillowAssignRoomId);
                              }
                            }
                            setZillowAssigning(false);
                            setSelectedZillowIds(new Set());
                            setZillowAssignRoomId("");
                            router.refresh();
                          }}
                          disabled={!zillowAssignRoomId || zillowAssigning}
                          className="rounded bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                        >
                          {zillowAssigning ? "Assigning…" : "Assign to Section"}
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            if (!confirm(`Move ${selectedZillowIds.size} photo(s) to Front Page Photos?`)) return;
                            setZillowAssigning(true);
                            for (const mediaId of selectedZillowIds) {
                              await updateMediaRoomAction(projectId, mediaId, null, "FRONT_PAGE");
                            }
                            setZillowAssigning(false);
                            setSelectedZillowIds(new Set());
                            router.refresh();
                          }}
                          disabled={zillowAssigning}
                          className="rounded border border-zinc-300 px-2 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
                        >
                          Move to Front Page
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            if (!confirm(`Delete ${selectedZillowIds.size} selected photo(s)?`)) return;
                            setZillowAssigning(true);
                            for (const mediaId of selectedZillowIds) {
                              await deleteMediaAction(projectId, mediaId);
                            }
                            setZillowAssigning(false);
                            setSelectedZillowIds(new Set());
                            router.refresh();
                          }}
                          disabled={zillowAssigning}
                          className="rounded border border-red-200 px-2 py-1.5 text-sm text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-900/30"
                        >
                          Delete
                        </button>
                        <span className="text-sm text-zinc-500 dark:text-zinc-400">
                          {selectedZillowIds.size} selected
                        </span>
                      </>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                    {zillowImportedUnassigned.map((m) => (
                      <ZillowStagingThumbnail
                        key={m.id}
                        media={m}
                        selected={selectedZillowIds.has(m.id)}
                        onToggleSelect={() => {
                          setSelectedZillowIds((prev) => {
                            const next = new Set(prev);
                            if (next.has(m.id)) next.delete(m.id);
                            else next.add(m.id);
                            return next;
                          });
                        }}
                        onDelete={async () => {
                          if (!confirm("Delete this photo?")) return;
                          await deleteMediaAction(projectId, m.id);
                          router.refresh();
                        }}
                      />
                    ))}
                  </div>
                </>
              )}
              {zillowImportedUnassigned.length === 0 && (
                <p className="rounded-lg border border-dashed border-zinc-300 py-8 text-center text-sm text-zinc-500 dark:border-zinc-600 dark:text-zinc-400">
                  No Zillow-imported photos waiting to be assigned. Import photos using the Zillow Import block above, then they will appear here.
                </p>
              )}
            </div>
          ) : activeRoomId === UNASSIGNED_PHOTOS_ID ? (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                Unassigned Photos
              </h2>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                These are project photos not yet assigned to a section (excluding Zillow-imported photos, which appear under Imported from Zillow). Select photos below and assign them to a section or move to Front Page Photos.
              </p>
              {/* Phase 9.2: batch filter. Shown only when at least one
                  local-import batch tag is present — otherwise the dropdown
                  would just have "All" + "Untagged" which is noise. */}
              {availableBatches.length > 0 && (
                <div className="flex items-center gap-2 text-sm">
                  <label
                    htmlFor="unassigned-batch-filter"
                    className="text-zinc-600 dark:text-zinc-400"
                  >
                    Filter by batch:
                  </label>
                  <select
                    id="unassigned-batch-filter"
                    value={unassignedBatchFilter}
                    onChange={(e) => {
                      setUnassignedBatchFilter(e.target.value);
                      // Clearing selection on filter change avoids the
                      // confusing case where selected IDs are no longer
                      // visible but bulk-assign still targets them.
                      setSelectedGenericUnassignedIds(new Set());
                    }}
                    className="rounded border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                  >
                    <option value="all">
                      All batches ({genericUnassigned.length})
                    </option>
                    {availableBatches.map((b) => {
                      const parsed = parseBatchIdToDate(b.id);
                      const label = parsed
                        ? formatTimestamp(parsed, "batch")
                        : b.id;
                      return (
                        <option key={b.id} value={b.id}>
                          {label} ({b.count} photo{b.count === 1 ? "" : "s"})
                        </option>
                      );
                    })}
                    {hasUntaggedUnassigned && (
                      <option value="untagged">
                        Untagged (
                        {
                          genericUnassigned.filter(
                            (m) =>
                              !(m.tags ?? []).some((t) => t.startsWith("batch-"))
                          ).length
                        }
                        )
                      </option>
                    )}
                  </select>
                </div>
              )}
              {filteredGenericUnassigned.length > 0 && (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedGenericUnassignedIds(
                          new Set(filteredGenericUnassigned.map((m) => m.id))
                        )
                      }
                      className="rounded border border-zinc-300 px-2 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    >
                      Select All
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedGenericUnassignedIds(new Set());
                        setGenericUnassignedAssignRoomId("");
                      }}
                      className="rounded border border-zinc-300 px-2 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    >
                      Clear selection
                    </button>
                    {selectedGenericUnassignedIds.size > 0 && (
                      <>
                        <select
                          value={genericUnassignedAssignRoomId}
                          onChange={(e) => setGenericUnassignedAssignRoomId(e.target.value)}
                          className="rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                          aria-label="Assign to section"
                        >
                          <option value="">Assign to Section…</option>
                          <option value={FRONT_PAGE_ID}>Front Page</option>
                          {rooms.map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.name}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={async () => {
                            if (!genericUnassignedAssignRoomId) return;
                            setGenericUnassignedAssigning(true);
                            for (const mediaId of selectedGenericUnassignedIds) {
                              if (genericUnassignedAssignRoomId === FRONT_PAGE_ID) {
                                await updateMediaRoomAction(projectId, mediaId, null, "FRONT_PAGE");
                              } else {
                                await updateMediaRoomAction(projectId, mediaId, genericUnassignedAssignRoomId);
                              }
                            }
                            setGenericUnassignedAssigning(false);
                            setSelectedGenericUnassignedIds(new Set());
                            setGenericUnassignedAssignRoomId("");
                            router.refresh();
                          }}
                          disabled={!genericUnassignedAssignRoomId || genericUnassignedAssigning}
                          className="rounded bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                        >
                          {genericUnassignedAssigning ? "Assigning…" : "Assign to Section"}
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            if (!confirm(`Move ${selectedGenericUnassignedIds.size} photo(s) to Front Page Photos?`)) return;
                            setGenericUnassignedAssigning(true);
                            for (const mediaId of selectedGenericUnassignedIds) {
                              await updateMediaRoomAction(projectId, mediaId, null, "FRONT_PAGE");
                            }
                            setGenericUnassignedAssigning(false);
                            setSelectedGenericUnassignedIds(new Set());
                            router.refresh();
                          }}
                          disabled={genericUnassignedAssigning}
                          className="rounded border border-zinc-300 px-2 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
                        >
                          Move to Front Page
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            if (!confirm(`Delete ${selectedGenericUnassignedIds.size} selected photo(s)?`)) return;
                            setGenericUnassignedAssigning(true);
                            for (const mediaId of selectedGenericUnassignedIds) {
                              await deleteMediaAction(projectId, mediaId);
                            }
                            setGenericUnassignedAssigning(false);
                            setSelectedGenericUnassignedIds(new Set());
                            router.refresh();
                          }}
                          disabled={genericUnassignedAssigning}
                          className="rounded border border-red-200 px-2 py-1.5 text-sm text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-900/30"
                        >
                          Delete
                        </button>
                        <span className="text-sm text-zinc-500 dark:text-zinc-400">
                          {selectedGenericUnassignedIds.size} selected
                        </span>
                      </>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                    {filteredGenericUnassigned.map((m) => (
                      <ZillowStagingThumbnail
                        key={m.id}
                        media={m}
                        selected={selectedGenericUnassignedIds.has(m.id)}
                        onToggleSelect={() => {
                          setSelectedGenericUnassignedIds((prev) => {
                            const next = new Set(prev);
                            if (next.has(m.id)) next.delete(m.id);
                            else next.add(m.id);
                            return next;
                          });
                        }}
                        onDelete={async () => {
                          if (!confirm("Delete this photo?")) return;
                          await deleteMediaAction(projectId, m.id);
                          router.refresh();
                        }}
                      />
                    ))}
                  </div>
                </>
              )}
              {/* Empty-state branching: distinguish "no photos at all" from
                  "no photos match the active batch filter". */}
              {genericUnassigned.length === 0 ? (
                <p className="rounded-lg border border-dashed border-zinc-300 py-8 text-center text-sm text-zinc-500 dark:border-zinc-600 dark:text-zinc-400">
                  No unassigned photos. Photos you upload or import (other than from Zillow) are assigned to the section you choose. Zillow-imported photos appear under Imported from Zillow.
                </p>
              ) : filteredGenericUnassigned.length === 0 ? (
                <p className="rounded-lg border border-dashed border-zinc-300 py-8 text-center text-sm text-zinc-500 dark:border-zinc-600 dark:text-zinc-400">
                  No photos match the selected batch filter.{" "}
                  <button
                    type="button"
                    onClick={() => setUnassignedBatchFilter("all")}
                    className="underline hover:text-zinc-900 dark:hover:text-zinc-200"
                  >
                    Clear filter
                  </button>
                </p>
              ) : null}
            </div>
          ) : activeRoomId === RENDR_PHOTOS_ID ? (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                Imported from Rendr
              </h2>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                Photos from your linked Rendr scan. Select photos below and assign them to a section or move to Front Page Photos. Already-imported photos are marked and can be re-imported if needed.
              </p>
              {rendrPhotosLoading && (
                <p className="rounded-lg border border-dashed border-zinc-300 py-8 text-center text-sm text-zinc-500 dark:border-zinc-600 dark:text-zinc-400">
                  Loading Rendr photos…
                </p>
              )}
              {rendrPhotosError && (
                <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/30 dark:text-red-300">
                  {rendrPhotosError}
                </p>
              )}
              {rendrImportResult && (
                <p className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700 dark:border-green-800 dark:bg-green-900/30 dark:text-green-300">
                  {rendrImportResult}
                </p>
              )}
              {!rendrPhotosLoading && !rendrPhotosError && rendrPhotos.length > 0 && (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedRendrPhotoIds(new Set(rendrPhotos.map((p) => p.id)))}
                      className="rounded border border-zinc-300 px-2 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    >
                      Select All
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedRendrPhotoIds(new Set());
                        setRendrAssignRoomId("");
                      }}
                      className="rounded border border-zinc-300 px-2 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    >
                      Clear selection
                    </button>
                    {selectedRendrPhotoIds.size > 0 && (
                      <>
                        <select
                          value={rendrAssignRoomId}
                          onChange={(e) => setRendrAssignRoomId(e.target.value)}
                          className="rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                          aria-label="Assign to section"
                        >
                          <option value="">Assign to Section…</option>
                          <option value={FRONT_PAGE_ID}>Front Page</option>
                          <option value={UNASSIGNED_PHOTOS_ID}>Unassigned</option>
                          {rooms.map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.name}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          disabled={!rendrAssignRoomId || rendrImporting}
                          onClick={async () => {
                            if (!rendrAssignRoomId) return;
                            setRendrImporting(true);
                            setRendrImportResult(null);
                            setRendrPhotosError(null);
                            const photoIds = Array.from(selectedRendrPhotoIds);
                            const target =
                              rendrAssignRoomId === FRONT_PAGE_ID
                                ? { roomId: null, frontPage: true }
                                : rendrAssignRoomId === UNASSIGNED_PHOTOS_ID
                                  ? { roomId: null, frontPage: false }
                                  : { roomId: rendrAssignRoomId, frontPage: false };
                            const result = await importRendrPhotosAction(projectId, photoIds, target);
                            setRendrImporting(false);
                            if (result.error) {
                              setRendrPhotosError(result.error);
                            } else {
                              setRendrImportResult(
                                `Imported ${result.imported} photo${result.imported !== 1 ? "s" : ""}` +
                                  (result.skipped > 0 ? ` (${result.skipped} skipped)` : "") +
                                  "."
                              );
                              setSelectedRendrPhotoIds(new Set());
                              setRendrAssignRoomId("");
                              router.refresh();
                            }
                          }}
                          className="rounded bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                        >
                          {rendrImporting ? "Importing…" : "Import to Section"}
                        </button>
                        <span className="text-sm text-zinc-500 dark:text-zinc-400">
                          {selectedRendrPhotoIds.size} selected
                        </span>
                      </>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                    {rendrPhotos.map((photo) => {
                      const isSelected = selectedRendrPhotoIds.has(photo.id);
                      const alreadyImported = importedRendrPhotoIds.has(photo.id);
                      return (
                        <button
                          key={photo.id}
                          type="button"
                          onClick={() => {
                            setSelectedRendrPhotoIds((prev) => {
                              const next = new Set(prev);
                              if (next.has(photo.id)) next.delete(photo.id);
                              else next.add(photo.id);
                              return next;
                            });
                          }}
                          className={`group relative aspect-[4/3] overflow-hidden rounded-lg border-2 transition-shadow focus:outline-none ${
                            isSelected
                              ? "border-blue-500 ring-2 ring-blue-400"
                              : "border-zinc-200 hover:border-zinc-300 dark:border-zinc-700 dark:hover:border-zinc-500"
                          }`}
                        >
                          <img
                            src={`/api/rendr/spaces/${rendrSpaceId}/photos/${photo.id}`}
                            alt="Rendr photo"
                            className="h-full w-full object-cover"
                            loading="lazy"
                          />
                          {isSelected && (
                            <span className="absolute left-1 top-1 rounded bg-blue-600 px-1.5 py-0.5 text-[10px] font-medium text-white">
                              Selected
                            </span>
                          )}
                          {alreadyImported && (
                            <span className="absolute right-1 top-1 rounded bg-green-600 px-1.5 py-0.5 text-[10px] font-medium text-white">
                              Imported
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
              {!rendrPhotosLoading && !rendrPhotosError && rendrPhotosLoaded && rendrPhotos.length === 0 && (
                <p className="rounded-lg border border-dashed border-zinc-300 py-8 text-center text-sm text-zinc-500 dark:border-zinc-600 dark:text-zinc-400">
                  No photos found on the linked Rendr scan.
                </p>
              )}
            </div>
          ) : activeRoomId === FRONT_PAGE_ID ? (
            <FrontPageHeroEditor
              projectId={projectId}
              media={media}
              coverHeroImageId={coverHeroImageId ?? null}
            />
          ) : activeRoom ? (
            <>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                  {activeRoom.name}
                </h2>
                <div className="flex flex-wrap items-center gap-2">
                  <ExistingUploadButton
                    projectId={projectId}
                    roomId={activeRoom.id}
                    onSuccess={() => router.refresh()}
                    onError={setUploadError}
                    onBatchResult={setUploadResult}
                  />
                </div>
              </div>
              {rootRenderCount >= 3 && (
                <p className="mb-2 text-sm text-amber-600 dark:text-amber-400">
                  Max 3 concepts per room. Delete one to generate another.
                </p>
              )}
              {renderError && (
                <p className="mb-2 text-sm text-red-600 dark:text-red-400">{renderError}</p>
              )}
              <p className="mb-4 text-xs text-zinc-500 dark:text-zinc-400">
                Rendering: Per Scope of Work
                {projectStylePreset?.name ? ` + ${projectStylePreset.name}` : ""}
              </p>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="mb-2 text-sm font-medium text-zinc-600 dark:text-zinc-400">Before</p>
                  <div className="relative aspect-[4/3] overflow-hidden rounded-lg border border-zinc-200 bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800">
                    {selectedBefore ? (
                      isLegacyBlobUrl(selectedBefore.url) || !isAllowedHostForNextImage(selectedBefore.url) ? (
                        <img
                          src={selectedBefore.url}
                          alt="Before"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <Image
                          src={selectedBefore.url}
                          alt="Before"
                          fill
                          className="object-cover"
                          sizes="(max-width:768px) 50vw, 25vw"
                          unoptimized={
                            selectedBefore.url.startsWith("blob:") || !selectedBefore.url.startsWith("http")
                          }
                        />
                      )
                    ) : (
                      <div className="flex h-full items-center justify-center text-sm text-zinc-500">
                        Upload/select a photo
                      </div>
                    )}
                  </div>
                </div>
                <div>
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Render</p>
                    {bigPreviewMedia && selectedRenderIdOnRoom === bigPreviewMedia.id && (
                      <span className="rounded bg-green-100 px-1.5 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900/50 dark:text-green-300">
                        Selected for Proposal
                      </span>
                    )}
                    {selectedRenderIdOnRoom && (
                      <button
                        type="button"
                        onClick={handleClearSelected}
                        className="text-xs text-zinc-500 underline hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300"
                      >
                        Clear Selected
                      </button>
                    )}
                  </div>
                  <div className="relative aspect-[4/3] overflow-hidden rounded-lg border border-zinc-200 bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800">
                    {bigPreviewMedia ? (
                      bigPreviewShowSpinner ? (
                        <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-zinc-500">
                          <span className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-400 border-t-transparent" />
                          {bigPreviewRenderStatus === "QUEUED" ? "Queued…" : "Rendering…"}
                        </div>
                      ) : bigPreviewUsePlainImg ? (
                        <img
                          src={bigPreviewMedia.url}
                          alt="Render"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <Image
                          src={bigPreviewMedia.url}
                          alt="Render"
                          fill
                          className="object-cover"
                          sizes="(max-width:768px) 50vw, 25vw"
                          unoptimized={
                            bigPreviewMedia.url.startsWith("blob:") || !bigPreviewMedia.url.startsWith("http")
                          }
                        />
                      )
                    ) : (
                      <div className="flex h-full items-center justify-center text-sm text-zinc-500">
                        No concepts yet for this photo
                      </div>
                    )}
                  </div>
                  {bigPreviewMedia && conceptGroups.length > 0 && (
                    <div className="mt-1.5 space-y-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                      {viewingLabel && <p>Viewing: {viewingLabel}</p>}
                      {selectedRenderIdOnRoom && selectedLabel && (
                        <p className={activeRenderMediaId === selectedRenderIdOnRoom ? "text-green-600 dark:text-green-400" : ""}>
                          Selected for Proposal: {selectedLabel}
                        </p>
                      )}
                    </div>
                  )}
                  {bigPreviewMedia?.sourceMediaId && !bigPreviewShowSpinner && bigPreviewMedia.url && (
                    <ChangesDetectedSummary
                      projectId={projectId}
                      sourceMediaId={bigPreviewMedia.sourceMediaId}
                      renderMediaId={bigPreviewMedia.id}
                    />
                  )}
                </div>
              </div>

              <div className="mt-6">
                <p className="mb-2 text-sm font-medium text-zinc-600 dark:text-zinc-400">
                  Existing Photos
                </p>
                {existingForActive.length === 0 ? (
                  <p className="text-sm text-zinc-500">Upload an existing photo first.</p>
                ) : (
                  <div className="flex flex-col rounded-lg border border-zinc-200 dark:border-zinc-700">
                    <div className="flex flex-wrap items-center gap-1.5 px-2 pt-2">
                      {existingForActive.map((m) => {
                        const isSelected = m.id === effectiveSourceMediaId;
                        return (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => setActiveSourceMediaId(m.id)}
                            title="Select as source for concepts"
                            className={`relative h-[72px] w-[72px] shrink-0 overflow-hidden rounded-lg border-2 transition-shadow focus:outline-none focus:ring-0 ${
                              isSelected
                                ? "ring-2 ring-blue-600 ring-offset-1 border-blue-500 dark:ring-offset-zinc-900"
                                : "border-zinc-200 dark:border-zinc-600"
                            }`}
                          >
                            {isLegacyBlobUrl(m.url) || !isAllowedHostForNextImage(m.url) ? (
                              <img src={m.url} alt="" className="h-full w-full object-cover" />
                            ) : (
                              <Image
                                src={m.url}
                                alt=""
                                fill
                                className="object-cover"
                                sizes="72px"
                                unoptimized={m.url.startsWith("blob:") || !m.url.startsWith("http")}
                              />
                            )}
                            {isSelected && (
                              <span className="absolute top-0.5 left-0.5 rounded bg-blue-600 px-1 py-0.5 text-[10px] font-medium text-white">
                                Selected
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                    {effectiveSourceMediaId && existingForActive.some((m) => m.id === effectiveSourceMediaId) && (
                      <p className="mt-1 px-2 text-xs text-zinc-500 dark:text-zinc-400">
                        Selected: source photo for concepts
                      </p>
                    )}
                    <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-zinc-200 px-2 py-2 dark:border-zinc-700">
                      <button
                        type="button"
                        disabled={
                          existingPhotoAction !== "idle" ||
                          !effectiveSourceMediaId ||
                          !existingForActive.some((m) => m.id === effectiveSourceMediaId)
                        }
                        onClick={async () => {
                          if (!effectiveSourceMediaId) return;
                          setExistingPhotoAction("remove");
                          try {
                            await updateMediaRoomAction(projectId, effectiveSourceMediaId, null, "UNASSIGNED");
                            router.refresh();
                          } finally {
                            setExistingPhotoAction("idle");
                          }
                        }}
                        className="rounded border border-zinc-300 px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-700"
                      >
                        {existingPhotoAction === "remove" ? "Removing…" : "Remove from Section"}
                      </button>
                      <button
                        type="button"
                        disabled={
                          existingPhotoAction !== "idle" ||
                          !effectiveSourceMediaId ||
                          !existingForActive.some((m) => m.id === effectiveSourceMediaId)
                        }
                        onClick={async () => {
                          if (!effectiveSourceMediaId) return;
                          if (!confirm("Permanently delete this photo from the project? This cannot be undone.")) return;
                          setExistingPhotoAction("delete");
                          try {
                            await deleteMediaAction(projectId, effectiveSourceMediaId);
                            router.refresh();
                          } finally {
                            setExistingPhotoAction("idle");
                          }
                        }}
                        className="rounded border border-red-200 px-2 py-1 text-xs text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-900/30"
                      >
                        {existingPhotoAction === "delete" ? "Deleting…" : "Delete"}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-6">
                <p className="mb-2 text-sm font-medium text-zinc-600 dark:text-zinc-400">
                  Rendered Photos
                </p>
                <p className="mb-2 text-xs text-zinc-500 dark:text-zinc-400">
                  AI renderings for this section, grouped by source photo. Select a source above to see or create concepts.
                </p>
                {effectiveSourceMediaId != null && rootRenderCount >= 3 && (
                  <p className="mb-2 text-sm text-amber-600 dark:text-amber-400">
                    Max 3 concepts per room. Delete one to add another.
                  </p>
                )}
                {effectiveSourceMediaId == null ? (
                  <p className="text-sm text-zinc-500">
                    Select a before photo above to see or create concepts.
                  </p>
                ) : conceptVersionsForSelectedBefore.length === 0 ? (
                  activeRoomId && activeRoomId !== FRONT_PAGE_ID ? (
                    <div className="rounded-lg border border-zinc-200 bg-zinc-50/50 py-4 px-4 dark:border-zinc-700 dark:bg-zinc-800/30">
                      <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Render Controls</h3>
                      <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                        These changes will be applied to the new render generated from this photo.
                      </p>
                      {bulletsLoading ? (
                        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400 animate-pulse">
                          Extracting visual changes from scope...
                        </p>
                      ) : activeRoomBullets.length === 0 ? (
                        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                          No scope for this section. Add a renovation description in the Sections tab to see specific changes here.
                        </p>
                      ) : (
                        <ul className="mt-2 space-y-1.5">
                          {activeRoomBullets.map((bullet) => (
                            <li key={bullet} className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                id={`render-bullet-${bullet.slice(0, 40).replace(/\s+/g, "-")}`}
                                checked={activeRoomBulletChecked(bullet)}
                                onChange={(e) => setActiveRoomBulletChecked(bullet, e.target.checked)}
                                className="h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-500 dark:border-zinc-600 dark:bg-zinc-800"
                              />
                              <label
                                htmlFor={`render-bullet-${bullet.slice(0, 40).replace(/\s+/g, "-")}`}
                                className="text-sm text-zinc-700 dark:text-zinc-300"
                              >
                                {bullet}
                              </label>
                            </li>
                          ))}
                        </ul>
                      )}
                      <div className="mt-2 flex items-start gap-2">
                        <input
                          type="checkbox"
                          id="render-custom-change-enabled"
                          checked={customChangeEnabled}
                          onChange={(e) => setCustomChangeEnabled(e.target.checked)}
                          className="mt-1 h-4 w-4 shrink-0 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-500 dark:border-zinc-600 dark:bg-zinc-800"
                        />
                        <div className="min-w-0 flex-1">
                          <label htmlFor="render-custom-change-enabled" className="text-sm text-zinc-700 dark:text-zinc-300">
                            Custom change:
                          </label>
                          <input
                            type="text"
                            value={customChangeText}
                            onChange={(e) => setCustomChangeText(e.target.value)}
                            placeholder="e.g. Add under-cabinet lighting"
                            className="mt-0.5 w-full rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300 dark:placeholder:text-zinc-500"
                          />
                        </div>
                      </div>
                      <div className="mt-3 flex justify-end">
                        <button
                          type="button"
                          disabled={rendering || !effectiveSourceMediaId}
                          onClick={handleRenderNew}
                          className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                        >
                          {rendering ? "Rendering…" : "Render New"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-start gap-3 rounded-lg border border-zinc-200 bg-zinc-50/50 py-6 dark:border-zinc-700 dark:bg-zinc-800/30">
                      <p className="px-4 text-sm text-zinc-600 dark:text-zinc-400">
                        No concepts yet for this photo
                      </p>
                      <div className="ml-4 flex justify-end">
                        <button
                          type="button"
                          disabled={rendering || !effectiveSourceMediaId}
                          onClick={handleRenderNew}
                          className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                        >
                          {rendering ? "Rendering…" : "Render New"}
                        </button>
                      </div>
                    </div>
                  )
                ) : (
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    {conceptGroups.map((group) => {
                      const activeInConcept = group.versions.find((m) => m.id === activeRenderMediaId);
                      const selectedInConcept = selectedRenderIdOnRoom
                        ? group.versions.find((v) => v.id === selectedRenderIdOnRoom)
                        : null;
                      const conceptActiveMediaId =
                        activeInConcept ??
                        selectedInConcept ??
                        latestDone(group.versions) ??
                        group.root;
                      const conceptActiveNormalizedStatus = getNormalizedRenderStatus(conceptActiveMediaId);
                      const updatesCount = group.children.length;
                      const updateDisabled = updatesCount >= 3;
                      return (
                        <div
                          key={group.rootId}
                          className="flex flex-col rounded-lg border border-zinc-200 dark:border-zinc-700"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-1 px-2 pt-2">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                                {group.conceptLabel}
                              </p>
                              {group.versions.some((v) => v.id === activeRenderMediaId) && (
                                <span className="rounded bg-blue-100 px-1.5 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-900/50 dark:text-blue-300">
                                  Viewing
                                </span>
                              )}
                              {selectedRenderIdOnRoom && group.versions.some((v) => v.id === selectedRenderIdOnRoom) && (
                                <span className="rounded bg-green-100 px-1.5 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900/50 dark:text-green-300">
                                  Selected for Proposal
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-zinc-500 dark:text-zinc-400">
                              Versions: {group.versions.map((m) => getVersionLabel(group, m)).join(", ")}
                            </p>
                          </div>
                          <div className="mt-1.5 flex flex-wrap gap-1.5 px-2">
                            {group.versions.map((m) => {
                              const isViewing = m.id === activeRenderMediaId;
                              const isSelected = activeRoom?.selectedRenderMediaId === m.id;
                              const parentLabel = m.parentMediaId ? "Updated from v1" : "";
                              const tooltip = getThumbnailTooltip(m, group, parentLabel);
                              const normalizedStatus = getNormalizedRenderStatus(m);
                              return (
                                <button
                                  key={m.id}
                                  type="button"
                                  onClick={() => setActiveRenderMediaId(m.id)}
                                  title={tooltip}
                                  className={`relative h-[72px] w-[72px] shrink-0 overflow-hidden rounded-lg border-2 transition-shadow ${
                                    isViewing
                                      ? "ring-2 ring-blue-600 ring-offset-1 border-blue-500 dark:ring-offset-zinc-900"
                                      : isSelected
                                        ? "ring-2 ring-green-500 ring-offset-1 border-green-500 dark:ring-offset-zinc-900"
                                        : "border-zinc-200 dark:border-zinc-600"
                                  }`}
                                >
                                  {normalizedStatus === "QUEUED" || normalizedStatus === "RENDERING" ? (
                                    <span className="flex h-full w-full flex-col items-center justify-center gap-1 bg-zinc-100 text-[10px] text-zinc-600 dark:bg-zinc-700 dark:text-zinc-400">
                                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-400 border-t-transparent" />
                                      Generating…
                                    </span>
                                  ) : normalizedStatus === "FAILED" ? (
                                    <span className="flex h-full w-full items-center justify-center bg-red-100 text-xs dark:bg-red-900/50 dark:text-red-300">
                                      ✕
                                    </span>
                                  ) : !isBadPlaceholderUrl(m.url) ? (
                                    isLegacyBlobUrl(m.url) || !isAllowedHostForNextImage(m.url) ? (
                                      <img src={m.url} alt="" className="h-full w-full object-cover" />
                                    ) : (
                                      <Image
                                        src={m.url}
                                        alt=""
                                        fill
                                        className="object-cover"
                                        sizes="72px"
                                        unoptimized={m.url.startsWith("blob:") || !m.url.startsWith("http")}
                                      />
                                    )
                                  ) : (
                                    <span className="flex h-full w-full items-center justify-center bg-zinc-100 text-[10px] text-zinc-500 dark:bg-zinc-700 dark:text-zinc-400">
                                      No image
                                    </span>
                                  )}
                                  {isSelected && (
                                    <span className="absolute bottom-0 left-0 right-0 bg-green-600 py-0.5 text-center text-[10px] font-medium text-white">
                                      Selected for Proposal
                                    </span>
                                  )}
                                  <span className="absolute top-0.5 left-0.5 rounded bg-black/60 px-1 py-0.5 text-[10px] text-white">
                                    {getVersionLabel(group, m)}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-zinc-200 px-2 py-2 dark:border-zinc-700">
                            <span
                              className={`rounded px-1.5 py-0.5 text-xs ${
                                conceptActiveNormalizedStatus === "DONE"
                                  ? "bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300"
                                  : conceptActiveNormalizedStatus === "FAILED"
                                    ? "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300"
                                    : "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300"
                              }`}
                            >
                              {conceptActiveNormalizedStatus === "DONE"
                                ? "DONE"
                                : conceptActiveNormalizedStatus === "FAILED"
                                  ? "FAILED"
                                  : conceptActiveNormalizedStatus === "QUEUED"
                                    ? "QUEUED"
                                    : conceptActiveNormalizedStatus === "RENDERING"
                                      ? "RENDERING"
                                      : "Pending"}
                            </span>
                            {activeRoom?.selectedRenderMediaId === conceptActiveMediaId.id ? (
                              <button
                                type="button"
                                onClick={handleClearSelected}
                                className="rounded border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-100 dark:border-zinc-600 dark:hover:bg-zinc-700"
                              >
                                Clear Selected
                              </button>
                            ) : (
                              <button
                                type="button"
                                disabled={conceptActiveNormalizedStatus !== "DONE"}
                                onClick={() => conceptActiveNormalizedStatus === "DONE" && handleSetSelected(conceptActiveMediaId.id)}
                                title={conceptActiveNormalizedStatus !== "DONE" ? "Available when render is DONE" : undefined}
                                className="rounded border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-600 dark:hover:bg-zinc-700"
                              >
                                Set Selected
                              </button>
                            )}
                            <button
                              type="button"
                              disabled={updateDisabled || conceptActiveNormalizedStatus !== "DONE"}
                              onClick={() =>
                                !updateDisabled &&
                                conceptActiveNormalizedStatus === "DONE" &&
                                openUpdateModal(conceptActiveMediaId.id)
                              }
                              title={
                                updateDisabled
                                  ? "Max 3 versions per concept."
                                  : conceptActiveNormalizedStatus !== "DONE"
                                    ? "Available when render is DONE"
                                    : undefined
                              }
                              className="rounded border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-600 dark:hover:bg-zinc-700"
                            >
                              Update
                            </button>
                            {updateDisabled && (
                              <span className="text-[10px] text-amber-600 dark:text-amber-400" title="Max 3 versions per concept.">
                                (max 3)
                              </span>
                            )}
                            {conceptActiveMediaId.url && !isBadPlaceholderUrl(conceptActiveMediaId.url) ? (
                              <a
                                href={conceptActiveMediaId.url}
                                download
                                target="_blank"
                                rel="noopener noreferrer"
                                className="rounded border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-100 dark:border-zinc-600 dark:hover:bg-zinc-700"
                              >
                                Download
                              </a>
                            ) : (
                              <span
                                className="cursor-not-allowed rounded border border-zinc-200 px-2 py-1 text-xs text-zinc-400 dark:border-zinc-600 dark:text-zinc-500"
                                title="Download available when render has finished"
                              >
                                Download
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={() => handleDeleteRender(conceptActiveMediaId.id)}
                              className="rounded border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/30"
                            >
                              Delete
                            </button>
                          </div>
                          {conceptActiveMediaId.renderStatus === "FAILED" && conceptActiveMediaId.renderError && (
                            <p className="truncate px-2 pb-2 text-xs text-red-600 dark:text-red-400" title={conceptActiveMediaId.renderError}>
                              {conceptActiveMediaId.renderError}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
                {unlinkedRoomConcepts.length > 0 && (
                  <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50/50 p-3 dark:border-amber-800 dark:bg-amber-900/20">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                          Concepts in this section not linked to a Before photo
                        </p>
                        <p className="text-xs text-amber-700/80 dark:text-amber-400/80">
                          Likely restored from Orphaned Renderings. Click &quot;Link to selected Before&quot; to attach a concept to the photo currently selected in the Existing Photos strip below.
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-3">
                      {unlinkedRoomConcepts.map((m) => {
                        const status = getNormalizedRenderStatus(m);
                        const usePlainImg = isLegacyBlobUrl(m.url) || !isAllowedHostForNextImage(m.url);
                        return (
                          <div
                            key={m.id}
                            className="flex w-[156px] flex-col rounded-lg border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900"
                          >
                            <div className="relative aspect-[4/3] overflow-hidden rounded-t-lg bg-zinc-100 dark:bg-zinc-800">
                              {status === "DONE" && !isBadPlaceholderUrl(m.url) ? (
                                usePlainImg ? (
                                  <img src={m.url} alt="" className="h-full w-full object-cover" />
                                ) : (
                                  <Image
                                    src={m.url}
                                    alt=""
                                    fill
                                    className="object-cover"
                                    sizes="156px"
                                    unoptimized={m.url.startsWith("blob:") || !m.url.startsWith("http")}
                                  />
                                )
                              ) : status === "FAILED" ? (
                                <span className="flex h-full w-full items-center justify-center text-xs text-red-600 dark:text-red-400">Failed</span>
                              ) : (
                                <span className="flex h-full w-full items-center justify-center text-xs text-zinc-500">{status}</span>
                              )}
                            </div>
                            <div className="flex flex-col gap-1.5 p-2">
                              <button
                                type="button"
                                onClick={() => handleLinkRenderingToBefore(m.id)}
                                disabled={!effectiveSourceMediaId}
                                title={
                                  !effectiveSourceMediaId
                                    ? "Select a Before photo first"
                                    : "Attach this concept to the currently-selected Before photo"
                                }
                                className="rounded border border-amber-300 bg-amber-100 px-2 py-1 text-xs font-medium text-amber-900 hover:bg-amber-200 disabled:opacity-50 dark:border-amber-700 dark:bg-amber-900/40 dark:text-amber-200 dark:hover:bg-amber-900/60"
                              >
                                Link to selected Before
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteRender(m.id)}
                                className="rounded border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/30"
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Update Render modal */}
              {updateModalRenderId != null && (
                <div
                  className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="update-render-title"
                >
                  <div className="w-full max-w-md rounded-lg border border-zinc-200 bg-white p-4 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
                    <h2 id="update-render-title" className="mb-3 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                      Update Render
                    </h2>
                    <textarea
                      value={updateInstruction}
                      onChange={(e) => setUpdateInstruction(e.target.value)}
                      onKeyDown={handleUpdateModalKeyDown}
                      placeholder="e.g. Leave everything as is but change cabinets to navy blue…"
                      rows={4}
                      className="mb-3 w-full rounded border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                      disabled={updateSubmitting}
                    />
                    {updateError && (
                      <p className="mb-2 text-sm text-red-600 dark:text-red-400">{updateError}</p>
                    )}
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={closeUpdateModal}
                        disabled={updateSubmitting}
                        className="rounded border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleSubmitUpdate}
                        disabled={updateSubmitting || !canSubmitUpdate()}
                        className="rounded bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                      >
                        {updateSubmitting ? "Updating…" : "Update"}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : (
            <p className="text-zinc-500">Select a section from the list.</p>
          )}
        </div>
      </section>

      {/* Orphaned Renderings — renderings with no room (e.g. room deleted) */}
      {orphanedRenderings.length > 0 && (
        <section className="rounded-lg border border-amber-200 p-4 dark:border-amber-800">
          <h2 className="mb-3 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            Orphaned Renderings
          </h2>
          <p className="mb-3 text-sm text-zinc-500">
            AI renderings that are not linked to any section (e.g. section was deleted). Assign to a section to restore them.
          </p>
          <div className="space-y-3">
            {orphanedRenderings.map((m) => (
              <UnassignedRow
                key={m.id}
                projectId={projectId}
                media={m}
                rooms={rooms}
                onAssign={() => router.refresh()}
                onMoveToFrontPage={() => router.refresh()}
                onDelete={async () => {
                  if (!confirm("Delete this rendering?")) return;
                  await deleteMediaAction(projectId, m.id);
                  router.refresh();
                }}
              />
            ))}
          </div>
        </section>
      )}

      {/* Zillow Import modal: Connect Browser onboarding */}
      {zillowImportModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="zillow-connect-title"
        >
          <div className="w-full max-w-md rounded-lg border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
            {/* Hidden element for extension content script */}
            {directNonce != null && directSessionId != null && (
              <div
                id="zillow-connection-handshake"
                data-nonce={directNonce}
                data-session-id={directSessionId}
                aria-hidden="true"
                className="hidden"
              />
            )}

            {/* Header */}
            <div className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-700">
              <h2 id="zillow-connect-title" className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                Connect Browser
              </h2>
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                Securely connect this browser to Zillow Import so listing photos and details can be brought into this project.
              </p>
            </div>

            {/* Body: state-based message */}
            <div className="min-h-[4rem] px-4 py-4">
              {/* Checking browser… / Checking extension… */}
              {(zillowDetectionStatus === "idle" || zillowDetectionStatus === "detecting") && (
                <div className="flex items-center gap-3">
                  <span className="h-6 w-6 shrink-0 animate-spin rounded-full border-2 border-zinc-400 border-t-transparent" aria-hidden />
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">
                    {zillowDetectionStatus === "idle" ? "Checking browser…" : "Checking extension…"}
                  </p>
                </div>
              )}

              {/* Unsupported: Zillow Import works in desktop Chrome or Edge. */}
              {zillowDetectionStatus === "done" && (zillowReadinessState === "unsupportedBrowser" || zillowReadinessState === "unsupportedMobile") && (
                <p className="text-sm text-zinc-700 dark:text-zinc-300">
                  Zillow Import works in desktop Chrome or Edge.
                </p>
              )}

              {/* No extension: setup instructions */}
              {zillowDetectionStatus === "done" && zillowReadinessState === "supportedNoExtension" && !showManualFallback && (
                <div className="space-y-2 text-sm text-zinc-700 dark:text-zinc-300">
                  <p>
                    You’ll need the Zillow Import browser extension to import photos and listing details from Zillow. This is a one-time setup.
                  </p>
                  <p>
                    Load the extension from the <code className="rounded bg-zinc-200 px-1 dark:bg-zinc-700">chrome-extension/zillow-importer</code> folder (Chrome → Extensions → Load unpacked). When you’re done, click Connect Browser again to retry.
                  </p>
                </div>
              )}

              {/* Direct handshake ready: Connecting browser… + spinner */}
              {zillowDetectionStatus === "done" && zillowReadinessState === "supportedDirectHandshakeReady" && (
                <>
                  {directStatus === "idle" && !directNonce && (
                    <div className="flex items-center gap-3">
                      <span className="h-6 w-6 shrink-0 animate-spin rounded-full border-2 border-zinc-400 border-t-transparent" aria-hidden />
                      <p className="text-sm text-zinc-600 dark:text-zinc-400">
                        Connecting browser…
                      </p>
                    </div>
                  )}
                  {directStatus === "connecting" && (
                    <div className="flex items-center gap-3">
                      <span className="h-6 w-6 shrink-0 animate-spin rounded-full border-2 border-zinc-400 border-t-transparent" aria-hidden />
                      <div>
                        <p className="text-sm text-zinc-600 dark:text-zinc-400">
                          Extension detected. Connecting your browser…
                        </p>
                        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                          Open the Zillow Import extension and click Connect (or Pair) to finish.
                        </p>
                      </div>
                    </div>
                  )}
                  {directStatus === "connected" && (
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-green-700 dark:text-green-400">
                        Browser connected. Zillow Import is ready.
                      </p>
                      {projectAddress?.trim() ? (
                        <p className="text-xs text-zinc-500 dark:text-zinc-400">
                          Opening Zillow for <strong>{projectAddress}</strong>… Photos will be captured automatically when the listing loads.
                        </p>
                      ) : (
                        <p className="text-xs text-zinc-500 dark:text-zinc-400">
                          No project address on Overview. Open Zillow manually to import listing photos.
                        </p>
                      )}
                    </div>
                  )}
                  {(showManualFallback || directStatus === "failed" || directStatus === "expired") && (
                    <>
                      <p className="text-sm text-zinc-700 dark:text-zinc-300">
                        Connection failed. You can connect using a code instead.
                      </p>
                      {pairCodeError && (
                        <p className="mt-2 text-xs text-red-600 dark:text-red-400">{pairCodeError}</p>
                      )}
                      {pairCode ? (
                        <>
                          <div className="mt-3 flex items-center justify-center rounded-lg border border-zinc-200 bg-zinc-50 py-3 dark:border-zinc-700 dark:bg-zinc-800">
                            <span className="font-mono text-xl font-bold tracking-widest text-zinc-900 dark:text-zinc-100">
                              {pairCode}
                            </span>
                          </div>
                          <p className="mt-2 text-center text-xs text-zinc-500 dark:text-zinc-400">
                            Expires {pairCodeExpiresAt ? new Date(pairCodeExpiresAt).toLocaleString() : ""}
                          </p>
                          <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                            Open the Zillow Import extension, paste this code, and connect. Then use Capture Gallery on a Zillow listing and Open Photo Picker to import.
                          </p>
                        </>
                      ) : (
                        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
                          Click Generate Code below, then paste it in the extension.
                        </p>
                      )}
                    </>
                  )}
                </>
              )}

              {/* Extension detected but direct could not be completed */}
              {zillowDetectionStatus === "done" && (zillowReadinessState === "supportedExtensionDetected" || zillowReadinessState === "supportedFallbackOnly" || zillowReadinessState === "unknownOrDegraded") && (
                <>
                  <p className="text-sm text-zinc-700 dark:text-zinc-300">
                    Extension detected but direct connection could not be completed.
                  </p>
                  {pairCodeError && (
                    <p className="mt-2 text-xs text-red-600 dark:text-red-400">{pairCodeError}</p>
                  )}
                  {pairCode ? (
                    <>
                      <div className="mt-3 flex items-center justify-center rounded-lg border border-zinc-200 bg-zinc-50 py-3 dark:border-zinc-700 dark:bg-zinc-800">
                        <span className="font-mono text-xl font-bold tracking-widest text-zinc-900 dark:text-zinc-100">
                          {pairCode}
                        </span>
                      </div>
                      <p className="mt-2 text-center text-xs text-zinc-500 dark:text-zinc-400">
                        Expires {pairCodeExpiresAt ? new Date(pairCodeExpiresAt).toLocaleString() : ""}
                      </p>
                      <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                        Open the Zillow Import extension, paste this code, and connect. Then use Capture Gallery on a Zillow listing and Open Photo Picker to import.
                      </p>
                    </>
                  ) : (
                    <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
                      Click Generate Code below, then paste it in the extension.
                    </p>
                  )}
                </>
              )}

              {/* No extension but user chose manual: simplified manual UI */}
              {zillowDetectionStatus === "done" && zillowReadinessState === "supportedNoExtension" && showManualFallback && (
                <>
                  {pairCodeError && (
                    <p className="text-xs text-red-600 dark:text-red-400">{pairCodeError}</p>
                  )}
                  {pairCode ? (
                    <>
                      <div className="flex items-center justify-center rounded-lg border border-zinc-200 bg-zinc-50 py-3 dark:border-zinc-700 dark:bg-zinc-800">
                        <span className="font-mono text-xl font-bold tracking-widest text-zinc-900 dark:text-zinc-100">
                          {pairCode}
                        </span>
                      </div>
                      <p className="mt-2 text-center text-xs text-zinc-500 dark:text-zinc-400">
                        Expires {pairCodeExpiresAt ? new Date(pairCodeExpiresAt).toLocaleString() : ""}
                      </p>
                      <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                        Open the Zillow Import extension, paste this code, and connect. Then use Capture Gallery on a Zillow listing and Open Photo Picker to import.
                      </p>
                    </>
                  ) : (
                    <p className="text-sm text-zinc-500 dark:text-zinc-400">
                      Generate a code below, then open the extension and paste it to connect.
                    </p>
                  )}
                </>
              )}
            </div>

            {/* Footer: action buttons */}
            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-zinc-200 px-4 py-3 dark:border-zinc-700">
              {zillowDetectionStatus === "done" && zillowReadinessState === "supportedNoExtension" && !showManualFallback && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      try {
                        if (ZILLOW_EXTENSION_STORE_URL) {
                          window.open(ZILLOW_EXTENSION_STORE_URL, "_blank", "noopener");
                        } else {
                          window.open("chrome://extensions", "_blank", "noopener");
                        }
                      } catch {
                        // ignore
                      }
                    }}
                    className="rounded bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                  >
                    {ZILLOW_EXTENSION_STORE_URL ? "Install Extension" : "Open Chrome Extensions"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowManualFallback(true)}
                    className="rounded border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  >
                    Use Manual Code Instead
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      if (directSessionId && directStatus === "connecting") {
                        await markConnectionFailedAction(directSessionId);
                      }
                      directStartAttemptedRef.current = false;
                      setPairCode(null);
                      setPairCodeExpiresAt(null);
                      setPairCodeError(null);
                      setDirectSessionId(null);
                      setDirectNonce(null);
                      setDirectStatus("idle");
                      setDirectError(null);
                      setShowManualFallback(false);
                      setZillowDetectionStatus("idle");
                      setZillowReadinessState(null);
                      setZillowDetectionMessage(null);
                      setZillowDetectionDetail(null);
                    }}
                    className="rounded border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  >
                    Try Again
                  </button>
                </>
              )}

              {zillowReadinessState === "supportedDirectHandshakeReady" && directStatus === "connecting" && (
                <button
                  type="button"
                  onClick={() => setShowManualFallback(true)}
                  className="text-sm font-medium text-zinc-600 underline hover:no-underline dark:text-zinc-400"
                >
                  Use Manual Code Instead
                </button>
              )}

              {/* Try Again: re-run detection for failed or fallback states */}
              {(zillowReadinessState === "supportedNoExtension" && showManualFallback) ||
              zillowReadinessState === "supportedExtensionDetected" ||
              zillowReadinessState === "supportedFallbackOnly" ||
              zillowReadinessState === "unknownOrDegraded" ||
              (zillowReadinessState === "supportedDirectHandshakeReady" && (showManualFallback || directStatus === "failed" || directStatus === "expired")) ? (
                <button
                  type="button"
                  onClick={async () => {
                    if (directSessionId && directStatus === "connecting") {
                      await markConnectionFailedAction(directSessionId);
                    }
                    directStartAttemptedRef.current = false;
                    setPairCode(null);
                    setPairCodeExpiresAt(null);
                    setPairCodeError(null);
                    setDirectSessionId(null);
                    setDirectNonce(null);
                    setDirectStatus("idle");
                    setDirectError(null);
                    setShowManualFallback(false);
                    setZillowDetectionStatus("idle");
                    setZillowReadinessState(null);
                    setZillowDetectionMessage(null);
                    setZillowDetectionDetail(null);
                  }}
                  className="rounded border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  Try Again
                </button>
              ) : null}

              {/* Done: on successful connection */}
              {zillowReadinessState === "supportedDirectHandshakeReady" && directStatus === "connected" && (
                <button
                  type="button"
                  onClick={async () => {
                    directStartAttemptedRef.current = false;
                    setZillowImportModalOpen(false);
                    setPairCode(null);
                    setPairCodeExpiresAt(null);
                    setPairCodeError(null);
                    setDirectSessionId(null);
                    setDirectNonce(null);
                    setDirectStatus("idle");
                    setDirectError(null);
                    setShowManualFallback(false);
                    setZillowDetectionStatus("idle");
                    setZillowReadinessState(null);
                    setZillowDetectionMessage(null);
                    setZillowDetectionDetail(null);
                  }}
                  className="rounded bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                >
                  Done
                </button>
              )}

              <button
                type="button"
                onClick={async () => {
                  if (directSessionId && directStatus === "connecting") {
                    await markConnectionFailedAction(directSessionId);
                  }
                  directStartAttemptedRef.current = false;
                  setZillowImportModalOpen(false);
                  setPairCode(null);
                  setPairCodeExpiresAt(null);
                  setPairCodeError(null);
                  setDirectSessionId(null);
                  setDirectNonce(null);
                  setDirectStatus("idle");
                  setDirectError(null);
                  setShowManualFallback(false);
                  setZillowDetectionStatus("idle");
                  setZillowReadinessState(null);
                  setZillowDetectionMessage(null);
                  setZillowDetectionDetail(null);
                }}
                className="rounded border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                Close
              </button>

              {/* Generate Code + Copy Code when in manual flow */}
              {((zillowReadinessState === "supportedDirectHandshakeReady" && (showManualFallback || directStatus === "failed" || directStatus === "expired")) ||
                zillowReadinessState === "supportedExtensionDetected" ||
                zillowReadinessState === "supportedFallbackOnly" ||
                zillowReadinessState === "unknownOrDegraded" ||
                (zillowReadinessState === "supportedNoExtension" && showManualFallback)) && (
                <>
                  <button
                    type="button"
                    onClick={async () => {
                      setPairCodeError(null);
                      setPairCodeLoading(true);
                      const result = await createExtensionPairCodeAction(projectId);
                      setPairCodeLoading(false);
                      if ("error" in result) {
                        setPairCodeError(result.error);
                        return;
                      }
                      setPairCode(result.code);
                      setPairCodeExpiresAt(result.expiresAt);
                    }}
                    disabled={pairCodeLoading}
                    className="rounded bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                  >
                    {pairCodeLoading ? "Generating…" : "Generate Code"}
                  </button>
                  {pairCode && (
                    <button
                      type="button"
                      onClick={() => {
                        if (pairCode) void navigator.clipboard.writeText(pairCode);
                      }}
                      className="rounded border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    >
                      Copy Code
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ZillowStagingThumbnail({
  media,
  selected,
  onToggleSelect,
  onDelete,
}: {
  media: MediaItem;
  selected: boolean;
  onToggleSelect: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex flex-col rounded-lg border border-zinc-200 dark:border-zinc-700">
      <label className="flex cursor-pointer items-start gap-2 p-2">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggleSelect}
          className="mt-1 h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-500 dark:border-zinc-600 dark:bg-zinc-800"
          aria-label={`Select photo for assignment`}
        />
        <div className="relative aspect-[4/3] min-h-0 flex-1 overflow-hidden rounded bg-zinc-200 dark:bg-zinc-700">
          {(() => {
            // Phase 9: prefer the small WebP thumbnail when present (~5-30 KB)
            // so a 100-photo Unassigned grid loads in a fraction of the
            // bandwidth a full-res grid would. Falls back to `url` for
            // legacy rows + thumbnail-generation failures.
            const displayUrl = media.thumbnailUrl ?? media.url;
            if (isBadPlaceholderUrl(displayUrl)) {
              return (
                <div className="absolute inset-0 flex items-center justify-center rounded text-xs text-zinc-500">
                  No image
                </div>
              );
            }
            if (isLegacyBlobUrl(displayUrl) || !isAllowedHostForNextImage(displayUrl)) {
              return (
                <img
                  src={displayUrl}
                  alt=""
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              );
            }
            return (
              <Image
                src={displayUrl}
                alt=""
                fill
                className="object-cover"
                sizes="(max-width:640px) 50vw, 25vw"
                unoptimized={displayUrl.startsWith("blob:") || !displayUrl.startsWith("http")}
              />
            );
          })()}
        </div>
      </label>
      {/* Phase 9.2: EXIF capture timestamp caption. Shown only when
          media.sortOrder holds a plausible unix-seconds value (set by
          Phase 9 local imports from EXIF DateTimeOriginal). Zillow /
          Rendr / legacy uploads use sortOrder for display ordering and
          return null from the helper — caption is omitted, not replaced
          with a placeholder. */}
      {(() => {
        const d = exifTimestampFromSortOrder(media.sortOrder);
        if (!d) return null;
        return (
          <div
            className="border-t border-zinc-200 px-2 py-1 text-[10px] text-zinc-500 dark:border-zinc-700 dark:text-zinc-400"
            title={d.toLocaleString()}
          >
            {formatTimestamp(d, "photo")}
          </div>
        );
      })()}
      <div className="flex justify-end border-t border-zinc-200 px-2 py-1 dark:border-zinc-700">
        <button
          type="button"
          onClick={onDelete}
          className="text-xs text-red-600 hover:underline dark:text-red-400"
        >
          Delete
        </button>
      </div>
    </div>
  );
}

function ExistingUploadButton({
  projectId,
  roomId,
  onSuccess,
  onError,
  onBatchResult,
}: {
  projectId: string;
  roomId: string;
  onSuccess: () => void;
  onError: (s: string | null) => void;
  onBatchResult?: (result: UploadBatchResult | null) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const fileList = e.target.files;
    if (!fileList?.length) return;
    const files = Array.from(fileList);
    e.target.value = "";
    setUploading(true);
    onError(null);
    onBatchResult?.(null);

    if (files.length === 1) {
      const file = files[0]!;
      try {
        const result = await getPresignedUploadUrlAction(
          projectId,
          file.name,
          file.type || "application/octet-stream"
        );
        if ("error" in result) {
          onError(result.error);
          return;
        }
        const putRes = await fetch(result.uploadUrl, {
          method: "PUT",
          body: file,
          headers: { "Content-Type": file.type || "application/octet-stream" },
        });
        if (!putRes.ok) {
          onError("Upload failed: " + putRes.statusText);
          return;
        }
        const formData = new FormData();
        formData.set("projectId", projectId);
        formData.set("fileKey", result.fileKey);
        formData.set("url", result.publicUrl);
        formData.set("type", MediaType.EXISTING);
        formData.set("roomId", roomId);
        const res = await createMediaAction(formData);
        if (res.error) onError(res.error);
        else onSuccess();
      } finally {
        setUploading(false);
      }
      return;
    }

    setProgress({ current: 0, total: files.length });
    try {
      const result = await uploadFiles(files, {
        projectId,
        type: MediaType.EXISTING,
        roomId,
        onProgress: (current, total) => setProgress({ current, total }),
      });
      setProgress(null);
      onBatchResult?.(result);
      if (result.successCount > 0) onSuccess();
    } finally {
      setUploading(false);
    }
  }

  const progressLabel =
    progress != null ? `Uploading ${progress.current}/${progress.total}…` : uploading ? "Uploading…" : "Upload Existing";

  return (
    <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800">
      <input
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        disabled={uploading}
        onChange={handleFile}
      />
      {progressLabel}
    </label>
  );
}

function UnassignedRow({
  projectId,
  media,
  rooms,
  selected,
  onToggleSelect,
  onAssign,
  onMoveToFrontPage,
  onDelete,
}: {
  projectId: string;
  media: MediaItem;
  rooms: RoomItem[];
  selected?: boolean;
  onToggleSelect?: () => void;
  onAssign: () => void;
  onMoveToFrontPage: () => void;
  onDelete: () => void;
}) {
  const [assignRoomId, setAssignRoomId] = useState("");
  const [assigning, setAssigning] = useState(false);
  const [moving, setMoving] = useState(false);

  async function handleAssign() {
    if (!assignRoomId) return;
    setAssigning(true);
    if (assignRoomId === FRONT_PAGE_ID) {
      await updateMediaRoomAction(projectId, media.id, null, "FRONT_PAGE");
    } else {
      await updateMediaRoomAction(projectId, media.id, assignRoomId);
    }
    setAssigning(false);
    onAssign();
  }

  async function handleMoveToFrontPage() {
    setMoving(true);
    await updateMediaRoomAction(projectId, media.id, null, "FRONT_PAGE");
    setMoving(false);
    onMoveToFrontPage();
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-zinc-200 p-3 dark:border-zinc-700">
      {onToggleSelect != null && (
        <label className="flex shrink-0 cursor-pointer items-center gap-1.5">
          <input
            type="checkbox"
            checked={selected ?? false}
            onChange={onToggleSelect}
            className="h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-500 dark:border-zinc-600 dark:bg-zinc-800"
            aria-label={`Select ${media.caption || "photo"} for assignment`}
          />
        </label>
      )}
      <div className="relative h-16 w-24 shrink-0 overflow-hidden rounded bg-zinc-200 dark:bg-zinc-700">
        {isBadPlaceholderUrl(media.url) ? (
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "#f5f5f5",
              color: "#999",
              display: "grid",
              placeItems: "center",
              fontSize: 12,
              borderRadius: 8,
            }}
          >
            No image
          </div>
        ) : isLegacyBlobUrl(media.url) || !isAllowedHostForNextImage(media.url) ? (
          <img
            src={media.url}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          <Image
            src={media.url}
            alt=""
            fill
            className="object-cover"
            sizes="96px"
            unoptimized={media.url.startsWith("blob:") || !media.url.startsWith("http")}
          />
        )}
      </div>
      <div className="flex flex-1 flex-wrap items-center gap-2">
        <select
          value={assignRoomId}
          onChange={(e) => setAssignRoomId(e.target.value)}
          className="rounded border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
        >
          <option value="">Assign to…</option>
          <option value={FRONT_PAGE_ID}>Front Page</option>
          {rooms.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={handleAssign}
          disabled={!assignRoomId || assigning}
          className="rounded bg-zinc-900 px-2 py-1 text-xs text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          Assign
        </button>
        <button
          type="button"
          onClick={handleMoveToFrontPage}
          disabled={moving}
          className="rounded border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-600 dark:hover:bg-zinc-700"
        >
          {moving ? "Moving…" : "Move to Front Page Photos"}
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="text-xs text-red-600 hover:underline dark:text-red-400"
        >
          Delete
        </button>
      </div>
    </div>
  );
}
