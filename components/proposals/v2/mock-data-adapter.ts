import type { SnapshotData } from "@/app/lib/snapshot";
import { formatAddress, formatOwnerNames } from "@/app/lib/cover-display";
import { formatInvestmentRange } from "@/app/lib/format-investment-range";
import type { ScopeModule } from "./ProposalScopeModules";
import type { GuaranteeItem } from "./ProposalGuarantees";
import type { TimelinePhase } from "./ProposalTimeline";
import type { InvestmentLineItem } from "./ProposalInvestment";
import type { NextStepItem } from "./ProposalNextSteps";

/**
 * Adapter: maps SnapshotData (or null) to v2 section props.
 * Uses placeholder/mock data when snapshot is null or fields missing.
 *
 * TODO (data mapping to existing backend):
 * - Guarantees: currently DEFAULT_GUARANTEES; wire from settings/value pillars when available.
 * - Next steps: currently DEFAULT_NEXT_STEPS; wire from settings or proposal template.
 * - Closing contact: companyName/phone/email/website from branding or org settings.
 * - Scope module priceBadge: map from room-level or investment line when available.
 * - Retainer amount/note: from project or proposal settings when available.
 */

function roomDisplayName(room: SnapshotData["rooms"][0]): string {
  if ("name" in room && room.name) return room.name;
  const legacy = room as { roomType?: string; roomLabel?: string | null };
  if (legacy.roomType === "OTHER" && legacy.roomLabel) return legacy.roomLabel;
  if (legacy.roomType)
    return legacy.roomType
      .replace(/_/g, " ")
      .toLowerCase()
      .replace(/\b\w/g, (c) => c.toUpperCase());
  return "Room";
}

/** Default guarantees when not yet from backend. */
const DEFAULT_GUARANTEES: GuaranteeItem[] = [
  {
    id: "g1",
    title: "Quality craftsmanship",
    description:
      "We stand behind our work with clear standards and accountability.",
  },
  {
    id: "g2",
    title: "Transparent communication",
    description:
      "Regular updates and a single point of contact throughout the project.",
  },
  {
    id: "g3",
    title: "On-time delivery",
    description:
      "Realistic timelines and proactive scheduling to meet your goals.",
  },
  {
    id: "g4",
    title: "Fixed-scope clarity",
    description:
      "Defined scope and change process so there are no surprises.",
  },
];

/** Default next steps when not yet from backend. */
const DEFAULT_NEXT_STEPS: NextStepItem[] = [
  { id: "n1", stepNumber: 1, title: "Review this proposal", description: "Take your time and note any questions." },
  { id: "n2", stepNumber: 2, title: "Schedule a follow-up call", description: "We'll walk through details and your priorities." },
  { id: "n3", stepNumber: 3, title: "Sign and retainer", description: "Secure your timeline with a retainer agreement." },
];

export type ClosingContact = {
  companyName: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
};

export type ProposalV2SectionProps = {
  hero: {
    coverImageUrl: string | null;
    coverImageAlt: string;
    propertyName: string | null;
    proposalTitle: string | null;
    preparedFor: string | null;
    date: string | null;
    brandingLabel: string | null;
  };
  objective: {
    headline: string;
    objective: string | null;
    bullets: string[];
  };
  scopeModules: { title: string; modules: ScopeModule[] };
  guarantees: { title: string; items: GuaranteeItem[] };
  timeline: { title: string; phases: TimelinePhase[] };
  investment: {
    title: string;
    lineItems: InvestmentLineItem[];
    totalRange: string | null;
    retainerAmount: string | null;
    retainerNote: string | null;
  };
  nextSteps: { title: string; steps: NextStepItem[] };
  closing: {
    imageUrl: string | null;
    imageAlt: string;
    statement: string | null;
    contact: ClosingContact;
  };
};

