import { requireAdmin } from "@/app/lib/auth";
import { PhotoLibraryTab } from "./photo-library-tab";

export default async function PhotoLibraryPage() {
  await requireAdmin();
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <div className="mx-auto w-full max-w-[1600px] px-6 py-10">
        <PhotoLibraryTab />
      </div>
    </div>
  );
}
