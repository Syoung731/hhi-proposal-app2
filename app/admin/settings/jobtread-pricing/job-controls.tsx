"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setJobIncludeInPricingAction } from "./actions";

type Props = {
  jobId: string;
  includeInPricing: boolean;
};

export function JobIncludeCheckbox({ jobId, includeInPricing }: Props) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const next = e.target.checked;
    startTransition(async () => {
      await setJobIncludeInPricingAction(jobId, next);
      router.refresh();
    });
  }

  return (
    <label className="inline-flex cursor-pointer items-center text-zinc-600 dark:text-zinc-300" title={isPending ? "Updating…" : "Include in pricing"}>
      <input
        type="checkbox"
        className="h-3 w-3 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-500 dark:border-zinc-600 dark:bg-zinc-900"
        checked={includeInPricing}
        onChange={handleChange}
        disabled={isPending}
        aria-label="Include in pricing"
      />
    </label>
  );
}

