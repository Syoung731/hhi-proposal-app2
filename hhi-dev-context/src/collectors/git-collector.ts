/**
 * Git collector: branch + changed files from working tree.
 * Runs git commands and stores result in SQLite via the store.
 */

import { execSync } from "child_process";
import path from "path";
import { insertSnapshot, insertChangedFiles } from "../db/store";

export interface GitCollectResult {
  branch: string;
  commitHash?: string;
  changedCount: number;
  files: { path: string; status: string }[];
  snapshotId: number;
}

/** Map git status short code to a stable status string. */
function normalizeStatus(code: string): string {
  if (code.startsWith("??")) return "??";
  const c = code.trim().slice(0, 2);
  if (c === "M " || c === " M" || c === "MM") return "M";
  if (c === "A " || c === "A") return "A";
  if (c === "D " || c === " D") return "D";
  if (c === "R " || c === "R") return "R";
  if (c === "C ") return "C";
  if (c === "U " || c === "U") return "U";
  return code.trim() || "?";
}

/** Git may quote paths; strip a single pair of double quotes and unescape. */
function unquoteGitPath(raw: string): string {
  let p = raw.trim();
  if (p.length >= 2 && p.startsWith('"') && p.endsWith('"')) {
    p = p
      .slice(1, -1)
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, "\\");
  }
  return p;
}

/** Stable repo-relative paths for APIs (forward slashes). */
function toPosixRelative(repoRoot: string, pathPart: string): string | null {
  const root = path.resolve(repoRoot);
  const candidate = path.resolve(root, pathPart.replace(/\//g, path.sep));
  const rel = path.relative(root, candidate);
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) return null;
  return rel.split(path.sep).join("/");
}

/**
 * Parse `git status --porcelain` output into path + status.
 * Lines are two-char status, space, then path (e.g. " M file", "?? file").
 */
export function parsePorcelain(output: string, repoRoot: string): { path: string; status: string }[] {
  const lines = output.split(/\r?\n/).filter((line) => line.length > 0);
  const files: { path: string; status: string }[] = [];
  for (const line of lines) {
    if (line.length < 4) continue;
    const code = line.slice(0, 2);
    const rest = line.slice(3);
    // Renames: "R  old -> new"
    const rawPath = rest.includes(" -> ") ? rest.split(" -> ")[1]! : rest;
    const pathPart = unquoteGitPath(rawPath).replace(/\/+$/, "");
    if (!pathPart) continue;
    const relativePath = toPosixRelative(repoRoot, pathPart);
    if (relativePath) {
      files.push({ path: relativePath, status: normalizeStatus(code) });
    }
  }
  return files;
}

function getGitRepoRoot(cwd: string): string {
  const top = execSync("git rev-parse --show-toplevel", { encoding: "utf-8", cwd }).trim();
  return top || cwd;
}

/** Get short commit hash if available (e.g. 7 chars). */
function getShortCommitHash(cwd: string): string | null {
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf-8", cwd }).trim() || null;
  } catch {
    return null;
  }
}

/**
 * Run git branch, short commit hash, and git status in cwd; persist to SQLite.
 * Optionally pass task_status (e.g. "build:ok lint:ok") to attach to snapshot.
 * Top changed files are stored in changed_files linked to this snapshot.
 */
export function collectGit(cwd: string = process.cwd(), taskStatus?: string | null): GitCollectResult {
  const repoRoot = getGitRepoRoot(cwd);
  const branch = execSync("git branch --show-current", { encoding: "utf-8", cwd }).trim();
  const commitHash = getShortCommitHash(cwd);
  // -uall: list every untracked file (default "normal" mode collapses whole dirs to one path).
  // core.quotepath=false: UTF-8 paths instead of escape sequences.
  const porcelain = execSync("git -c core.quotepath=false status --porcelain -uall", {
    encoding: "utf-8",
    cwd,
  });
  const parsed = parsePorcelain(porcelain, repoRoot);
  const byPath = new Map<string, { path: string; status: string }>();
  for (const f of parsed) {
    byPath.set(f.path, f);
  }
  const files = [...byPath.values()];

  const snapshotId = insertSnapshot({
    branch,
    commit_hash: commitHash,
    changed_count: files.length,
    task_status: taskStatus ?? null,
  });
  insertChangedFiles(snapshotId, files);

  return { branch, commitHash: commitHash ?? undefined, changedCount: files.length, files, snapshotId };
}
