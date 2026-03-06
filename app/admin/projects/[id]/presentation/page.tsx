import { notFound } from "next/navigation";
import Link from "next/link";
import { getProject } from "../page";
import { listActiveStylePresets, listSectionTypes, listBrandIcons } from "@/app/admin/settings/actions";
import { ProjectTabs } from "../tabs";
import { PresentationTab } from "./presentation-tab";
import { prisma } from "@/app/lib/prisma";

export default async function PresentationSetupPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: projectId } = await params;

  const [project, stylePresets, sectionTypes, proposalRow, brandIcons, companySettings] =
    await Promise.all([
      getProject(projectId),
      listActiveStylePresets(),
      listSectionTypes(),
      prisma.proposal.findUnique({
        where: { projectId },
        select: { publicLayoutConfig: true },
      }),
      listBrandIcons(),
      prisma.companySettings.findFirst({ select: { primaryColorHex: true } }),
    ]);

  if (!project) notFound();

  const initialConfig: unknown = proposalRow?.publicLayoutConfig ?? null;

  const serializableMedia = project.media.map((m) => ({
    id: m.id,
    url: m.url,
    kind: m.kind,
    type: m.type,
    roomId: m.roomId,
    parentMediaId: m.parentMediaId,
  }));
  const serializableRooms = project.rooms.map((r) => ({
    id: r.id,
    name: r.name,
    scopeNarrative: r.scopeNarrative ?? "",
    lengthIn: r.lengthIn ?? null,
    widthIn: r.widthIn ?? null,
    ceilingHeightIn: r.ceilingHeightIn ?? null,
  }));

  return (
    <div>
      <div className="mb-4">
        <Link
          href="/admin/projects"
          className="text-sm text-zinc-600 hover:underline dark:text-zinc-400"
        >
          ← Projects
        </Link>
      </div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
          {project.title}
        </h1>
      </div>
      <ProjectTabs
        project={project}
        stylePresets={stylePresets}
        sectionTypes={sectionTypes ?? []}
        currentTab="presentation"
      >
        <PresentationTab
          projectId={project.id}
          initialConfig={initialConfig}
          media={serializableMedia}
          rooms={serializableRooms}
          coverContent={{
            title: project.title,
            subtitle: project.subtitle ?? null,
            coverHeroImageId: project.coverHeroImageId ?? null,
          }}
          transcriptText={project.transcriptText ?? null}
          overviewText={project.objective ?? null}
          brandIcons={brandIcons.map((icon) => ({
            id: icon.id,
            imageUrl: icon.imageUrl,
            name: icon.name ?? icon.slug,
          }))}
          brandingAccentColor={
            companySettings?.primaryColorHex?.trim() &&
            /^#[0-9A-Fa-f]{6}$/.test(companySettings.primaryColorHex.trim())
              ? companySettings.primaryColorHex.trim()
              : null
          }
        />
      </ProjectTabs>
    </div>
  );
}
