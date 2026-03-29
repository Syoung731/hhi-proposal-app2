import { requireAdmin } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";
import { AdminLayoutChrome } from "./AdminLayoutChrome";

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
  const identity = await requireAdmin();

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
    <AdminLayoutChrome
      displayName={displayName}
      primaryColorHex={primaryColorHex}
      logoLightUrl={logoLightUrl}
      brandTextStyle={brandTextStyle}
    >
      {children}
    </AdminLayoutChrome>
  );
}
