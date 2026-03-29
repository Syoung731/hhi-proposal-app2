"use client";

import type {
  ProposalSlide,
  DeckBranding,
  WhyUsContent,
  WhyUsPillarItem,
  WhyUsTestimonial,
  WhyUsLayoutKey,
} from "@/app/lib/deck/types";

// ─── Stub testimonials ─────────────────────────────────────────────────────────
// Used by testimonials-split when no real reviews are wired yet.
// Phase 2: replace with real project review data from DB.

const STUB_TESTIMONIALS: WhyUsTestimonial[] = [
  {
    id: "stub-1",
    quote:
      "Just as important, what we agreed to upfront is exactly what we were charged at the end. Having that clarity made it much easier to make confident decisions.",
    author: "Christina Galbreath-Gonzalez",
    location: "Hilton Head, SC",
  },
  {
    id: "stub-2",
    quote:
      "They found structural issues during design that would have cost us tens of thousands mid-project. That feasibility process alone paid for itself.",
    author: "Robert & Lynn Tanner",
    location: "Bluffton, SC",
  },
  {
    id: "stub-3",
    quote:
      "We've worked with other contractors who padded material costs. HHI charged us exactly what they paid. No surprises, no markup.",
    author: "James Whitfield",
    location: "Hilton Head Island, SC",
  },
];

// ─── Shared helpers ────────────────────────────────────────────────────────────

interface LayoutProps {
  slide: ProposalSlide;
  branding: DeckBranding;
}

function getVisiblePillars(content: WhyUsContent): WhyUsPillarItem[] {
  const all = content.pillars ?? [];
  if ((content.selectedPillarIds?.length ?? 0) > 0) {
    return all.filter((p) => content.selectedPillarIds!.includes(p.id));
  }
  return all;
}

function getSectionTitle(content: WhyUsContent, slide: ProposalSlide): string {
  return content.sectionTitle || slide.headline || "The HHI Difference";
}

function NoPillars() {
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "0.5em",
      }}
    >
      <p style={{ fontSize: "0.8em", color: "#9CA3AF" }}>No pillars to display.</p>
      <p style={{ fontSize: "0.65em", color: "#C4C4BF" }}>
        Go to Settings → Value Pillars to add them.
      </p>
    </div>
  );
}

// ─── Layout 1: pillars-grid ────────────────────────────────────────────────────
// Icon-forward columns with full-height separators. Left-aligned large serif title.

function PillarCard({
  pillar,
  branding,
}: {
  pillar: WhyUsPillarItem;
  branding: DeckBranding;
}) {
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        textAlign: "center",
        padding: "0 4%",
      }}
    >
      {/* Icon */}
      <div
        style={{
          height: "5.5em",
          marginBottom: "1.0em",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {pillar.iconUrl ? (
          <img
            src={pillar.iconUrl}
            alt={pillar.title}
            style={{ maxHeight: "100%", maxWidth: "5.5em", objectFit: "contain" }}
          />
        ) : (
          <div
            style={{
              width: "4em",
              height: "4em",
              borderRadius: "50%",
              border: `2px solid ${branding.accentColor}`,
              background: `${branding.accentColor}12`,
            }}
          />
        )}
      </div>

      <p
        className="font-serif"
        style={{
          fontSize: "1.0em",
          fontWeight: 700,
          color: branding.textColor,
          lineHeight: 1.25,
          marginBottom: "0.55em",
        }}
      >
        {pillar.title}
      </p>

      <p style={{ fontSize: "0.72em", color: "#4B5563", lineHeight: 1.7, fontWeight: 400 }}>
        {pillar.body}
      </p>
    </div>
  );
}

