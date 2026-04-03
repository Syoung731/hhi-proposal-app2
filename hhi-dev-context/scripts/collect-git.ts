/**
 * Local collector script: run git branch + status, parse changed files, store in SQLite.
 * Run from repo root: npx tsx hhi-dev-context/scripts/collect-git.ts
 */

import { initDb } from "../src/db/schema";
import { collectGit } from "../src/collectors/git-collector";

async function main() {
  await initDb();
  const cwd = process.cwd();
  const taskStatus = process.env.HHI_TASK_STATUS ?? undefined; // optional, e.g. "build:ok lint:ok"
  const result = collectGit(cwd, taskStatus);
  console.log(JSON.stringify(result, null, 2));
}

main();
