/**
 * Start the hhi-dev-context local HTTP server.
 * Run: npx tsx hhi-dev-context/scripts/run-server.ts
 */

import { initDb } from "../src/db/schema";
import { start } from "../src/api/server";

async function main() {
  await initDb();
  start();
}

main();
