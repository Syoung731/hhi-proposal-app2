import type { Project, Room, Media, TimelinePhase, InvestmentLineItem } from "@/app/generated/prisma";
import { MediaKind, MediaType } from "@/app/generated/prisma";
import { stripScopeClarifications } from "@/app/lib/scope-narrative";
import { isBadPlaceholderUrl } from "@/app/lib/media";
import { formatAddress, formatOwnerNames } from "@/app/lib/cover-display";
import { formatInvestmentRange } from "@/app/lib/format-investment-range";

type ProjectWithRelations = Project & {
  rooms: Room[];
  media: Media[];
  timelinePhases: TimelinePhase[];
  investmentLineItems: InvestmentLineItem[];
};

export function DraftProposalView({ project }: { project: ProjectWithRelations }) {
  const coverMedia =
    project.media.find((m) => m.type === MediaType.HERO) ??
    (project.coverHeroImageId
      ? project.media.find((m) => m.id === project.coverHeroImageId)
      : null) ??
    project.media.find((m) => m.kind === MediaKind.COVER);
  const mediaByRoom = new Map<string, Media[]>();
  for (const m of project.media) {
    if (m.roomId) {
      const list = mediaByRoom.get(m.roomId) ?? [];
      list.push(m);
      mediaByRoom.set(m.roomId, list);
    }
  }
  const effectiveRange = (item: InvestmentLineItem) => {
    if (item.isOverride) {
      return {
        low: item.overrideLow ?? null,
        target: item.overrideTarget ?? null,
        high: item.overrideHigh ?? null,
      };
    }
    return {
      low: item.rangeLow,
      target: item.rangeTarget,
      high: item.rangeHigh,
    };
  };

  return (
    <article className="mx-auto max-w-4xl px-4 py-12">
      {/* Cover */}
      <section className="mb-16 text-center">
        {coverMedia && (
          <div className="relative mb-6 aspect-video w-full overflow-hidden rounded-lg bg-zinc-100 dark:bg-zinc-800">
            {isBadPlaceholderUrl(coverMedia.url) ? (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  background: "#f5f5f5",
                  color: "#999",
                  display: "grid",
                  placeItems: "center",
                  fontSize: 12,
                  borderRadius: 8,
                }}
              >
                No image
              </div>
            ) : (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={coverMedia.url}
                alt=""
                className="h-full w-full object-cover"
              />
            )}
          </div>
        )}
        <h1 className="text-4xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
          {project.title}
        </h1>
        {project.subtitle && (
          <p className="mt-2 text-xl text-zinc-600 dark:text-zinc-400">
            {project.subtitle}
          </p>
        )}
        {formatAddress(project) && (
          <p className="mt-1 text-zinc-500 dark:text-zinc-500">
            {formatAddress(project)}
          </p>
        )}
        {formatOwnerNames(project) && (
          <p className="mt-1 text-zinc-500 dark:text-zinc-500">
            {formatOwnerNames(project)}
          </p>
        )}
      </section>

      {/* Objective */}
      {project.objective && (
        <section className="mb-16">
          <h2 className="mb-4 text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
            Objective
          </h2>
          <p className="whitespace-pre-wrap text-zinc-700 dark:text-zinc-300">
            {project.objective}
          </p>
        </section>
      )}

      {/* Why HHI Builders - placeholder */}
      <section className="mb-16">
        <h2 className="mb-4 text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
          Why HHI Builders
        </h2>
        <p className="text-zinc-600 dark:text-zinc-400">
          [Static template block – editable optional fields can be added later.]
        </p>
      </section>

      {/* Sections */}
      {project.rooms.map((room) => (
        <section key={room.id} className="mb-16">
          <h2 className="mb-3 text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
            {room.name}
          </h2>
          <p className="mb-4 whitespace-pre-wrap text-zinc-700 dark:text-zinc-300">
            {stripScopeClarifications(room.scopeNarrative ?? "") || "—"}
          </p>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {(mediaByRoom.get(room.id) ?? [])
              .slice(0, 4)
              .map((m) => (
                <div
                  key={m.id}
                  className="relative aspect-square overflow-hidden rounded-lg bg-zinc-100 dark:bg-zinc-800"
                >
                  {isBadPlaceholderUrl(m.url) ? (
                    <div
                      style={{
                        position: "absolute",
                        inset: 0,
                        background: "#f5f5f5",
                        color: "#999",
                        display: "grid",
                        placeItems: "center",
                        fontSize: 12,
                        borderRadius: 8,
                      }}
                    >
                      No image
                    </div>
                  ) : (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={m.url}
                      alt={m.caption ?? ""}
                      className="h-full w-full object-cover"
                    />
                  )}
                </div>
              ))}
          </div>
        </section>
      ))}

      {/* Timeline */}
      {project.timelinePhases.length > 0 && (
        <section className="mb-16">
          <h2 className="mb-4 text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
            Timeline
          </h2>
          <ul className="space-y-2">
            {project.timelinePhases.map((phase) => (
              <li
                key={phase.id}
                className="flex justify-between text-zinc-700 dark:text-zinc-300"
              >
                <span>
                  {phase.phase.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())}
                </span>
                <span>{phase.durationText || "—"}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Investment */}
      {project.investmentLineItems.length > 0 && (
        <section className="mb-16">
          <h2 className="mb-4 text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
            Investment
          </h2>
          <div className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-700">
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-50 dark:bg-zinc-800/50">
                <tr>
                  <th className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100">
                    Item
                  </th>
                  <th className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100">
                    Range
                  </th>
                  <th className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100">
                    Notes
                  </th>
                </tr>
              </thead>
              <tbody>
                {project.investmentLineItems.map((item) => {
                  const { low, target, high } = effectiveRange(item);
                  return (
                    <tr
                      key={item.id}
                      className="border-t border-zinc-200 dark:border-zinc-700"
                    >
                      <td className="px-4 py-3 text-zinc-900 dark:text-zinc-100">
                        {item.label}
                      </td>
                      <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                        {formatInvestmentRange(low, target, high)}
                      </td>
                      <td className="px-4 py-3 text-zinc-500 dark:text-zinc-500">
                        {item.notes ?? "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Next steps / closing */}
      <section className="border-t border-zinc-200 pt-12 dark:border-zinc-800">
        <h2 className="mb-4 text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
          Next steps
        </h2>
        <p className="text-zinc-600 dark:text-zinc-400">
          [Contact info placeholders – to be configured.]
        </p>
      </section>
    </article>
  );
}