export function snapshotToProposalV2Props(
  snapshot: SnapshotData | null
): ProposalV2SectionProps {
  const project = snapshot?.project;
  const rooms = snapshot?.rooms ?? [];
  const media = snapshot?.media ?? [];
  const timelinePhases = snapshot?.timelinePhases ?? [];
  const investmentLineItems = snapshot?.investmentLineItems ?? [];

  const coverMedia =
    media.find((m) => (m as { type?: string }).type === "HERO") ??
    (project?.coverHeroImageId
      ? media.find((m) => m.id === project.coverHeroImageId)
      : null) ??
    media.find((m) => m.kind === "COVER");
  const mediaByRoom = new Map<string, typeof media>();
  for (const m of media) {
    if (m.roomId) {
      const list = mediaByRoom.get(m.roomId) ?? [];
      list.push(m);
      mediaByRoom.set(m.roomId, list);
    }
  }

  const preparedFor = project
    ? formatOwnerNames({
        client1First: project.client1First,
        client1Last: project.client1Last,
        client2First: project.client2First,
        client2Last: project.client2Last,
      })
    : null;
  const address = project
    ? formatAddress({
        addressLine1: project.addressLine1,
        addressLine2: project.addressLine2,
        city: project.city,
        state: project.state,
        zip: project.zip,
      })
    : null;

  const modules: ScopeModule[] = rooms.map((room) => {
    const roomMedia = mediaByRoom.get(room.id) ?? [];
    const firstMedia = roomMedia[0];
    const bullets = (room.scopeNarrative ?? "")
      .split(/\n+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 5);
    return {
      id: room.id,
      title: roomDisplayName(room),
      subtitle: null, // TODO: map from room-level subtitle when available
      bullets: bullets.length ? bullets : ["Scope details to be discussed."],
      imageUrl: firstMedia?.url ?? null,
      priceBadge: null, // TODO: map from room-level or line-item range when available
    };
  });

  if (modules.length === 0) {
    modules.push({
      id: "placeholder",
      title: "Scope overview",
      subtitle: null,
      bullets: ["Scope will be defined based on our discussion."],
      imageUrl: null,
      priceBadge: null,
    });
  }

  const phases: TimelinePhase[] = timelinePhases.map((p) => ({
    id: p.id,
    title: p.phase
      .replace(/_/g, " ")
      .toLowerCase()
      .replace(/\b\w/g, (c) => c.toUpperCase()),
    duration: p.durationText ?? "—",
    description: null,
  }));

  const lineItems: InvestmentLineItem[] = investmentLineItems.map((item) => ({
    id: item.id,
    label: item.label,
    rangeDisplay: formatInvestmentRange(
      item.rangeLow,
      item.rangeTarget,
      item.rangeHigh
    ),
    notes: item.notes,
    includeInTotals: item.includeInTotals,
  }));

  let totalLow = 0;
  let totalHigh = 0;
  let hasTotal = false;
  for (const item of investmentLineItems) {
    if (item.includeInTotals !== false) {
      if (item.rangeLow != null) {
        totalLow += item.rangeLow;
        hasTotal = true;
      }
      if (item.rangeHigh != null) {
        totalHigh += item.rangeHigh;
      }
    }
  }
  const totalRange =
    hasTotal && totalHigh >= totalLow
      ? totalLow === totalHigh
        ? `$${totalLow.toLocaleString()}`
        : `$${totalLow.toLocaleString()} – $${totalHigh.toLocaleString()}`
      : null;

  const contact: ClosingContact = {
    companyName: "HHI Builders",
    phone: null,
    email: null,
    website: null,
  };
  // TODO: Wire from branding/settings when available

  return {
    hero: {
      coverImageUrl: coverMedia?.url ?? null,
      coverImageAlt: project?.title ?? "Cover",
      propertyName: address ?? project?.subtitle ?? null,
      proposalTitle: project?.title ?? "Project Proposal",
      preparedFor: preparedFor || null,
      date: new Date().toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      }),
      brandingLabel: "HHI Builders",
    },
    objective: {
      headline: "Objective",
      objective: project?.objective ?? null,
      bullets: [
        "Experienced, licensed team dedicated to quality.",
        "Clear scope and transparent pricing.",
        "One point of contact from start to finish.",
      ],
    },
    scopeModules: { title: "Scope", modules },
    guarantees: { title: "Our Guarantees", items: DEFAULT_GUARANTEES },
    timeline: { title: "Timeline", phases },
    investment: {
      title: "Investment",
      lineItems,
      totalRange,
      retainerAmount: null,
      retainerNote: null,
    },
    nextSteps: { title: "Next Steps", steps: DEFAULT_NEXT_STEPS },
    closing: {
      imageUrl: coverMedia?.url ?? null,
      imageAlt: "Thank you",
      statement:
        "We look forward to working with you. Reach out with any questions.",
      contact,
    },
  };
}
