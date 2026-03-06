import type { WhyUsPageConfig, WhyUsPillar } from "@/app/lib/layout-config";
import type { CSSProperties } from "react";
import {
  GRID_CARDS_DEFAULT_CARD_BG,
  GRID_CARDS_DEFAULT_CARD_BORDER,
  sanitizeHexColor,
  STACKED_DEFAULT_CARD_BG,
  STACKED_DEFAULT_UNDERLINE_COLOR,
  COLUMNS_DEFAULT_UNDERLINE_COLOR,
  COLUMNS_DEFAULT_TEXT_COLOR,
} from "@/app/lib/layout-config";
import { EditorialSectionHeading } from "@/components/public/blocks";

const DEFAULT_WHY_US_TITLE = "Why Us";

const COLUMNS_SERIF_STACK =
  'ui-serif, Georgia, Cambria, "Times New Roman", Times, serif';

const DEFAULT_VISIBLE_PILLARS: readonly boolean[] = [
  true,
  true,
  true,
  false,
];

function getSharedWhyUsStyle(config?: WhyUsPageConfig | null): {
  headlineSizePx?: number;
  bodySizePx?: number;
  iconScale?: number;
  heroHeadlineScale?: number;
  heroStatementSpacingPx?: number;
  simpleHeadlineSizePx?: number;
  simpleBodySizePx?: number;
  simpleDotSizePx?: number;
  simpleRowGapPx?: number;
  simpleIconSizePx?: number;
  simpleShowIcons?: boolean;
  simpleCenterTitle?: boolean;
} {
  const s = config?.style;

  const headlineSizePx =
    typeof s?.headlineSizePx === "number" &&
    Number.isFinite(s.headlineSizePx) &&
    !Number.isNaN(s.headlineSizePx)
      ? s.headlineSizePx
      : undefined;

  const bodySizePx =
    typeof s?.bodySizePx === "number" &&
    Number.isFinite(s.bodySizePx) &&
    !Number.isNaN(s.bodySizePx)
      ? s.bodySizePx
      : undefined;

  const iconScale =
    typeof s?.iconScale === "number" &&
    Number.isFinite(s.iconScale) &&
    !Number.isNaN(s.iconScale)
      ? s.iconScale
      : undefined;

  const heroHeadlineScale =
    typeof s?.heroHeadlineScale === "number" &&
    Number.isFinite(s.heroHeadlineScale) &&
    !Number.isNaN(s.heroHeadlineScale)
      ? s.heroHeadlineScale
      : undefined;

  const heroStatementSpacingPx =
    typeof s?.heroStatementSpacingPx === "number" &&
    Number.isFinite(s.heroStatementSpacingPx) &&
    !Number.isNaN(s.heroStatementSpacingPx)
      ? s.heroStatementSpacingPx
      : undefined;
  const simpleHeadlineSizePx =
    typeof s?.simpleHeadlineSizePx === "number" &&
    Number.isFinite(s.simpleHeadlineSizePx) &&
    !Number.isNaN(s.simpleHeadlineSizePx)
      ? s.simpleHeadlineSizePx
      : undefined;
  const simpleBodySizePx =
    typeof s?.simpleBodySizePx === "number" &&
    Number.isFinite(s.simpleBodySizePx) &&
    !Number.isNaN(s.simpleBodySizePx)
      ? s.simpleBodySizePx
      : undefined;
  const simpleDotSizePx =
    typeof s?.simpleDotSizePx === "number" &&
    Number.isFinite(s.simpleDotSizePx) &&
    !Number.isNaN(s.simpleDotSizePx)
      ? s.simpleDotSizePx
      : undefined;
  const simpleRowGapPx =
    typeof s?.simpleRowGapPx === "number" &&
    Number.isFinite(s.simpleRowGapPx) &&
    !Number.isNaN(s.simpleRowGapPx)
      ? s.simpleRowGapPx
      : undefined;
  const simpleIconSizePx =
    typeof s?.simpleIconSizePx === "number" &&
    Number.isFinite(s.simpleIconSizePx) &&
    !Number.isNaN(s.simpleIconSizePx)
      ? s.simpleIconSizePx
      : undefined;
  const simpleShowIcons =
    typeof s?.simpleShowIcons === "boolean" ? s.simpleShowIcons : undefined;
  const simpleCenterTitle =
    typeof s?.simpleCenterTitle === "boolean" ? s.simpleCenterTitle : undefined;

  return {
    headlineSizePx,
    bodySizePx,
    iconScale,
    heroHeadlineScale,
    heroStatementSpacingPx,
    simpleHeadlineSizePx,
    simpleBodySizePx,
    simpleDotSizePx,
    simpleRowGapPx,
    simpleIconSizePx,
    simpleShowIcons,
    simpleCenterTitle,
  };
}

