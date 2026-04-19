# HHI Builders Proposal App — CLAUDE.md

## What This Is
A Next.js 16 proposal deck builder for HHI Builders, a luxury
residential design-build and renovation company on Hilton Head
Island, SC. The app generates client-facing slide deck proposals
from project data, integrating AI-generated content, live pricing
from JobTread, and media from Zillow imports.

## Tech Stack
- Next.js 16 (App Router), React, TypeScript, Tailwind CSS
- Prisma ORM + PostgreSQL (Neon)
- Cloudflare R2 for file/image storage
- Google Gemini API (Imagen 4) for AI background generation
- Clerk auth (currently disabled during development)

## Key Architecture Patterns

### Data Model Hierarchy
- Project → Rooms (sections) → each Room has a SectionType (pricing profile)
- Room pricing: SectionType rates ($/SF, per job, per each) × room dimensions
- Investment rollups: Room prices aggregate into InvestmentLineItem records
  by bucket (BASE, ALTERNATE, ALLOWANCE)
- Deck slides: DeckSlide records with type-specific content JSON, linked to project

### Pricing Pipeline (critical — do not break)

SectionType (pricing profile) rates × Room dimensions (SF)
  → computeRoomPriceRange() in app/lib/room-price-range.ts  ← SINGLE SOURCE OF TRUTH
  → writes Room.totalLow / totalTarget / totalHigh
  → recomputeInvestmentRollups() sums by bucket
  → InvestmentLineItem.rangeLow / rangeTarget / rangeHigh
  → Investment tab displays these values
  → Deck Investment slide reads from InvestmentLineItem

The shared utility computeRoomPriceRange() must be used by both the
Sections tab display AND the investment rollup. Never duplicate this math.

### Deck Editor Architecture
- Route: /admin/projects/[id]/deck
- 9 slide types with individual components in app/admin/projects/[id]/deck/slides/
- 3-layer rendering: aiBackground → brandBackground → content → logo (z-index 100)
- Slides auto-sync from project data (rooms, investment items) unless isUserModified=true
- InspectorPanel.tsx provides per-slide editing controls
- Background library: BrandBackground model with seed data

### Key File Locations
- Slide components: app/admin/projects/[id]/deck/slides/
- Deck data layer: app/lib/deck/db.ts, app/lib/deck/types.ts
- Investment rollup: app/lib/investment-rollup.ts
- Room price calculation: app/lib/room-price-range.ts
- Room actions: app/admin/projects/[id]/rooms/actions.ts
- Investment actions: app/admin/projects/[id]/investment/actions.ts
- Prisma schema: prisma/schema.prisma
- Seed data: prisma/seed.ts

### Naming Conventions
- Budget line items follow: [PREFIX] Item - Material/Install
- Room > Trade > Item hierarchy (matches JobTread)
- Bucket separator: > (e.g., "Kitchen > Plumbing > Rough-in")

### JobTread Integration
- Read-only by default — NEVER write to JobTread unless explicitly authorized
- Access via Data X MCP connector
- Budget hierarchy: Room > Trade > Material/Labor
- Search by job number to get internal ID, then query by ID
- The closed date field (not a custom field) indicates job completion status

## Commit-On-Demand Pattern

### Default Behavior: DO NOT AUTO-COMMIT

Claude Code must NEVER:
- Commit automatically at the end of a task
- Use generic commit messages like `checkpoint: auto-commit after Claude Code task`
- Run `git commit` without first showing the human the exact command and waiting for approval
- Run `git push` under any circumstances — pushing is always the human's responsibility
- Use `git add -A` or `git add .` — always use explicit file paths

### At End Of Every Task

After verification passes (tsc/build/tests), Claude Code MUST:

1. Run `git status` and show the output
2. Verify that only files intentionally edited by this task appear as modified or new
3. If any unexpected files appear, STOP and report — do not proceed
4. Print a suggested commit command block in this exact format:

```
## Suggested Commit

```powershell
git add <explicit file paths>
git commit -m "<type>(<scope>): <description>"
```

Reasoning: [1-2 sentences on why these files, this message, this scope]
```

