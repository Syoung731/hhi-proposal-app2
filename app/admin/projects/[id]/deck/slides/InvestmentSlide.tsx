"use client";

import type {
  ProposalSlide,
  DeckBranding,
  InvestmentContent,
  InvestmentLineItem,
} from "@/app/lib/deck/types";
import { TitleAccentRule } from "./shared/TitleAccentRule";

interface Props {
  slide: ProposalSlide;
  branding: DeckBranding;
  hasAiBackground?: boolean;
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

/** Returns the display-ready low value: uses override when isOverride=true. */
function effectiveLow(item: InvestmentLineItem): number | null {
  return item.isOverride ? (item.overrideLow ?? null) : (item.rangeLow ?? null);
}

/** Returns the display-ready high value: uses override when isOverride=true. */
function effectiveHigh(item: InvestmentLineItem): number | null {
  return item.isOverride ? (item.overrideHigh ?? null) : (item.rangeHigh ?? null);
}

function sumRange(
  items: InvestmentLineItem[],
  which: "low" | "high"
): number {
  return items.reduce((acc, item) => {
    const v = which === "low" ? effectiveLow(item) : effectiveHigh(item);
    return acc + (v ?? 0);
  }, 0);
}

// ─── table-callout layout ────────────────────────────────────────────────────
// Matches the Tierra Schaffer / Oyster Bay "Projected Investment" slides:
// White/off-white bg, serif title + orange underline, bordered table,
// retainer callout box, large bold total line in accent color, footer.
function TableCalloutLayout({ slide, branding, hasAiBackground }: Props) {
  const content = (slide.content ?? {}) as InvestmentContent;
  const items = content.lineItems ?? [];
  const totalLow = sumRange(items, "low");
  const totalHigh = sumRange(items, "high");

  return (
    <div
      className="relative w-full h-full flex flex-col"
      style={{
        background: hasAiBackground ? "transparent" : "#FAFAF8",
        padding: "6% 7% 5% 7%",
      }}
    >
      {/* Heading */}
      <div className="flex-shrink-0" style={{ marginBottom: "3%" }}>
        {slide.subheadline && (
          <p
            className="uppercase tracking-widest"
            style={{
              fontSize: "0.65em",
              fontWeight: 600,
              letterSpacing: "0.13em",
              color: branding.accentColor,
              marginBottom: "0.35em",
            }}
          >
            {slide.subheadline}
          </p>
        )}
        <h1
          className="font-serif"
          style={{
            fontSize: "2.8em",
            fontWeight: 700,
            color: branding.textColor,
          }}
        >
          {slide.headline || "Projected Investment"}
        </h1>
        <TitleAccentRule accentColor={branding.accentColor} />
      </div>

      {/* Empty state placeholder */}
      {items.length === 0 && (
        <div
          className="flex-shrink-0"
          style={{
            border: "1px dashed #D1D5DB",
            borderRadius: 4,
            padding: "4% 5%",
            textAlign: "center",
            marginBottom: "3%",
          }}
        >
          <p style={{ fontSize: "0.72em", color: "#9CA3AF", fontStyle: "italic", lineHeight: 1.5 }}>
            Add investment line items in the Investment tab to populate this slide.
          </p>
        </div>
      )}

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
                {formatRange(effectiveLow(item), effectiveHigh(item))}
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
          {(content.retainerDescription || content.disclaimer) && (
            <p style={{ fontSize: "0.62em", color: "#6B7280", marginTop: "0.3em" }}>
              {content.retainerDescription || content.disclaimer}
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

export function InvestmentSlide({ slide, branding, hasAiBackground }: Props) {
  switch (slide.layoutKey) {
    case "table-callout":
    default:
      return <TableCalloutLayout slide={slide} branding={branding} hasAiBackground={hasAiBackground} />;
  }
}
