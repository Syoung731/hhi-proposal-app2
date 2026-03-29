"use client";

import type {
  ProposalSlide,
  DeckBranding,
  InvestmentContent,
  InvestmentLineItem,
} from "@/app/lib/deck/types";

interface Props {
  slide: ProposalSlide;
  branding: DeckBranding;
}

function formatRange(low?: number | null, high?: number | null): string {
  if (!low && !high) return "—";
  const fmt = (n: number) =>
    "$" +
    (n >= 1000
      ? (n / 1000).toFixed(0) + "k"
      : n.toLocaleString());
  if (low && high && low !== high) return `${fmt(low)} – ${fmt(high)}`;
  if (low) return fmt(low);
  if (high) return fmt(high);
  return "—";
}

function sumRange(
  items: InvestmentLineItem[],
  key: "rangeLow" | "rangeHigh"
): number {
  return items.reduce((acc, item) => acc + (item[key] ?? 0), 0);
}

// ─── table-callout layout ────────────────────────────────────────────────────
// Matches the Tierra Schaffer / Oyster Bay "Projected Investment" slides:
// White/off-white bg, serif title + orange underline, bordered table,
// retainer callout box, large bold total line in accent color, footer.
function TableCalloutLayout({ slide, branding }: Props) {
  const content = (slide.content ?? {}) as InvestmentContent;
  const items = content.lineItems ?? [];
  const totalLow = sumRange(items, "rangeLow");
  const totalHigh = sumRange(items, "rangeHigh");

  return (
    <div
      className="relative w-full h-full flex flex-col"
      style={{
        background: "#FAFAF8",
        padding: "6% 7% 5% 7%",
      }}
    >
      {/* Heading */}
      <div className="flex-shrink-0" style={{ marginBottom: "3%" }}>
        <h1
          className="font-serif"
          style={{
            fontSize: "2em",
            fontWeight: 700,
            color: branding.textColor,
            marginBottom: "0.35em",
          }}
        >
          {slide.headline || "Projected Investment"}
        </h1>
        {/* Accent underline */}
        <div
          style={{
            height: 2,
            width: "8em",
            background: branding.accentColor,
          }}
        />
      </div>

      {/* Table */}
      {items.length > 0 && (
        <div
          className="flex-shrink-0"
          style={{
            border: "1px solid #D1D5DB",
            borderRadius: 2,
            overflow: "hidden",
            marginBottom: "3%",
          }}
        >
          {/* Table header */}
          <div
            className="flex"
            style={{
              background: branding.textColor,
              padding: "0.55em 0.9em",
            }}
          >
            <span
              className="flex-1 font-bold"
              style={{ fontSize: "0.72em", color: "#fff", letterSpacing: "0.03em" }}
            >
              Space to Renovate
            </span>
            <span
              className="font-bold"
              style={{
                fontSize: "0.72em",
                color: "#fff",
                letterSpacing: "0.03em",
                minWidth: "30%",
                textAlign: "right",
              }}
            >
              Range
            </span>
          </div>

          {/* Table rows */}
          {items.map((item, i) => (
            <div
              key={item.id}
              className="flex"
              style={{
                padding: "0.5em 0.9em",
                background: i % 2 === 0 ? "#fff" : "#F9FAFB",
                borderTop: "1px solid #E5E7EB",
              }}
            >
              <span
                className="flex-1"
                style={{ fontSize: "0.78em", color: branding.textColor }}
              >
                {item.label}
              </span>
              <span
                style={{
                  fontSize: "0.78em",
                  color: branding.textColor,
                  minWidth: "30%",
                  textAlign: "right",
                }}
              >
                {formatRange(item.rangeLow, item.rangeHigh)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Retainer callout box */}
      {content.retainerLabel && content.retainerAmount != null && (
        <div
          className="flex-shrink-0"
          style={{
            border: `1px solid ${branding.accentColor}`,
            borderRadius: 2,
            padding: "0.6em 0.9em",
            marginBottom: "2.5%",
          }}
        >
          <p style={{ fontSize: "0.75em", color: branding.textColor }}>
            <strong>{content.retainerLabel}:</strong>{" "}
            {formatRange(content.retainerAmount, null).replace("–", "")}
          </p>
          {content.disclaimer && (
            <p style={{ fontSize: "0.62em", color: "#6B7280", marginTop: "0.3em" }}>
              {content.disclaimer}
            </p>
          )}
        </div>
      )}

      {/* Total line */}
      {items.length > 0 && (
        <div className="flex-shrink-0" style={{ marginBottom: "1.5%" }}>
          <p
            className="font-bold font-serif"
            style={{ fontSize: "1.35em", color: branding.textColor }}
          >
            Total Cost of Project Execution Range:{" "}
            <span style={{ color: branding.accentColor }}>
              {formatRange(totalLow, totalHigh)}
            </span>
          </p>
        </div>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Footer */}
      <div
        className="flex-shrink-0 flex items-center justify-between"
        style={{
          borderTop: `1px solid #E5E7EB`,
          paddingTop: "1.5%",
        }}
      >
        <span style={{ fontSize: "0.6em", color: "#9CA3AF" }}>
          {content.address ?? branding.address ?? ""}
        </span>
      </div>
    </div>
  );
}

// ─── Router ──────────────────────────────────────────────────────────────────

export function InvestmentSlide({ slide, branding }: Props) {
  switch (slide.layoutKey) {
    case "table-callout":
    default:
      return <TableCalloutLayout slide={slide} branding={branding} />;
  }
}