5. STOP. Wait for the human to run the commit manually. Do not execute it yourself.

### Commit Message Format

Use Conventional Commits:

- `feat(<scope>): <description>` — new feature or capability
- `fix(<scope>): <description>` — bug fix
- `chore(<scope>): <description>` — tooling, config, housekeeping
- `docs(<scope>): <description>` — documentation only
- `refactor(<scope>): <description>` — code restructuring without behavior change
- `test(<scope>): <description>` — test additions or fixes

Scope examples used in this repo: `admin`, `rendr`, `ai`, `estimate`, `db`, `deck`, `cope`, `lib`, `ui`, `docs`, `claude`.

Example good messages:
- `feat(estimate): add CALC source tag for pre-calculated line items (permit fees)`
- `fix(deck): correct design retainer slide binding to investment tab value`
- `chore: gitignore Claude lock file, update launch config`

Example BAD messages (do not use):
- `checkpoint: auto-commit after Claude Code task`
- `update files`
- `wip`
- `fix stuff`

### When To Split Into Multiple Commits

If a task touches more than ~10 files OR spans multiple logical concerns (e.g., schema change + UI update + new lib utility), suggest splitting into multiple commits by logical scope. Print one suggested commit block per logical grouping.

### High-Risk Changes — Flag Explicitly

If a task touches any of the following, include a ⚠️ warning in the commit reasoning:
- Database migrations or `schema.prisma`
- Authentication (Clerk, session handling, auth middleware)
- External integrations (JobTread, Rendr, AI API clients)
- Payment or financial calculations
- Permission or admin gating

Example: `⚠️ This commit includes a Prisma migration. Human must decide whether to deploy migrations before or after this commit lands in production.`

### Override — Explicit Permission To Commit Directly

The human may explicitly instruct Claude Code to commit directly inside a specific prompt with language like:
- "Commit this yourself when you're done"
- "Stage and commit using [this exact message]"
- "Auto-commit at the end"

When this explicit override appears in the prompt, Claude Code MAY execute the commit — but still MUST NOT push, and still MUST use a meaningful Conventional Commits message (never the generic checkpoint message).

Absent explicit override, the default is always: prepare the command, show it to the human, wait.

### If The Git History Is Already Polluted

If Claude Code notices prior commits with generic `checkpoint:` messages, DO NOT attempt to rewrite git history (no `git rebase`, no `git commit --amend` on previous commits, no `git reset`). That's the human's call. Simply continue forward with proper commit hygiene.

### Branch Discipline

- Do NOT create branches unless explicitly asked
- Do NOT create worktrees
- All work happens on the current branch (typically `proposal-v2`) unless explicitly told otherwise

## Prisma Rules
- NEVER run `npx prisma db pull` or `npx prisma db pull --force`. This overwrites the hand-crafted schema.prisma with an auto-generated version that loses @updatedAt, onDelete behaviors, comments, relation names, and field ordering.
- To verify database connectivity, use: `npx prisma migrate status`
- To verify schema is in sync: `npx prisma migrate diff --from-schema-datamodel prisma/schema.prisma --to-migrations prisma/migrations`
- Only use `npx prisma migrate dev` for migrations and `npx prisma generate` for client generation.

## Code Quality Rules
- Run tsc --noEmit after every set of changes — zero errors required
- Do not break existing auto-save or hydration pipelines
- When adding shared logic, extract into reusable utilities — never duplicate
- When fixing bugs, investigate and report findings BEFORE writing any fix

## Style / Branding
- NotebookLM-inspired slide deck aesthetic
- Warm linen backgrounds, Cormorant Garamond typography
- 16:9 landscape slide format
- Orange accent color: #F47216
- Navy primary: #1A2332
- Every slide title gets an orange horizontal accent rule underneath
- Bronze/gold accents for luxury feel

## Communication Rules
- Report findings BEFORE writing fixes when investigating bugs
- If a prompt is ambiguous, ask for clarification rather than guessing
- When modifying shared utilities, verify all callers still work
- After completing a task, summarize what was changed and what to test
