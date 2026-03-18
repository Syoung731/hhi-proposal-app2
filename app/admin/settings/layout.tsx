import { SettingsNav } from "./SettingsNav";

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <div className="mx-auto w-full max-w-[1920px] px-6 py-10">
        <div className="flex gap-8">
          <SettingsNav />
          <div className="min-w-0 w-full flex-1">{children}</div>
        </div>
      </div>
    </div>
  );
}