/** Navy used for gridCards frame and text when no style override. */
const GRID_CARDS_NAVY = "#1E2D3A";
/** Slide height to fit inside 16:9 canvas (675px) minus article padding in preview. */
const GRID_CARDS_SLIDE_H = 643;

export type WhyUsRendererProps = {
  config?: WhyUsPageConfig | null;
  /** Map of brand icon id -> image URL, resolved from the brand icon library. */
  iconUrls?: Map<string, string>;
  /** Live preview only: override body font size (px) for gridCards when overflow is detected. */
  gridCardsBodyFontSizeOverride?: number;
};

type CanonicalVariant = "gridCards" | "stacked" | "columns" | "simple";

function normalizeVariant(raw: string | undefined): CanonicalVariant {
  if (raw === "stacked") return "stacked";
  if (raw === "columns") return "columns";
  if (raw === "simple") return "simple";
  // Legacy "iconRows" maps to stacked rows.
  if (raw === "iconRows") return "stacked";
  return "gridCards";
}

/** Use pillars from config only (max 4). No HHI/default fallback. */
function getPillars(source?: WhyUsPillar[] | null): WhyUsPillar[] {
  return (source ?? []).slice(0, 4);
}

function getVisiblePillars(raw: boolean[] | undefined | null): boolean[] {
  const base = [...DEFAULT_VISIBLE_PILLARS];
  if (Array.isArray(raw)) {
    raw.slice(0, 4).forEach((v, i) => {
      if (typeof v === "boolean") base[i] = v;
    });
  }
  return base;
}

export function WhyUsRenderer({
  config,
  iconUrls,
  gridCardsBodyFontSizeOverride,
}: WhyUsRendererProps) {
  const variant = normalizeVariant(config?.variant);
  const title = (config?.title ?? DEFAULT_WHY_US_TITLE).trim() || DEFAULT_WHY_US_TITLE;
  const pillars = getPillars(config?.pillars);

  if (pillars.length === 0) return null;

  const articleClassName =
    variant === "stacked"
      ? "mx-auto h-[675px] w-full"
      : variant === "columns" || variant === "simple"
      ? "mx-auto flex h-[675px] w-full items-center justify-center"
      : "mx-auto max-w-5xl space-y-12 pt-8 sm:pt-12";

  const section = (
    <>
      {variant === "gridCards" && (
        <WhyUsGridCards
          pillars={pillars}
          iconUrls={iconUrls}
          title={title}
          config={config}
          gridCardsBodyFontSizeOverride={gridCardsBodyFontSizeOverride}
        />
      )}
      {variant === "stacked" && (
        <WhyUsStacked
          pillars={pillars}
          iconUrls={iconUrls}
          title={title}
          config={config}
        />
      )}
      {variant === "columns" && (
        <WhyUsColumns config={config} title={title} pillars={pillars} iconUrls={iconUrls} />
      )}
      {variant === "simple" && (
        <WhyUsSimple pillars={pillars} config={config} title={title} iconUrls={iconUrls} />
      )}
    </>
  );

  return (
    <article className={articleClassName}>
      {section}
    </article>
  );
}

