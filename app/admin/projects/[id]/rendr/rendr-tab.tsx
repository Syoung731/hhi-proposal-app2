"use client";

import { RendrShell } from "./rendr-shell";
import type { LinkedSpace } from "@/app/lib/rendr/linkedSpaces";

type AppRoom = { id: string; name: string };
type SectionTypeOption = { id: string; name: string; category: string };

type Props = {
  projectId: string;
  rendrSpaces: LinkedSpace[];
  rendrProjectId: number | null;
  rendrImportedAt: string | null;
  rooms: AppRoom[];
  sectionTypes?: SectionTypeOption[];
};

export function RendrTab({ projectId, rendrSpaces, rendrProjectId, rendrImportedAt, rooms, sectionTypes }: Props) {
  return (
    <RendrShell
      projectId={projectId}
      rendrSpaces={rendrSpaces}
      rendrProjectId={rendrProjectId}
      rendrImportedAt={rendrImportedAt}
      rooms={rooms}
      sectionTypes={sectionTypes ?? []}
    />
  );
}
