import Link from "next/link";
import { prisma } from "@/app/lib/prisma";

function ProjectsIcon() {
  return (
    <svg
      className="h-8 w-8 text-zinc-500 dark:text-zinc-400"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z"
      />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg
      className="h-8 w-8 text-zinc-500 dark:text-zinc-400"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
      />
    </svg>
  );
}

export default async function AdminHomePage() {
  let companySettings: { logoLightUrl: string | null; primaryColorHex: string | null } | null = null;
  let roomTypeCount: number | null = null;

  try {
    const [settings, count] = await Promise.all([
      prisma.companySettings.findFirst({ select: { logoLightUrl: true, primaryColorHex: true } }),
      prisma.roomType.count({ where: { active: true } }),
    ]);
    companySettings = settings;
    roomTypeCount = count;
  } catch {
    // Use fallbacks below
  }

  const brandingStatus = companySettings?.logoLightUrl?.trim() ? "Logo set" : "Missing";
  const colorsStatus = companySettings?.primaryColorHex?.trim() ? "Accent set" : "Missing";
  const roomTypesStatus = roomTypeCount !== null ? String(roomTypeCount) : "—";
  const publicMediaBaseUrl =
    process.env.PUBLIC_MEDIA_BASE_URL ??
    process.env.R2_PUBLIC_BASE_URL ??
    process.env.S3_PUBLIC_BASE_URL ??
    "";
  const mediaStatus = publicMediaBaseUrl.trim() ? "Configured" : "Missing";

  return (
    <div className="space-y-8">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
          Admin Dashboard
        </h1>
        <p className="mt-1 text-zinc-600 dark:text-zinc-400">
          Manage projects, company settings, and integrations.
        </p>
      </header>

      <section className="grid gap-6 md:grid-cols-2">
        <div className="min-h-[140px] rounded-xl border border-zinc-200 bg-white p-6 shadow-sm transition hover:shadow-md hover:-translate-y-0.5 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700">
          <div className="flex flex-col h-full">
            <ProjectsIcon />
            <h2 className="mt-3 text-lg font-medium text-zinc-900 dark:text-zinc-100">
              Projects
            </h2>
            <p className="mt-1 flex-1 text-sm text-zinc-600 dark:text-zinc-400">
              Manage proposals and project content.
            </p>
            <Link
              href="/admin/projects"
              className="mt-4 inline-flex w-fit items-center justify-center rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 shadow-sm transition hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
            >
              View Projects
            </Link>
          </div>
        </div>

        <div className="min-h-[140px] rounded-xl border border-zinc-200 bg-white p-6 shadow-sm transition hover:shadow-md hover:-translate-y-0.5 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700">
          <div className="flex flex-col h-full">
            <SettingsIcon />
            <h2 className="mt-3 text-lg font-medium text-zinc-900 dark:text-zinc-100">
              Settings
            </h2>
            <p className="mt-1 flex-1 text-sm text-zinc-600 dark:text-zinc-400">
              Admin and application settings, branding, and pricing profiles.
            </p>
            <Link
              href="/admin/settings"
              className="mt-4 inline-flex w-fit items-center justify-center rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 shadow-sm transition hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
            >
              Open Settings
            </Link>
          </div>
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-lg font-medium text-zinc-900 dark:text-zinc-100">
          System Status
        </h2>
        <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Branding
              </p>
              <p className="mt-1 text-sm font-medium text-zinc-900 dark:text-zinc-100">
                {brandingStatus}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Colors
              </p>
              <p className="mt-1 text-sm font-medium text-zinc-900 dark:text-zinc-100">
                {colorsStatus}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Pricing Profiles
              </p>
              <p className="mt-1 text-sm font-medium text-zinc-900 dark:text-zinc-100">
                {roomTypesStatus}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Media
              </p>
              <p className="mt-1 text-sm font-medium text-zinc-900 dark:text-zinc-100">
                {mediaStatus}
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