type PillarListProps = {
  pillars: WhyUsPillar[];
  iconUrls?: Map<string, string>;
};

function PillarIcon({
  pillar,
  iconUrls,
  iconScale,
}: {
  pillar: WhyUsPillar;
  iconUrls?: Map<string, string>;
  iconScale?: number;
}) {
  const iconId = pillar.iconKey ?? undefined;
  const url = iconId && iconUrls ? iconUrls.get(iconId) : undefined;
  const scale =
    typeof iconScale === "number" &&
    Number.isFinite(iconScale) &&
    !Number.isNaN(iconScale)
      ? iconScale
      : 1.0;
  if (!iconId || !url) {
    return (
      <div
        className="flex h-12 w-12 items-center justify-center rounded-xl bg-zinc-50 dark:bg-zinc-800"
        style={scale !== 1.0 ? { transform: `scale(${scale})`, transformOrigin: "center" } : undefined}
      />
    );
  }
  return (
    <div
      className="flex h-12 w-12 items-center justify-center rounded-xl bg-zinc-50 dark:bg-zinc-800"
      style={scale !== 1.0 ? { transform: `scale(${scale})`, transformOrigin: "center" } : undefined}
    >
      <img
        src={url}
        alt=""
        className="h-8 w-8 object-contain"
      />
    </div>
  );
}

