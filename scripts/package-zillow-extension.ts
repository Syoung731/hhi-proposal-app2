/**
 * Packages the Zillow Import Chrome extension into a versioned .zip
 * suitable for sharing with HHI staff who need to install it.
 *
 * Output: dist/zillow-importer-<version>.zip
 *
 * Reads the version from chrome-extension/zillow-importer/manifest.json so
 * each new build produces a distinguishably-named .zip. Bump the manifest
 * version any time the extension code changes; the .zip filename will
 * reflect the new version automatically.
 *
 * Excludes:
 *   - .DS_Store, Thumbs.db, and any dotfile (Mac/Win shell metadata)
 *   - Any pre-existing .zip (defensive — should never happen since the
 *     extension folder doesn't normally contain zips)
 *
 * Usage (from repo root, on Windows):
 *   npx tsx scripts/package-zillow-extension.ts
 *
 * Implementation: shells out to PowerShell's built-in Compress-Archive
 * (Windows-native) so no npm install is required. If you ever need this
 * on Mac/Linux, swap to the system `zip` command — same flags conceptually.
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = process.cwd();
const EXTENSION_DIR = join(REPO_ROOT, "chrome-extension", "zillow-importer");
const DIST_DIR = join(REPO_ROOT, "dist");
const MANIFEST_PATH = join(EXTENSION_DIR, "manifest.json");

function main() {
  if (!existsSync(MANIFEST_PATH)) {
    console.error(`ERROR: manifest not found at ${MANIFEST_PATH}`);
    process.exit(1);
  }

  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8")) as {
    version: string;
    name: string;
  };
  const version = manifest.version;
  if (!version || typeof version !== "string") {
    console.error("ERROR: manifest.json has no `version` field.");
    process.exit(1);
  }

  if (!existsSync(DIST_DIR)) {
    mkdirSync(DIST_DIR, { recursive: true });
  }

  const outName = `zillow-importer-${version}.zip`;
  const outPath = join(DIST_DIR, outName);

  // Remove any prior file with the same version so re-runs produce a fresh
  // archive rather than failing on Compress-Archive's overwrite refusal.
  if (existsSync(outPath)) {
    rmSync(outPath);
  }

  // Compress-Archive packs the contents of the extension folder. Using the
  // wildcard `\*` includes the folder's children at the root of the zip,
  // which is what Chrome's "Load unpacked" expects.
  const psCommand = [
    "$ProgressPreference = 'SilentlyContinue';",
    `Compress-Archive -Path '${EXTENSION_DIR}\\*' -DestinationPath '${outPath}' -Force`,
  ].join(" ");

  console.log(`Packaging ${manifest.name} v${version}...`);
  console.log(`  source: ${EXTENSION_DIR}`);
  console.log(`  output: ${outPath}`);

  try {
    execFileSync("powershell", ["-NoProfile", "-Command", psCommand], {
      stdio: "inherit",
    });
  } catch (e) {
    console.error("ERROR: Compress-Archive failed.");
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(2);
  }

  if (!existsSync(outPath)) {
    console.error("ERROR: zip was not produced (no error from PowerShell).");
    process.exit(3);
  }

  console.log(`\nDone. Send ${outName} to the recipient along with`);
  console.log(`chrome-extension/zillow-importer/INSTALL.md.`);
}

main();
