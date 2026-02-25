import { redirect } from "next/navigation";
import { requireAdmin } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";
import Link from "next/link";
import { AdminNav } from "./admin-nav";

const HEX_REGEX = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;

function isValidHex(value: string | null | undefined): value is string {
  return typeof value === "string" && HEX_REGEX.test(value);
}

function AdminForbiddenPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-zinc-50 dark:bg-zinc-950">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
        403 Not Authorized
      </h1>
      <p className="text-zinc-600 dark:text-zinc-400">
        You do not have permission to access the admin area.
      </p>
      <a
        href="/"
        className="text-sm text-zinc-600 underline hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
      >
        Return home
      </a>
    </div>
  );
}

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let identity: { userId: string; email: string };
  try {
    identity = await requireAdmin();
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (message.includes("Forbidden")) {
      return <AdminForbiddenPage />;
    }
    redirect("/sign-in?redirect_url=" + encodeURIComponent("/admin"));
  }

  const [settings, employee] = await Promise.all([
    prisma.companySettings.findFirst(),
    identity.email
      ? prisma.employee.findFirst({
          where: { email: { equals: identity.email, mode: "insensitive" } },
        })
      : Promise.resolve(null),
  ]);
  const displayName = employee
    ? `${employee.firstName} ${employee.lastName}`.trim() || identity.email
    : identity.email ?? "";
  const primaryColorHex = isValidHex(settings?.primaryColorHex)
    ? settings.primaryColorHex
    : null;
  const textColorHex = isValidHex(settings?.textColorHex)
    ? settings.textColorHex
    : null;
  const logoLightUrl = settings?.logoLightUrl?.trim() || null;

  const brandTextStyle = textColorHex ? { color: textColorHex } : undefined;

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <header className="sticky top-0 z-50 border-b-2 border-zinc-200 bg-white shadow-sm backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <Link
              href="/admin"
              className="flex items-center font-semibold text-zinc-900 transition hover:opacity-80 dark:text-zinc-100"
              style={!logoLightUrl ? brandTextStyle : undefined}
            >
              {logoLightUrl ? (
                <img
                  src={logoLightUrl}
                  alt="Admin"
                  className="h-10 w-auto object-contain"
                />
              ) : (
                "HHI Admin"
              )}
            </Link>
            <div className="flex items-center">
              <AdminNav primaryColorHex={primaryColorHex} />
              <span className="ml-4 text-xs text-zinc-500 dark:text-zinc-500">
                {displayName}
              </span>
            </div>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1400px] px-6 py-10">{children}</main>
    </div>
  );
}
