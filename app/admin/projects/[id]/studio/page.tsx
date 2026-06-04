import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/app/lib/prisma";
import { requireAdmin } from "@/app/lib/auth";
import { isRendrConfigured } from "@/app/lib/rendr/rendrClient";
import { ProjectTabNav } from "../ProjectTabNav";
import { StudioTab } from "./studio-tab";

export const metadata: Metadata = {
  title: "Build Presentation — HHI Builders",
};

// Server-side gate: even with the route present, it 404s unless the flag is on,
// so the in-development Studio is invisible in production until we flip it.
const STUDIO_ENABLED = process.env.NEXT_PUBLIC_STUDIO_ENABLED === "true";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function StudioPage({ params }: PageProps) {
  await requireAdmin();
  if (!STUDIO_ENABLED) notFound();

  const { id } = await params;

  const project = await prisma.project.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      rooms: {
        where: { isProjectOverhead: false },
        select: { id: true, name: true },
        orderBy: { sortOrder: "asc" },
      },
    },
  });
  if (!project) notFound();

  const rendrConfigured = await isRendrConfigured().catch(() => false);

  return (
    <div className="px-6">
      <div className="py-4">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
          {project.title}
        </h1>
      </div>
      <ProjectTabNav
        projectId={project.id}
        currentTab="studio"
        rendrConfigured={rendrConfigured}
        stickyTop={112}
      />
      <StudioTab projectId={project.id} rooms={project.rooms} />
    </div>
  );
}
