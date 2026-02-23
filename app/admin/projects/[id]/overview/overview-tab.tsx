"use client";

import { useRouter } from "next/navigation";
import { updateProjectOverviewAction } from "./actions";

type Props = {
  projectId: string;
  project: {
    title: string;
    subtitle: string | null;
    address: string | null;
    clientNames: string | null;
    objective: string | null;
    coverHeroImageId: string | null;
  };
  media: { id: string; url: string; kind: string; caption: string | null }[];
};

export function OverviewTab({ projectId, project, media }: Props) {
  const router = useRouter();

  async function submit(formData: FormData) {
    await updateProjectOverviewAction(projectId, formData);
    router.refresh();
  }

  return (
    <form action={submit} className="max-w-2xl space-y-4">
      <div>
        <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Title
        </label>
        <input
          name="title"
          defaultValue={project.title}
          required
          className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Subtitle
        </label>
        <input
          name="subtitle"
          defaultValue={project.subtitle ?? ""}
          className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Address
        </label>
        <input
          name="address"
          defaultValue={project.address ?? ""}
          className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Client names
        </label>
        <input
          name="clientNames"
          defaultValue={project.clientNames ?? ""}
          className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Objective
        </label>
        <textarea
          name="objective"
          defaultValue={project.objective ?? ""}
          rows={4}
          className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Cover hero image
        </label>
        <select
          name="coverHeroImageId"
          defaultValue={project.coverHeroImageId ?? ""}
          className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
        >
          <option value="">None</option>
          {media.map((m) => (
            <option key={m.id} value={m.id}>
              {m.caption || m.kind} ({m.id.slice(0, 8)})
            </option>
          ))}
        </select>
      </div>
      <button
        type="submit"
        className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
      >
        Save overview
      </button>
    </form>
  );
}
