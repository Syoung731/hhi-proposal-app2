import { requireAdmin } from "@/app/lib/auth";
import { listEngineeringAssemblies } from "./actions";
import { EngineeringAssembliesClient } from "./EngineeringAssembliesClient";

export const dynamic = "force-dynamic";

export default async function EngineeringAssembliesPage() {
  await requireAdmin();
  const assemblies = await listEngineeringAssemblies();

  return <EngineeringAssembliesClient initialAssemblies={assemblies} />;
}
