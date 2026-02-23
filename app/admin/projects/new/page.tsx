import { redirect } from "next/navigation";
import Link from "next/link";
import { createProjectAction } from "./actions";

export default function NewProjectPage() {
  return (
    <div>
      <div className="mb-6">
        <Link
          href="/admin/projects"
          className="text-sm text-zinc-600 hover:underline dark:text-zinc-400"
        >
          ← Projects
        </Link>
      </div>
      <h1 className="mb-6 text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
        New project
      </h1>
      <form action={createProjectAction} className="max-w-md space-y-4">
        <div>
          <label
            htmlFor="title"
            className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
          >
            Title
          </label>
          <input
            id="title"
            name="title"
            type="text"
            required
            placeholder="e.g. Smith Kitchen Remodel"
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 placeholder-zinc-500 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder-zinc-400"
          />
        </div>
        <div className="flex gap-3">
          <button
            type="submit"
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            Create
          </button>
          <Link
            href="/admin/projects"
            className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
