import { redirect } from "next/navigation";
import { settingsTabPath } from "./settings-routes";

export default function AdminSettingsPage() {
  redirect(settingsTabPath("company-profile"));
}