function PillarsGridLayout({ slide, branding }: LayoutProps) {
  const content = (slide.content ?? {}) as WhyUsContent;
  const visiblePillars = getVisiblePillars(content);
  const sectionTitle = getSectionTitle(content, slide);

  const pillarRow = visiblePillars.flatMap((pillar, i) => {
    const card = <PillarCard key={pillar.id} pillar={pillar} branding={branding} />;
    if (i === 0) return [card];
    return [
      <div
        key={`sep-${i}`}
        style={{
          flexShrink: 0,
          width: 1,
          alignSelf: "stretch",
          background: "rgba(0,0,0,0.10)",
        }}
      />,
      card,
    ];
  });

  return (
    <div className="relative w-full h-full" style={{ background: "#FAFAF8", overflow: "hidden" }}>
      {/* Dashed grid watermark */}
      <svg
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          pointerEvents: "none",
          opacity: 0.04,
        }}
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden
      >
        <defs>
          <pattern id="wug-pg-grid" x="0" y="0" width="40" height="40" patternUnits="userSpaceOnUse">
            <path
              d="M 40 0 L 0 0 0 40"
              fill="none"
              stroke={branding.textColor}
              strokeWidth="0.5"
              strokeDasharray="2 4"
            />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#wug-pg-grid)" />
      </svg>

      <div
        style={{
          position: "relative",
          zIndex: 1,
          height: "100%",
          display: "flex",
          flexDirection: "column",
          padding: "6% 6% 4%",
        }}
      >
        {/* Header — left-aligned */}
        <div style={{ textAlign: "left", marginBottom: "4%" }}>
          <h2
            className="font-serif"
            style={{ fontSize: "2.9em", fontWeight: 800, color: branding.textColor, lineHeight: 1.15 }}
          >
            {sectionTitle}
          </h2>
          <div
            style={{ height: 2, width: "2.5em", background: branding.accentColor, marginTop: "0.5em" }}
          />
        </div>

        {/* Pillar row */}
        {visiblePillars.length === 0 ? (
          <NoPillars />
        ) : (
          <div
            style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}
          >
            <div style={{ display: "flex", alignItems: "flex-start" }}>{pillarRow}</div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Layout 2: editorial-cards ─────────────────────────────────────────────────
// Text-forward. Centered headline. Soft warm-gray cards. Accent rule per card.
// Optional testimonial quote band at bottom when content.testimonials is set.

function EditorialCardsLayout({ slide, branding }: LayoutProps) {
  const content = (slide.content ?? {}) as WhyUsContent;
  const visiblePillars = getVisiblePillars(content);
  const sectionTitle = getSectionTitle(content, slide);

  // Only show the testimonial band when real testimonials have been wired
  const testimonials = content.testimonials ?? [];
  const hasTestimonial = testimonials.length > 0;

  return (
    <div
      className="relative w-full h-full"
      style={{ background: "#FAFAF8", overflow: "hidden" }}
    >
      {/* Dot-grid texture */}
      <svg
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          pointerEvents: "none",
          opacity: 0.025,
        }}
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden
      >
        <defs>
          <pattern id="wug-ec-dots" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="1" fill={branding.textColor} />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#wug-ec-dots)" />
      </svg>

      <div
        style={{
          position: "relative",
          zIndex: 1,
          height: "100%",
          display: "flex",
          flexDirection: "column",
          padding: "5% 7%",
        }}
      >
        {/* Centered headline */}
        <div style={{ textAlign: "center", marginBottom: hasTestimonial ? "3.5%" : "4.5%" }}>
          <h2
            className="font-serif"
            style={{ fontSize: "2.4em", fontWeight: 800, color: branding.textColor, lineHeight: 1.15 }}
          >
            {sectionTitle}
          </h2>
          <div
            style={{
              height: 2,
              width: "2.5em",
              background: branding.accentColor,
              margin: "0.6em auto 0",
            }}
          />
        </div>

        {/* Cards row */}
        {visiblePillars.length === 0 ? (
          <NoPillars />
        ) : (
          <div
            style={{
              flex: 1,
              display: "flex",
              alignItems: "flex-start",
              gap: "2%",
              marginBottom: hasTestimonial ? "3%" : 0,
            }}
          >
            {visiblePillars.map((pillar) => (
              <div
                key={pillar.id}
                style={{
                  flex: 1,
                  background: "#EEECEA",
                  borderRadius: 6,
                  padding: "4% 5%",
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                {/* Icon — centered at top of card */}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                    height: "3.6em",
                    marginBottom: "1.4em",
                    flexShrink: 0,
                  }}
                >
                  {pillar.iconUrl ? (
                    <img
                      src={pillar.iconUrl}
                      alt={pillar.title}
                      style={{ maxHeight: "3.4em", maxWidth: "3.4em", objectFit: "contain" }}
                    />
                  ) : (
                    <div
                      style={{
                        width: "3em",
                        height: "3em",
                        borderRadius: "50%",
                        border: `2px solid ${branding.accentColor}`,
                        background: `${branding.accentColor}12`,
                      }}
                    />
                  )}
                </div>

                {/* Accent rule */}
                <div
                  style={{
                    width: "1.6em",
                    height: 2,
                    background: branding.accentColor,
                    marginBottom: "0.8em",
                    flexShrink: 0,
                  }}
                />
                <p
                  className="font-serif"
                  style={{
                    fontSize: "0.95em",
                    fontWeight: 700,
                    color: branding.textColor,
                    lineHeight: 1.25,
                    marginBottom: "0.65em",
                    flexShrink: 0,
                  }}
                >
                  {pillar.title}
                </p>
                <p
                  style={{
                    fontSize: "0.68em",
                    color: "#4B5563",
                    lineHeight: 1.75,
                    fontWeight: 400,
                  }}
                >
                  {pillar.body}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* Testimonial band — only renders when testimonials are wired */}
        {hasTestimonial && (
          <div
            style={{
              background: "#EEECEA",
              borderRadius: 4,
              padding: "2.5% 4%",
              borderLeft: `3px solid ${branding.accentColor}`,
            }}
          >
            <p
              className="font-serif"
              style={{
                fontSize: "0.72em",
                fontStyle: "italic",
                color: branding.textColor,
                lineHeight: 1.7,
                marginBottom: "0.4em",
              }}
            >
              &ldquo;{testimonials[0].quote}&rdquo;
            </p>
            <p style={{ fontSize: "0.6em", color: "#6B7280", fontWeight: 500 }}>
              — {testimonials[0].author}
              {testimonials[0].location ? `, ${testimonials[0].location}` : ""}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Layout 3: stacked-list ────────────────────────────────────────────────────
// Vertical rows. Icon left, title + body right. Row dividers. Polished hierarchy.

function StackedListLayout({ slide, branding }: LayoutProps) {
  const content = (slide.content ?? {}) as WhyUsContent;
  const visiblePillars = getVisiblePillars(content);
  const sectionTitle = getSectionTitle(content, slide);

  return (
    <div
      className="relative w-full h-full"
      style={{ background: "#FFFFFF", overflow: "hidden" }}
    >
      {/* Faint vertical accent guide — gives the layout a quiet structure line */}
      <div
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          left: "7.5%",
          width: 1,
          background: `${branding.accentColor}18`,
          pointerEvents: "none",
        }}
      />

      <div
        style={{
          position: "relative",
          zIndex: 1,
          height: "100%",
          display: "flex",
          flexDirection: "column",
          padding: "5% 8%",
        }}
      >
        {/* Header */}
        <div style={{ marginBottom: "3.5%" }}>
          <p
            style={{
              fontSize: "0.58em",
              fontWeight: 600,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: branding.accentColor,
              marginBottom: "0.4em",
            }}
          >
            Why Choose Us
          </p>
          <h2
            className="font-serif"
            style={{ fontSize: "2.4em", fontWeight: 800, color: branding.textColor, lineHeight: 1.15 }}
          >
            {sectionTitle}
          </h2>
          <div
            style={{ height: 2, width: "2.5em", background: branding.accentColor, marginTop: "0.5em" }}
          />
        </div>

        {/* Stacked rows */}
        {visiblePillars.length === 0 ? (
          <NoPillars />
        ) : (
          <div
            style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}
          >
            {visiblePillars.map((pillar, i) => (
              <div key={pillar.id}>
                {/* Row */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "4%",
                    paddingTop: i === 0 ? 0 : "2.6%",
                    paddingBottom: "2.6%",
                  }}
                >
                  {/* Icon container */}
                  <div
                    style={{
                      flexShrink: 0,
                      width: "3.4em",
                      height: "3.4em",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {pillar.iconUrl ? (
                      <img
                        src={pillar.iconUrl}
                        alt={pillar.title}
                        style={{ maxWidth: "3.2em", maxHeight: "3.2em", objectFit: "contain" }}
                      />
                    ) : (
                      <div
                        style={{
                          width: "2.8em",
                          height: "2.8em",
                          borderRadius: "50%",
                          background: `${branding.accentColor}14`,
                          border: `1.5px solid ${branding.accentColor}50`,
                        }}
                      />
                    )}
                  </div>

                  {/* Title + body */}
                  <div style={{ flex: 1 }}>
                    <p
                      className="font-serif"
                      style={{
                        fontSize: "0.95em",
                        fontWeight: 700,
                        color: branding.textColor,
                        lineHeight: 1.25,
                        marginBottom: "0.4em",
                      }}
                    >
                      {pillar.title}
                    </p>
                    <p
                      style={{ fontSize: "0.78em", color: "#374151", lineHeight: 1.65, fontWeight: 500 }}
                    >
                      {pillar.body}
                    </p>
                  </div>
                </div>

                {/* Row divider — inset to align with text column */}
                {i < visiblePillars.length - 1 && (
                  <div
                    style={{
                      height: 1,
                      background: "rgba(0,0,0,0.07)",
                      marginLeft: "calc(3.4em + 4%)",
                    }}
                  />
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Layout 4: testimonials-split ─────────────────────────────────────────────
// Two-column. Left: client quote cards. Right: dark panel with pillar highlights.
// Uses content.testimonials when wired; falls back to STUB_TESTIMONIALS.

function TestimonialsSplitLayout({ slide, branding }: LayoutProps) {
  const content = (slide.content ?? {}) as WhyUsContent;
  const visiblePillars = getVisiblePillars(content);
  const sectionTitle = getSectionTitle(content, slide);

  const testimonials =
    (content.testimonials?.length ?? 0) > 0
      ? content.testimonials!
      : STUB_TESTIMONIALS;

  const displayedTestimonials = testimonials.slice(0, 3);
  const displayedPillars = visiblePillars.slice(0, 4);

  return (
    <div
      className="relative w-full h-full"
      style={{ background: "#FAFAF8", overflow: "hidden" }}
    >
      {/* Dark right-column panel */}
      <div
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          bottom: 0,
          width: "40%",
          background: branding.textColor,
          pointerEvents: "none",
        }}
      />

      <div
        style={{
          position: "relative",
          zIndex: 1,
          height: "100%",
          display: "flex",
          flexDirection: "column",
          padding: "5% 0",
        }}
      >
        {/* Full-width headline */}
        <div style={{ padding: "0 6%", marginBottom: "3%" }}>
          <h2
            className="font-serif"
            style={{
              fontSize: "2.2em",
              fontWeight: 800,
              color: branding.textColor,
              lineHeight: 1.15,
            }}
          >
            {sectionTitle}
          </h2>
          <div
            style={{ height: 2, width: "2.5em", background: branding.accentColor, marginTop: "0.5em" }}
          />
        </div>

        {/* Two-column body */}
        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

          {/* LEFT — testimonial quote cards (60%) */}
          <div
            style={{
              width: "60%",
              padding: "0 3% 0 6%",
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              gap: "3%",
            }}
          >
            {displayedTestimonials.map((t) => (
              <div
                key={t.id}
                style={{
                  background: "#EEECEA",
                  borderRadius: 4,
                  padding: "3% 4%",
                  borderLeft: `3px solid ${branding.accentColor}`,
                }}
              >
                <p
                  className="font-serif"
                  style={{
                    fontSize: "0.63em",
                    fontStyle: "italic",
                    color: branding.textColor,
                    lineHeight: 1.7,
                    marginBottom: "0.5em",
                  }}
                >
                  &ldquo;{t.quote}&rdquo;
                </p>
                <p
                  style={{
                    fontSize: "0.54em",
                    color: "#6B7280",
                    fontWeight: 600,
                    letterSpacing: "0.04em",
                  }}
                >
                  — {t.author}
                  {t.location ? (
                    <span style={{ fontWeight: 400 }}>, {t.location}</span>
                  ) : null}
                </p>
              </div>
            ))}
          </div>

          {/* RIGHT — pillar highlights on dark panel (40%) */}
          <div
            style={{
              width: "40%",
              padding: "0 6% 0 5%",
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              gap: "6%",
            }}
          >
            {/* Column label */}
            <p
              style={{
                fontSize: "0.54em",
                fontWeight: 600,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: branding.accentColor,
              }}
            >
              Why Clients Choose Us
            </p>

            {displayedPillars.length === 0 ? (
              <p style={{ fontSize: "0.65em", color: "rgba(255,255,255,0.4)" }}>
                No pillars selected.
              </p>
            ) : (
              displayedPillars.map((pillar) => (
                <div
                  key={pillar.id}
                  style={{ display: "flex", alignItems: "flex-start", gap: "1em" }}
                >
                  {/* Icon — inverted for dark background */}
                  {pillar.iconUrl ? (
                    <img
                      src={pillar.iconUrl}
                      alt={pillar.title}
                      style={{
                        width: "2.4em",
                        height: "2.4em",
                        objectFit: "contain",
                        flexShrink: 0,
                        filter: "brightness(0) invert(1)",
                        opacity: 0.8,
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        flexShrink: 0,
                        width: "2.2em",
                        height: "2.2em",
                        borderRadius: "50%",
                        border: `1.5px solid ${branding.accentColor}`,
                      }}
                    />
                  )}

                  {/* Title + body */}
                  <div>
                    <p
                      className="font-serif"
                      style={{
                        fontSize: "0.82em",
                        fontWeight: 700,
                        color: "#FFFFFF",
                        lineHeight: 1.25,
                        marginBottom: "0.3em",
                      }}
                    >
                      {pillar.title}
                    </p>
                    <p
                      style={{
                        fontSize: "0.6em",
                        color: "rgba(255,255,255,0.6)",
                        lineHeight: 1.65,
                      }}
                    >
                      {pillar.body}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main export — layout dispatcher ──────────────────────────────────────────

interface Props {
  slide: ProposalSlide;
  branding: DeckBranding;
}

export function WhyUsSlide({ slide, branding }: Props) {
  switch (slide.layoutKey as WhyUsLayoutKey) {
    case "editorial-cards":
      return <EditorialCardsLayout slide={slide} branding={branding} />;
    case "stacked-list":
      return <StackedListLayout slide={slide} branding={branding} />;
    case "testimonials-split":
      return <TestimonialsSplitLayout slide={slide} branding={branding} />;
    case "pillars-grid":
    default:
      return <PillarsGridLayout slide={slide} branding={branding} />;
  }
}