function ColumnsIcon({
  pillar,
  iconUrls,
  size,
}: {
  pillar: WhyUsPillar;
  iconUrls?: Map<string, string>;
  size: number;
}) {
  const iconId = pillar.iconKey ?? undefined;
  const url = iconId && iconUrls ? iconUrls.get(iconId) : undefined;

  if (!iconId || !url) {
    return (
      <div
        style={{
          width: size,
          height: size,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="#D4D4D8"
          strokeWidth={1.5}
          aria-hidden
          style={{ display: "block" }}
        >
          <rect x="4" y="4" width="16" height="16" rx="2" />
          <path d="M8 12h8" strokeLinecap="round" />
        </svg>
      </div>
    );
  }

  return (
    <div
      style={{
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <img
        src={url}
        alt=""
        style={{ width: size, height: size, objectFit: "contain", display: "block" }}
      />
    </div>
  );
}

/** Line-style icon for gridCards only; 56–64px to fit 16:9 slide. */
function GridCardIcon({
  pillar,
  iconUrls,
  iconScale,
}: {
  pillar: WhyUsPillar;
  iconUrls?: Map<string, string>;
  iconScale?: number;
}) {
  const iconId = pillar.iconKey ?? undefined;
  const url = iconId && iconUrls ? iconUrls.get(iconId) : undefined;
  const boxSize = "h-28 w-28 flex-shrink-0"; /* 112px */
  const scale =
    typeof iconScale === "number" &&
    Number.isFinite(iconScale) &&
    !Number.isNaN(iconScale)
      ? iconScale
      : 1.0;
  if (!iconId || !url) {
    return (
      <div
        className={`${boxSize} flex items-center justify-center`}
        style={{
          color: GRID_CARDS_NAVY,
          transform: scale !== 1.0 ? `scale(${scale})` : undefined,
          transformOrigin: "center",
        }}
        aria-hidden
      >
        <svg
          className="h-10 w-10"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.25}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z"
          />
        </svg>
      </div>
    );
  }
  return (
    <div
      className={`${boxSize} flex items-center justify-center`}
      style={
        scale !== 1.0
          ? {
              transform: `scale(${scale})`,
              transformOrigin: "center",
            }
          : undefined
      }
    >
      <img src={url} alt="" className="h-full w-full object-contain" />
    </div>
  );
}

type GridCardsProps = PillarListProps & {
  title: string;
  config?: WhyUsPageConfig | null;
  gridCardsBodyFontSizeOverride?: number;
};

function WhyUsGridCards({
  pillars,
  iconUrls,
  title,
  config,
  gridCardsBodyFontSizeOverride,
}: GridCardsProps) {
  const shared = getSharedWhyUsStyle(config);
  const cardBg = sanitizeHexColor(
    config?.gridCardsStyle?.cardBg,
    GRID_CARDS_DEFAULT_CARD_BG
  );
  const cardBorder = sanitizeHexColor(
    config?.gridCardsStyle?.cardBorder,
    GRID_CARDS_DEFAULT_CARD_BORDER
  );
  const defaultBodyFontSize = shared.bodySizePx ?? 20;
  const bodyFontSize = gridCardsBodyFontSizeOverride ?? defaultBodyFontSize;
  const cardHeadlinePx = shared.headlineSizePx ?? 25;
  const iconScale = shared.iconScale ?? 1.0;

  return (
    <div
      className="relative flex w-full flex-col rounded-lg"
      style={{
        height: GRID_CARDS_SLIDE_H,
        padding: "40px 48px",
        border: `3px solid ${cardBorder}`,
        background:
          "linear-gradient(180deg, #F6F6F4 0%, #FFFFFF 50%, #F8F8F6 100%)",
        boxShadow: "inset 0 0 120px -24px rgba(0,0,0,0.04)",
      }}
    >
      <div className="flex-none max-h-[88px] mb-6 flex items-center justify-center">
        <h2
          className="text-center font-medium leading-tight tracking-tight"
          style={{
            color: cardBorder,
            fontSize: "44px",
            lineHeight: 1.15,
          }}
        >
          {title}
        </h2>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-2 grid-rows-2 gap-6">
        {pillars.map((pillar, index) => {
          const headline = pillar.headline ?? "";
          const body = pillar.body ?? "";
          if (!headline && !body) return null;
          return (
            <div
              key={index}
              className="flex min-h-0 flex-col items-center justify-center rounded-lg p-6 pt-5 text-center"
              style={{
                border: `2px solid ${cardBorder}`,
                backgroundColor: cardBg,
                boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
              }}
            >
              <div className="mb-1 flex shrink-0 justify-center">
                <GridCardIcon pillar={pillar} iconUrls={iconUrls} iconScale={iconScale} />
              </div>
              <h3
                className="line-clamp-2 min-h-0 shrink-0 font-semibold tracking-tight"
                style={{
                  color: cardBorder,
                  fontSize: `${cardHeadlinePx}px`,
                  lineHeight: 1.2,
                }}
              >
                {headline}
              </h3>
              {body && (
                <p
                  className="mt-1 max-w-[420px] min-h-0 shrink-0 line-clamp-3 text-center"
                  style={{
                    fontSize: `${bodyFontSize}px`,
                    lineHeight: 1.4,
                    color: "#374151",
                  }}
                  data-why-us-card-body
                >
                  {body}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Icon for stacked value bars in stacked layout. */
function StackedBarIcon({
  pillar,
  iconUrls,
  iconScale,
}: {
  pillar: WhyUsPillar;
  iconUrls?: Map<string, string>;
  iconScale?: number;
}) {
  const BASE_ICON_PX = 72;
  const MAX_ICON_PX = 144;
  const iconId = pillar.iconKey ?? undefined;
  const url = iconId && iconUrls ? iconUrls.get(iconId) : undefined;

  const scaleValue =
    typeof iconScale === "number" &&
    Number.isFinite(iconScale) &&
    !Number.isNaN(iconScale)
      ? iconScale
      : 1.0;

  const iconPx = Math.min(
    MAX_ICON_PX,
    Math.round(BASE_ICON_PX * scaleValue)
  );

  const wrapperStyle: CSSProperties = {
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: iconPx,
    height: iconPx,
    maxWidth: MAX_ICON_PX,
    maxHeight: MAX_ICON_PX,
  };

  const imgStyle: CSSProperties = {
    width: iconPx,
    height: iconPx,
    objectFit: "contain",
    display: "block",
  };

  if (!iconId || !url) {
    return (
      <div
        style={{
          ...wrapperStyle,
        }}
        aria-hidden
      >
        <svg
          width={iconPx}
          height={iconPx}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.25}
          style={{ display: "block" }}
          className="text-zinc-400"
        >
          <rect x="4" y="4" width="16" height="16" rx="2" />
          <circle cx="12" cy="12" r="2.5" />
        </svg>
      </div>
    );
  }

  return (
    <div
      style={{
        ...wrapperStyle,
      }}
    >
      <img
        src={url}
        alt=""
        width={iconPx}
        height={iconPx}
        style={imgStyle}
      />
    </div>
  );
}

type WhyUsStackedProps = PillarListProps & {
  title: string;
  config?: WhyUsPageConfig | null;
};

function WhyUsStacked({ pillars, iconUrls, title, config }: WhyUsStackedProps) {
  const shared = getSharedWhyUsStyle(config);
  const cardBg = sanitizeHexColor(
    config?.stackedStyle?.cardBg,
    STACKED_DEFAULT_CARD_BG
  );
  const underlineColor = sanitizeHexColor(
    config?.stackedStyle?.underlineColor,
    STACKED_DEFAULT_UNDERLINE_COLOR
  );
  const accentColor = sanitizeHexColor(
    config?.stackedStyle?.accentColor ?? config?.stackedStyle?.underlineColor,
    STACKED_DEFAULT_UNDERLINE_COLOR
  );
  const isFourPillars = pillars.length === 4;

  // 1200×675 canvas math for strict 5-band layout: header + 4 equal rows.
  const canvasH = 675;
  const padY = 36;
  const headerH = 96;
  const gap = 14;
  const rowH = Math.floor(
    (canvasH - 2 * padY - headerH - 4 * gap) / 4
  ); // = 112 with the numbers above.

  const titleSize = isFourPillars ? "36px" : "40px";

  const rowHeadlinePx = shared.headlineSizePx ?? 30;
  const rowBodyPx = shared.bodySizePx ?? 22;
  const iconScale = shared.iconScale ?? 1.0;

  return (
    <div
      className="flex w-full flex-col bg-white"
      style={{
        height: `${canvasH}px`,
        paddingTop: padY,
        paddingBottom: padY,
        background:
          "linear-gradient(180deg, rgba(0,0,0,0.02) 0%, transparent 120px)",
      }}
    >
      <div className="mx-auto flex h-full w-full max-w-[980px] px-12">
        <div
          className="grid h-full w-full"
          style={{
            gridTemplateRows: `${headerH}px repeat(4, ${rowH}px)`,
            rowGap: `${gap}px`,
          }}
        >
          {/* Header band */}
          <header className="relative z-10 flex flex-col justify-center">
            <h2
              className="text-left font-extrabold tracking-tight text-slate-900"
              style={{ fontSize: titleSize, lineHeight: 1.0 }}
            >
              {title}
            </h2>
            <div
              className="mt-2 h-[2px] w-full max-w-[90%] rounded-full"
              style={{ backgroundColor: underlineColor }}
              aria-hidden
            />
          </header>

          {/* Four equal-height row bands */}
          {pillars.map((pillar, index) => {
            const headline = pillar.headline ?? "";
            const body = pillar.body ?? "";
            if (!headline && !body) return null;
            return (
              <div key={index} className="flex h-full items-center">
                <div
                  className="flex h-full w-full items-center gap-5 overflow-hidden rounded-xl border border-zinc-200 px-6 py-2 shadow-sm"
                  style={{ backgroundColor: cardBg }}
                >
                  <div className="flex-shrink-0">
                    <StackedBarIcon pillar={pillar} iconUrls={iconUrls} iconScale={iconScale} />
                  </div>
                  <div
                    className="h-[70%] w-[1px] rounded-full"
                    style={{ backgroundColor: accentColor }}
                    aria-hidden
                  />
                  <div
                    className="min-w-0 flex-1"
                    style={{ paddingLeft: "16px" }}
                  >
                    <h3
                      className="text-[28px] font-bold leading-tight tracking-tight text-zinc-900 line-clamp-2"
                      style={{ fontSize: `${rowHeadlinePx}px` }}
                    >
                      {headline}
                    </h3>
                    {body && (
                      <p
                        className="mt-1 line-clamp-2 text-[20px] leading-snug text-zinc-700"
                        style={{ fontSize: `${rowBodyPx}px` }}
                      >
                        {body}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function WhyUsColumns({
  config,
  title,
  pillars,
  iconUrls,
}: {
  config?: WhyUsPageConfig | null;
  title: string;
  pillars: WhyUsPillar[];
  iconUrls?: Map<string, string>;
}) {
  const visibleFlags = getVisiblePillars(config?.visiblePillars);
  const candidates = pillars.map((pillar, index) => ({
    pillar,
    index,
    hasContent:
      (pillar.headline ?? "").trim() !== "" ||
      (pillar.body ?? "").trim() !== "" ||
      (pillar.iconKey ?? "") !== "",
  }));

  let selected = candidates.filter(
    (item, idx) => visibleFlags[idx] && item.hasContent
  );

  if (selected.length < 1) {
    selected = candidates.filter((item) => item.hasContent).slice(0, 3);
  }

  if (selected.length < 1) return null;

  const useTwoByTwo = selected.length === 4;

  const underlineColor = sanitizeHexColor(
    config?.columnsStyle?.underlineColor,
    COLUMNS_DEFAULT_UNDERLINE_COLOR
  );
  const textColor = sanitizeHexColor(
    config?.columnsStyle?.textColor,
    COLUMNS_DEFAULT_TEXT_COLOR
  );

  const shared = getSharedWhyUsStyle(config);

  const headlinePx = (() => {
    if (
      typeof shared.headlineSizePx === "number" &&
      Number.isFinite(shared.headlineSizePx) &&
      !Number.isNaN(shared.headlineSizePx)
    ) {
      return shared.headlineSizePx;
    }
    const raw = config?.columnsStyle?.headlineSize ?? "34px";
    const n = parseInt(raw, 10);
    if (!Number.isFinite(n) || Number.isNaN(n)) return 34;
    return n;
  })();

  const bodyPx = (() => {
    if (
      typeof shared.bodySizePx === "number" &&
      Number.isFinite(shared.bodySizePx) &&
      !Number.isNaN(shared.bodySizePx)
    ) {
      return shared.bodySizePx;
    }
    const raw = config?.columnsStyle?.bodySize ?? "20px";
    const n = parseInt(raw, 10);
    if (!Number.isFinite(n) || Number.isNaN(n)) return 20;
    return n;
  })();

  const iconScale = (() => {
    if (
      typeof shared.iconScale === "number" &&
      Number.isFinite(shared.iconScale) &&
      !Number.isNaN(shared.iconScale)
    ) {
      return shared.iconScale;
    }
    const raw = config?.columnsStyle?.iconScale;
    if (typeof raw !== "number" || !Number.isFinite(raw) || Number.isNaN(raw))
      return 1.0;
    return raw;
  })();

  const BASE_ICON_PX = 64;
  const iconPx = Math.round(BASE_ICON_PX * iconScale);

  return (
    <div
      className="flex w-full flex-col bg-white"
      style={{
        height: 675,
        paddingTop: 44,
        paddingBottom: 36,
      }}
    >
          <div className="mx-auto flex h-full w-full max-w-[1040px] flex-col px-16">
        <header className="mb-7">
          <h2
            className="font-semibold tracking-tight text-zinc-900"
            style={{
              fontFamily: COLUMNS_SERIF_STACK,
              fontSize: 56,
              lineHeight: 1.05,
              fontWeight: 600,
            }}
          >
            {title}
          </h2>
          <div
            className="mt-3 h-1 max-w-[95%] rounded-full"
            style={{ backgroundColor: underlineColor }}
            aria-hidden
          />
        </header>

        <div className="mt-8 flex-1">
          <div
            className={`grid h-full gap-y-10 gap-x-16 ${
              useTwoByTwo ? "grid-cols-2" : "grid-cols-3"
            }`}
          >
            {selected.map(({ pillar }, index) => {
              const headline = (pillar.headline ?? "").trim();
              const body = (pillar.body ?? "").trim();
              if (!headline && !body) return null;
              return (
                <div key={index} className="flex h-full items-center justify-center">
                  <div
                    className="flex w-full flex-col items-center text-center"
                    style={{ maxWidth: 280, margin: "0 auto" }}
                  >
                    <div className="mb-[18px] flex items-center justify-center">
                      <ColumnsIcon pillar={pillar} iconUrls={iconUrls} size={iconPx} />
                    </div>
                    <h3
                      className="line-clamp-3 font-semibold tracking-tight"
                      style={{
                        fontFamily: COLUMNS_SERIF_STACK,
                        fontSize: `${headlinePx}px`,
                        lineHeight: 1.12,
                        fontWeight: 700,
                        color: textColor,
                      }}
                    >
                      {headline}
                    </h3>
                    {body && (
                      <p
                        className="mt-[14px] line-clamp-6"
                        style={{
                          fontSize: `${bodyPx}px`,
                          lineHeight: 1.35,
                          color: textColor,
                        }}
                      >
                        {body}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function WhyUsSimple({
  pillars,
  config,
  title,
  iconUrls,
}: {
  pillars: WhyUsPillar[];
  config?: WhyUsPageConfig | null;
  title: string;
  iconUrls?: Map<string, string>;
}) {
  const shared = getSharedWhyUsStyle(config);
  const underlineColor = sanitizeHexColor(
    config?.stackedStyle?.underlineColor,
    STACKED_DEFAULT_UNDERLINE_COLOR
  );
  const textColor = sanitizeHexColor(
    config?.columnsStyle?.textColor,
    COLUMNS_DEFAULT_TEXT_COLOR
  );
  const accentColor = sanitizeHexColor(
    config?.stackedStyle?.accentColor ?? config?.stackedStyle?.underlineColor,
    STACKED_DEFAULT_UNDERLINE_COLOR
  );
  const dotColor = sanitizeHexColor(
    config?.simpleStyle?.dotColor,
    accentColor
  );

  const visible = pillars.filter((p) => {
    const h = (p.headline ?? "").trim();
    const b = (p.body ?? "").trim();
    return h !== "" || b !== "";
  });

  if (visible.length === 0) return null;

  const timelineHeadlinePx = (() => {
    const raw = shared.simpleHeadlineSizePx;
    if (typeof raw === "number" && Number.isFinite(raw) && !Number.isNaN(raw)) {
      return Math.min(44, Math.max(24, raw));
    }
    return 32;
  })();

  const timelineBodyPx = (() => {
    const raw = shared.simpleBodySizePx;
    if (typeof raw === "number" && Number.isFinite(raw) && !Number.isNaN(raw)) {
      return Math.min(28, Math.max(16, raw));
    }
    return 20;
  })();

  const dotSizePx = (() => {
    const raw = shared.simpleDotSizePx;
    if (typeof raw === "number" && Number.isFinite(raw) && !Number.isNaN(raw)) {
      return Math.min(18, Math.max(8, raw));
    }
    return 12;
  })();

  const rowGapPx = (() => {
    const raw = shared.simpleRowGapPx;
    if (typeof raw === "number" && Number.isFinite(raw) && !Number.isNaN(raw)) {
      return Math.min(40, Math.max(12, raw));
    }
    return 24;
  })();

  const baseIconPx = (() => {
    const raw = config?.simpleStyle?.iconBasePx;
    if (typeof raw === "number" && Number.isFinite(raw) && !Number.isNaN(raw)) {
      return Math.max(24, raw);
    }
    return 72;
  })();

  const iconScale = (() => {
    const raw = config?.simpleStyle?.iconScale;
    if (typeof raw === "number" && Number.isFinite(raw) && !Number.isNaN(raw)) {
      const clamped = Math.min(2.0, Math.max(0.8, raw));
      return clamped;
    }
    return 1.0;
  })();

  const iconPx = Math.round(baseIconPx * iconScale);

  const showIcons = shared.simpleShowIcons ?? true;
  const centerTitle = shared.simpleCenterTitle ?? false;
  const footerText = (config?.simpleFooterText ?? "").trim();

  const headerAlignClass = centerTitle ? "items-center text-center" : "items-start text-left";
  const headerJustifyClass = centerTitle ? "mx-auto" : "mx-0";

  return (
    <div
      className="flex h-[675px] w-full flex-col items-center justify-center bg-white"
      style={{
        paddingTop: 36,
        paddingBottom: 36,
      }}
    >
      <div className="flex h-full w-full max-w-[980px] flex-col px-12">
        <header className={`flex flex-col ${headerAlignClass}`}>
          <h2
            className="font-semibold tracking-tight text-zinc-900"
            style={{
              fontSize: 44,
              lineHeight: 1.1,
            }}
          >
            {title}
          </h2>
          <div
            className={`mt-3 h-[2px] w-full max-w-[420px] rounded-full ${headerJustifyClass}`}
            style={{ backgroundColor: underlineColor }}
            aria-hidden
          />
        </header>

        <div className="mt-8 flex-1">
          <div
            className="relative h-full"
            style={{
              paddingLeft: 32,
            }}
          >
            <div
              className="pointer-events-none absolute left-[8px] top-0 h-full w-[2px] rounded-full"
              style={{ backgroundColor: accentColor }}
              aria-hidden
            />
            <div
              className="relative grid h-full"
              style={{
                rowGap: `${rowGapPx}px`,
                gridTemplateRows: `repeat(${visible.length}, 1fr)`,
              }}
            >
              {visible.map((pillar, index) => {
                const headline = (pillar.headline ?? "").trim();
                const body = (pillar.body ?? "").trim();
                const iconId = pillar.iconKey ?? undefined;
                const iconUrl =
                  iconId && iconUrls && iconUrls.size > 0 ? iconUrls.get(iconId) : undefined;

                return (
                  <div
                    key={index}
                    className="flex items-start"
                    style={{
                      columnGap: 18,
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        style={{
                          width: dotSizePx,
                          height: dotSizePx,
                          borderRadius: "9999px",
                          backgroundColor: dotColor,
                          flexShrink: 0,
                        }}
                      />
                      {showIcons && iconUrl && (
                        <div
                          style={{
                            width: iconPx,
                            height: iconPx,
                            flexShrink: 0,
                          }}
                        >
                          <img
                            src={iconUrl}
                            alt=""
                            style={{
                              width: iconPx,
                              height: iconPx,
                              objectFit: "contain",
                              display: "block",
                            }}
                          />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      {headline && (
                        <h3
                          className="font-bold leading-tight tracking-tight text-zinc-900 line-clamp-2"
                          style={{
                            fontSize: timelineHeadlinePx,
                            lineHeight: 1.15,
                            color: textColor,
                          }}
                        >
                          {headline}
                        </h3>
                      )}
                      {body && (
                        <p
                          className="mt-2 line-clamp-3"
                          style={{
                            fontSize: timelineBodyPx,
                            lineHeight: 1.45,
                            color: textColor,
                          }}
                        >
                          {body}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {footerText && (
          <div className="mt-4 text-xs text-zinc-500">
            {footerText}
          </div>
        )}
      </div>
    </div>
  );
}

