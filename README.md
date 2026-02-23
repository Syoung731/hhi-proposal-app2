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
- Set `ADMIN_EMAILS` or `ADMIN_USER_IDS` (comma-separated) for admin allowlist.

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
5. Share the public link: `/p/[slug]`.

### 6. Export PDF

- Open `/p/[slug]/pdf` (or use the download button on the public page). The PDF is generated server-side from the **published** snapshot (Playwright), so it matches the shared web view.

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

## Env vars (see `.env.example`)

- `DATABASE_URL` – PostgreSQL URL
- `CLERK_*` – Clerk keys
- `ADMIN_EMAILS` or `ADMIN_USER_IDS` – Admin allowlist
- `R2_*` or S3 equivalents – Object storage
- Optional: Playwright-related vars for PDF export
