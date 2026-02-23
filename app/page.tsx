import Link from "next/link";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-zinc-50 px-4 dark:bg-zinc-950">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
        HHI Builders Proposal App
      </h1>
      <p className="text-center text-zinc-600 dark:text-zinc-400">
        Create and share proposal websites with PDF export.
      </p>
      <Link
        href="/admin/projects"
        className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
      >
        Admin: Projects
      </Link>
    </div>
  );
}
