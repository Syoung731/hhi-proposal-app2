import { notFound } from "next/navigation";
import { getPublicProposalSnapshot } from "@/app/lib/public-proposal";
import { getLayoutConfig } from "@/app/lib/layout-config";
import { formatOwnerNames, formatAddress } from "@/app/lib/cover-display";
import { CoverRenderer } from "@/components/public/cover";

export default async function CoverPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getPublicProposalSnapshot(id);
  if (!data) notFound();

  const cfg = getLayoutConfig(data.publicLayoutConfig);
  const { snapshot } = data;
  const { project, media } = snapshot;

  const address = formatAddress({
    addressLine1: project.addressLine1,
    addressLine2: project.addressLine2,
    city: project.city,
    state: project.state,
    zip: project.zip,
  });

  const clientNames = formatOwnerNames({
    client1First: project.client1First,
    client1Last: project.client1Last,
    client2First: project.client2First,
    client2Last: project.client2Last,
  });

  const meta = (
    <>
      {clientNames ? <p>Prepared for {clientNames}</p> : null}
      {address ? <p>{address}</p> : null}
    </>
  );

  return (
    <CoverRenderer
      coverConfig={cfg.pages.cover}
      media={media.map((m) => ({
        id: m.id,
        url: m.url,
        kind: m.kind,
        type: m.type,
      }))}
      content={{
        title: project.title,
        subtitle: project.subtitle ?? null,
        badge: "Project Investment & Design Concept",
        meta,
      }}
      coverHeroImageId={project.coverHeroImageId}
    />
  );
}
