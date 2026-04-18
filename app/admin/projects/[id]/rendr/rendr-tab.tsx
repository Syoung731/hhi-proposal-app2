"use client";

import { RendrShell } from "./rendr-shell";

type AppRoom = { id: string; name: string };
type SectionTypeOption = { id: string; name: string; category: string };

type Props = {
  projectId: string;
  rendrSpaceId: number | null;
  rendrProjectId: number | null;
  rendrImportedAt: string | null;
  rooms: AppRoom[];
  sectionTypes?: SectionTypeOption[];
};

export function RendrTab({ projectId, rendrSpaceId, rendrProjectId, rendrImportedAt, rooms, sectionTypes }: Props) {
  return (
    <RendrShell
      projectId={projectId}
      rendrSpaceId={rendrSpaceId}
      rendrProjectId={rendrProjectId}
      rendrImportedAt={rendrImportedAt}
      rooms={rooms}
      sectionTypes={sectionTypes ?? []}
    />
  );
}
