// Micro-test: verify the idempotency lock acquires + disambiguates NOT_FOUND vs BUSY.
// No HTTP. Runs directly against DB via a fresh tsx process (fresh Prisma client).
import { prisma } from "../../../app/lib/prisma";

const PROJECT_ID = "cmo8mgpn20006o47kjvop2zlj";
const FAKE_ID = "this-project-does-not-exist-0000";

async function main() {
  let fails = 0;
  const note = (ok: boolean, label: string) => { process.stdout.write(`${ok?"PASS":"FAIL"}  ${label}\n`); if (!ok) fails++; };

  // Reset to a known-good state
  await prisma.project.update({ where: { id: PROJECT_ID }, data: { copeStatus: "IDLE", copeError: null } });

  // Lock attempt 1: from IDLE -> GENERATING should succeed
  const a = await prisma.project.updateMany({
    where: { id: PROJECT_ID, copeStatus: { in: ["IDLE","READY","FAILED"] } },
    data: { copeStatus: "GENERATING", copeError: null }
  });
  note(a.count === 1, `first acquire transitioned count=1 (got ${a.count})`);

  // Lock attempt 2: from GENERATING -> GENERATING should fail
  const b = await prisma.project.updateMany({
    where: { id: PROJECT_ID, copeStatus: { in: ["IDLE","READY","FAILED"] } },
    data: { copeStatus: "GENERATING", copeError: null }
  });
  note(b.count === 0, `second acquire blocked count=0 (got ${b.count})`);

  // Unknown project: count=0
  const c = await prisma.project.updateMany({
    where: { id: FAKE_ID, copeStatus: { in: ["IDLE","READY","FAILED"] } },
    data: { copeStatus: "GENERATING" }
  });
  note(c.count === 0, `nonexistent project acquire count=0 (got ${c.count})`);

  // Disambiguation: does the project exist?
  const exists = await prisma.project.findUnique({ where: { id: PROJECT_ID }, select: { id: true } });
  const fake = await prisma.project.findUnique({ where: { id: FAKE_ID }, select: { id: true } });
  note(exists?.id === PROJECT_ID, `real project exists`);
  note(fake == null, `fake project does not exist`);

  // Release lock
  await prisma.project.update({ where: { id: PROJECT_ID }, data: { copeStatus: "IDLE" } });

  process.stdout.write(`\nSUMMARY: ${fails===0?"ALL PASS":`${fails} FAIL`}\n`);
  await prisma.$disconnect();
  process.exit(fails===0?0:1);
}
main().catch(e => { console.error("FATAL:", e); process.exit(1); });
