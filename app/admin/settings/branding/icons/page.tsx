import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** Icon Library is now a slide-over on Branding settings. Redirect so the panel opens there. */
export default function IconLibraryPage() {
  redirect("/admin/settings?openIconLibrary=1#branding");
}

