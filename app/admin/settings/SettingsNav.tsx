"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { settingsTabPath } from "./settings-routes";
import { SETTINGS_TABS } from "./settings-tabs";

export function SettingsNav() {
  const pathname = usePathname();

  return (
    <aside className="w-64 shrink-0">
      <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <p className="mb-2 px-3 py-1.5 text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          Company Setup
        </p>
        <nav className="space-y-0.5">
          {SETTINGS_TABS.map(({ slug, label }) => {
            const href = settingsTabPath(slug);
            const isActive =
              pathname === href || pathname.startsWith(href + "/");
            const linkClass =
              "block w-full rounded-lg px-3 py-3 text-left text-sm transition-colors " +
              (isActive
                ? "bg-zinc-100 font-medium text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
                : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800/70 dark:hover:text-zinc-100");
            const jobtreadPricingHref = "/admin/settings/jobtread-pricing";
            const isJobTreadPricingActive =
              pathname === jobtreadPricingHref ||
              pathname.startsWith(jobtreadPricingHref + "/");
            const jobtreadLinkClass =
              "block w-full rounded-lg py-2.5 pl-7 pr-3 text-left text-sm transition-colors " +
              (isJobTreadPricingActive
                ? "bg-zinc-100 font-medium text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
                : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800/70 dark:hover:text-zinc-100");
            return (
              <div key={slug}>
                <Link href={href} className={linkClass}>
                  {label}
                </Link>
                {slug === "pricing-profiles" && (
                  <Link href={jobtreadPricingHref} className={jobtreadLinkClass}>
                    JobTread Pricing
                  </Link>
                )}
              </div>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}
