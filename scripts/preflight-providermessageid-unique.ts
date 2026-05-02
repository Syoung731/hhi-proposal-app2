import { config } from "dotenv";
config({ path: ".env.local" });

import { prisma } from "@/app/lib/prisma";

/**
 * Pass 2 Cluster D3 pre-flight. Confirms no duplicate providerMessageId
 * values exist on EmailSendLog before adding the @unique constraint.
 */
async function main() {
  const dupes = await prisma.$queryRawUnsafe<{ providerMessageId: string; cnt: number }[]>(`
    SELECT "providerMessageId", COUNT(*)::int AS cnt
    FROM "EmailSendLog"
    WHERE "providerMessageId" IS NOT NULL
    GROUP BY "providerMessageId"
    HAVING COUNT(*) > 1
    ORDER BY cnt DESC
  `);

  const total = await prisma.emailSendLog.count();
  const withMsgId = await prisma.emailSendLog.count({
    where: { providerMessageId: { not: null } },
  });

  console.log(`Total EmailSendLog rows: ${total}`);
  console.log(`Rows with non-null providerMessageId: ${withMsgId}`);
  console.log(`Distinct duplicate providerMessageId values: ${dupes.length}`);
  for (const d of dupes.slice(0, 10)) console.log(`  ${d.providerMessageId} x ${d.cnt}`);
  if (dupes.length > 10) console.log(`  ...(${dupes.length - 10} more)`);

  console.log(
    dupes.length === 0
      ? "\nPASS — safe to add unique constraint"
      : "\nFAIL — duplicates must be resolved before adding @unique",
  );
  await prisma.$disconnect();
  if (dupes.length > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
