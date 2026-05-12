/**
 * Smoke test for the budget PDF render path.
 *
 * Drives the same Playwright + Chromium pipeline as the HTTP route,
 * minus the HTTP layer. Writes the PDF to ./tmp-budget.pdf so a human
 * can open it.
 *
 * Requires a running dev server on http://localhost:3000 (the headless
 * browser navigates to /admin/projects/{id}/budget-print on that origin).
 *
 * Run:
 *   # In one shell: npm run dev
 *   # In another:
 *   npx dotenv -e .env.local -- node node_modules/tsx/dist/cli.mjs scripts/smoke/budget-export-pdf.ts [projectId] [outPath]
 */
import { writeFile, stat } from "node:fs/promises";
import { prisma } from "../../app/lib/prisma";
import { renderBudgetPdf } from "../../app/lib/budget-export/render-budget-pdf";

async function pickProjectId(arg?: string): Promise<string> {
  if (arg) return arg;
  const candidate = await prisma.aIEstimate.findFirst({
    select: { projectId: true, project: { select: { title: true } } },
    orderBy: { createdAt: "desc" },
  });
  if (!candidate) throw new Error("No estimates found — pass a projectId.");
  process.stdout.write(`auto-picked project: ${candidate.project.title}\n`);
  return candidate.projectId;
}

async function main() {
  const projectId = await pickProjectId(process.argv[2]);
  const outPath = process.argv[3] ?? "./tmp-budget.pdf";
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  process.stdout.write(`rendering ${projectId} against ${baseUrl} ...\n`);
  const t0 = Date.now();
  const pdf = await renderBudgetPdf({ projectId, baseUrl });
  process.stdout.write(`rendered in ${Date.now() - t0}ms (${pdf.byteLength} bytes)\n`);

  await writeFile(outPath, pdf);
  const stats = await stat(outPath);
  const head = pdf.subarray(0, 4).toString("ascii");
  if (head !== "%PDF") {
    process.stderr.write(`✗ unexpected file header: ${head}\n`);
    process.exit(1);
  }
  process.stdout.write(`wrote ${outPath} (${stats.size} bytes, header=${head})\n`);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  process.stderr.write(`smoke failure: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
  await prisma.$disconnect();
  process.exit(1);
});
