-- Pass 2 Cluster D3. Adds @unique on EmailSendLog.providerMessageId so audit
-- log writers cannot record the same Gmail message ID twice (e.g. retry path
-- replaying without dedup). Pre-flight (scripts/preflight-providermessageid-unique.ts)
-- confirmed zero duplicates exist before this constraint applies.
--
-- Created manually because `prisma migrate dev --create-only` rejects the
-- non-interactive environment when the schema diff includes a unique-
-- constraint warning. The pre-flight script is the substitute for the
-- interactive confirmation; SQL is exactly what Prisma would have generated.

-- CreateIndex
CREATE UNIQUE INDEX "EmailSendLog_providerMessageId_key" ON "EmailSendLog"("providerMessageId");
