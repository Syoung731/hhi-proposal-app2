import { redirect } from "next/navigation";
import { requireAdmin } from "@/app/lib/auth";
import Link from "next/link";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let identity: { userId: string; email: string | null };
  try {
    identity = await requireAdmin();
  } catch {
    redirect("/");
  }
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <Link href="/admin/projects" className="font-semibold text-zinc-900 dark:text-zinc-100">
            HHI Admin
          </Link>
          <nav className="flex items-center gap-4">
            <Link
              href="/admin/projects"
              className="text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
            >
              Projects
            </Link>
            <span className="text-sm text-zinc-500 dark:text-zinc-500">
              {identity.email ?? identity.userId}
            </span>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
