# HHI Builders Proposal App

Production-ready web app that generates proposals as websites (for Vibe board) and exports PDFs with matching layout. Flow: **admin inputs + media + transcript → structured proposal → publish → share link → PDF**.

## Tech stack

- **Next.js 14+** App Router, TypeScript
- **Tailwind CSS** + **shadcn/ui**
- **Prisma ORM** + **PostgreSQL**
- **Clerk** (admin-only area)
- **R2/S3**-compatible object storage (presigned uploads)
- **Playwright** (server-side PDF from published page)

## Setup

### 1. Database

```bash
cp .env.example .env
# Edit .env and set DATABASE_URL (PostgreSQL)

npm run db:generate   # Generate Prisma client
npm run db:migrate    # Run migrations (creates tables)
npm run db:seed       # Optional: seed sample project
```

If you have an existing DB with the old schema, run `npx prisma migrate reset` (drops all data) then `npm run db:seed` if desired.

### 2. Clerk

- Create an app at [clerk.com](https://clerk.com).
- Set in `.env`:
  - `CLERK_SECRET_KEY`
  - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- Optionally set `ADMIN_EMAILS` (comma-separated) — feeds the bootstrap-admin count used by the demotion guard in `app/admin/settings/actions.ts`. Not an allowlist post-C.5; any Clerk-authenticated user is admin.

### 3. R2 / S3

For media uploads (presigned URLs):

- **R2**: set `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_BASE_URL`.
- **S3**: use the same env names or the S3 equivalents in `.env.example`.

### 4. Run dev

```bash
npm run dev
```

- Home: `http://localhost:3000`
- Admin: `http://localhost:3000/admin/projects`

### 5. Publish a proposal

1. In **Admin → Projects**, create a project and fill Overview (title, subtitle, address, client names, objective, cover image).
2. Add **Rooms** (room type, narrative), **Media** (upload, tag, caption), **Timeline**, and **Investment** line items.
3. Open **Preview** to see the draft.
4. Click **Publish** → confirm. This creates a locked snapshot and sets the project slug.
5. Share the public link: `/p/[id]` (id is the proposal’s secure cuid; the link is shown in the Publish tab).

### 6. Export PDF

- Open `/p/[id]/pdf` (or use the download button on the public page). The PDF is generated server-side from the **published** snapshot (Playwright), so it matches the shared web view.
- For PDF export, the server loads the public page at `NEXT_PUBLIC_APP_URL` (or `https://VERCEL_URL` / `http://localhost:3000`). Set `NEXT_PUBLIC_APP_URL` in production so the PDF renderer can reach your app. Install Playwright browsers once: `npx playwright install chromium`.

## Commands

| Command        | Description                |
|----------------|----------------------------|
| `npm run dev`  | Start dev server           |
| `npm run build`| Production build           |
| `npm run typecheck` | TypeScript check      |
| `npm run db:generate` | Prisma generate   |
| `npm run db:migrate`  | Run migrations     |
| `npm run db:seed`     | Seed database      |
| `npm run db:studio`   | Prisma Studio      |
| `npm run dev-context:verify` | Fetch `hhi-dev-context` `/summary` (and pricing route health) |

## Local dev context (hhi-dev-context)

For local debugging, the app integrates with `hhi-dev-context` over local HTTP:
- write events to `POST /ingest/*` (errors/logs/task runs/sync runs/route health)
- read state from `GET /snapshot`, `/summary`, etc.

`sql.js` (and SQLite storage) stays isolated inside the standalone `hhi-dev-context` service; the Next.js app never imports it.

### Enable / disable

- Default: enabled in non-production (`NODE_ENV !== "production"`).
- Override with `HHI_DEV_CONTEXT_ENABLED`:
  - `true` to enable
  - `false` to disable

### Base URL

- Override with `HHI_DEV_CONTEXT_BASE_URL` (default: `http://127.0.0.1:3999`)

### What’s instrumented

- Task runs:
  - `npm run build` → task name `build`
  - `npm run lint` → task name `lint`
  - `npm run dev` → task name `dev-server`
- Pricing / JobTread:
  - `app/admin/settings/jobtread-pricing/page.tsx` → route health for `/admin/settings/jobtread-pricing`
  - `app/api/admin/jobtread/sync-budget/route.ts` → route health for `/api/admin/jobtread/sync-budget`
  - `app/api/admin/integrations/jobtread/test/route.ts` → route health for `/api/admin/integrations/jobtread/test`
  - `app/lib/jobtread/sync-budget.ts` → JobTread sync runs + failures

### Verify end-to-end

1. Start the app:
   ```bash
   npm run dev
   ```
   (this also starts the local `hhi-dev-context` HTTP server)
2. Run:
   ```bash
   npm run dev-context:verify
   ```
3. Optionally visit `/admin/settings/jobtread-pricing` and/or trigger a JobTread sync, then re-run the verify command.

Expected `/summary` shape (example):
```json
{
  "branch": "proposal-v2",
  "commit_hash": "8bc8e16",
  "latest_task_statuses": {
    "dev-server": { "status": "running", "summary": null, "ended_at": null }
  },
  "latest_sync_run": {
    "id": 12,
    "job_id": "22PJXd2cjdhN",
    "status": "success",
    "started_at": "2026-03-19T12:00:00.000Z",
    "finished_at": "2026-03-19T12:00:15.000Z",
    "summary": "jobtread ...",
    "error_message": null,
    "created_at": "2026-03-19T12:00:00.000Z"
  },
  "route_health": [
    { "route": "/admin/settings/jobtread-pricing", "status": "ok", "response_time_ms": 120, "active_job_id": null, "notes": "..." }
  ]
}
```

## Env vars (see `.env.example`)

- `DATABASE_URL` – PostgreSQL URL
- `CLERK_*` – Clerk keys
- `ADMIN_EMAILS` – Optional bootstrap-admin count for the demotion guard (not an auth allowlist post-C.5)
- `R2_*` or S3 equivalents – Object storage
- Optional: Playwright-related vars for PDF export
- Optional: `HHI_DEV_CONTEXT_ENABLED`, `HHI_DEV_CONTEXT_BASE_URL`
