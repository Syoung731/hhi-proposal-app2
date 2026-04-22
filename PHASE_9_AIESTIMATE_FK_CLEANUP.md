# Phase 9 — `AIEstimate.sectionId` FK + Cascade Cleanup

Tracking doc. Not scheduled. Created as a follow-up to the Phase 8C COPE
banner-vs-CopeRoomCard inconsistency bug (2026-04-21).

## Symptom observed

Project `cmo8mgpn20006o47kjvop2zlj` had `copeStatus = READY` while the
CopeRoomCard rendered "No AI estimate yet". Investigation revealed **116
`AIEstimate` rows existed for the project, but zero of them pointed at the
current COPE room (`sectionId`)**. The "ready" COPE estimate was tied to a
`sectionId` that no longer matched any row in `Room`.

## Root cause

`AIEstimate.sectionId` is declared as a plain `String`, not a Prisma relation.

```prisma
// prisma/schema.prisma
model AIEstimate {
  id        String @id @default(cuid())
  projectId String
  sectionId String  // ← no @relation, no FK, no cascade
  ...
}
```

Consequences:

1. **No referential integrity.** A `Room` can be deleted while its
   `AIEstimate` rows remain pointing at a now-nonexistent id.
2. **No cascade on room deletion.** Every `prisma.room.delete` /
   `deleteMany` leaves orphaned `AIEstimate` rows behind.
3. **Invisible to schema tooling.** Prisma Studio, migrations, and
   introspection can't help you find or fix these orphans.
4. **Misleading downstream data.** Orphan estimates are still counted in
   global aggregates (`CatalogSuggestion.avgUnitPrice`, etc.) even though
   their "room" is gone, so suggestion averages get skewed by data that
   no longer reflects an active estimate.

Phase 8C Fix δ added narrow `copeStatus = IDLE` resets to
`deleteAllRoomsAction` and `mergeRoomsWithAiAction` so the banner stops
showing "ready" when the underlying estimate was orphaned. That closes
the user-visible symptom but leaves the orphan rows in the database.

## Proposed fix

Convert `AIEstimate.sectionId` to a proper Prisma relation with cascade:

```prisma
model AIEstimate {
  id        String @id @default(cuid())
  projectId String
  sectionId String
  section   Room   @relation(fields: [sectionId], references: [id], onDelete: Cascade)
  ...
}

model Room {
  ...
  aiEstimates AIEstimate[]
}
```

Companion for `Project` if we decide `AIEstimate.projectId` should also
cascade (today it's a plain String too).

## Migration considerations

- **Existing orphan rows must be cleaned up BEFORE the FK is added**, or
  the migration will fail. Approach:
  1. Add a preparatory migration that runs
     `DELETE FROM "AIEstimate" WHERE "sectionId" NOT IN (SELECT id FROM "Room")`
     (and the equivalent for projectId if we cascade that too).
  2. Log the deleted row count so we have an audit trail.
  3. Ship the FK-adding migration in the same PR.
- Snapshot the orphan rows to an export file before deletion if
  auditability matters — ask the user before deciding.
- Run `scripts/smoke/single-room.ts` + manual bulk estimate smoke after
  the migration to confirm estimate generation still works.

## Impact check needed

- **`CatalogSuggestion` averages** are computed from `AIEstimate.lineItems`
  via `upsertCatalogSuggestion()`. The running averages already include
  contributions from orphan rows. Those contributions can't be rolled back
  retroactively — the `count` is just a scalar, not a per-row audit trail.
  Mitigation: accept the historical skew; going forward, cascade-delete
  prevents new skew from accumulating.
- **`PriceCorrection`**, **`EstimateLineItem`** already cascade-delete via
  `AIEstimate` (verified in schema, line 1096/1116), so cascading
  `AIEstimate` from `Room` will correctly chain all the way down.
- **QStash jobs** reference `AIEstimate.id` by string in `EstimateJob` /
  `JobItem` (Phase 8B). If a job's resulting estimate gets cascade-deleted
  underneath it, the job's `estimateId` becomes a dangling pointer. Usually
  harmless (the job row has its own TTL), but confirm during build.
- **Scope-review modals** and any other surface reading `AIEstimate` by
  `sectionId` will see the expected "no estimate" state after deletion —
  matches user intent.

## Not in scope for this doc

- Rename the field from `sectionId` to `roomId` for consistency with the
  current domain language. Legacy naming from when rooms were called
  "sections". Worth a follow-up but orthogonal to the cascade fix.
- Retroactive orphan analytics / reconciliation with `CatalogSuggestion`.

## Related

- Phase 8C bug fix (Fix δ) — commit adding `copeStatus` reset to
  `deleteAllRoomsAction` + `mergeRoomsWithAiAction`.
- Investigation writeup in `PHASE_8C_INVESTIGATION.md`.
