/**
 * Room name matching engine for Rendr → App room mapping.
 * Stage 1: Fuzzy matching with normalization and token overlap.
 * Stage 2: AI matching via Claude for unresolved rooms.
 */

import type { RendrRoom } from "./types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RoomMatch {
  rendrLabel: string;
  rendrRoomIndex: number;
  appRoomId: string | null;
  appRoomName: string | null;
  confidence: "high" | "suggested" | "unmatched";
  matchMethod: "fuzzy" | "ai" | "manual";
}

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

const SUBSTITUTIONS: [RegExp, string][] = [
  [/\bmaster\b/g, "primary"],
  [/\bbr\b/g, "bedroom"],
  [/\bbd\b/g, "bedroom"],
  [/\bba\b/g, "bathroom"],
  [/\bbath\b/g, "bathroom"],
  [/\bwc\b/g, "bathroom"],
  [/\bpowder\b/g, "half bath"],
  [/\bgreat room\b/g, "living room"],
  [/\bliving\s*\/\s*dining\b/g, "living room"],
  [/\blaundry\b/g, "utility"],
  [/\bmud room\b/g, "mudroom"],
];

function normalize(s: string): string {
  let out = s.toLowerCase().replace(/[^\w\s]/g, " ").trim();
  for (const [pattern, replacement] of SUBSTITUTIONS) {
    out = out.replace(pattern, replacement);
  }
  return out.replace(/\s+/g, " ").trim();
}

// ---------------------------------------------------------------------------
// Token overlap scoring
// ---------------------------------------------------------------------------

function tokenOverlapScore(a: string, b: string): number {
  const tokensA = new Set(a.split(" ").filter(Boolean));
  const tokensB = new Set(b.split(" ").filter(Boolean));
  if (tokensA.size === 0 || tokensB.size === 0) return 0;

  let intersection = 0;
  for (const t of tokensA) {
    if (tokensB.has(t)) intersection++;
  }
  const union = new Set([...tokensA, ...tokensB]).size;
  return union > 0 ? intersection / union : 0;
}

/** Simple Levenshtein distance. */
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
  }
  return dp[m][n];
}

function levSimilarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}

/** Combined similarity: max of token overlap and Levenshtein similarity. */
function similarity(a: string, b: string): number {
  const normA = normalize(a);
  const normB = normalize(b);
  return Math.max(tokenOverlapScore(normA, normB), levSimilarity(normA, normB));
}

// ---------------------------------------------------------------------------
// Fuzzy matching (Stage 1)
// ---------------------------------------------------------------------------

export function fuzzyMatchRooms(
  rendrRooms: RendrRoom[],
  appRooms: { id: string; name: string }[],
): RoomMatch[] {
  const usedAppRoomIds = new Set<string>();
  const matches: RoomMatch[] = [];

  // Score all pairs and greedily assign best matches
  const scored: { rendrIdx: number; appIdx: number; score: number }[] = [];
  for (let ri = 0; ri < rendrRooms.length; ri++) {
    for (let ai = 0; ai < appRooms.length; ai++) {
      scored.push({
        rendrIdx: ri,
        appIdx: ai,
        score: similarity(rendrRooms[ri].label, appRooms[ai].name),
      });
    }
  }
  scored.sort((a, b) => b.score - a.score);

  const matchedRendr = new Set<number>();

  for (const { rendrIdx, appIdx, score } of scored) {
    if (matchedRendr.has(rendrIdx) || usedAppRoomIds.has(appRooms[appIdx].id)) continue;
    if (score < 0.6) continue; // below threshold

    matchedRendr.add(rendrIdx);
    usedAppRoomIds.add(appRooms[appIdx].id);

    matches.push({
      rendrLabel: rendrRooms[rendrIdx].label,
      rendrRoomIndex: rendrIdx,
      appRoomId: appRooms[appIdx].id,
      appRoomName: appRooms[appIdx].name,
      confidence: score >= 0.8 ? "high" : "suggested",
      matchMethod: "fuzzy",
    });
  }

  // Add unmatched Rendr rooms
  for (let ri = 0; ri < rendrRooms.length; ri++) {
    if (!matchedRendr.has(ri)) {
      matches.push({
        rendrLabel: rendrRooms[ri].label,
        rendrRoomIndex: ri,
        appRoomId: null,
        appRoomName: null,
        confidence: "unmatched",
        matchMethod: "fuzzy",
      });
    }
  }

  // Sort by original Rendr index
  matches.sort((a, b) => a.rendrRoomIndex - b.rendrRoomIndex);
  return matches;
}
