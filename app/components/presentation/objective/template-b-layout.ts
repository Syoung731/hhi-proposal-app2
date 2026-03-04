export const TEMPLATE_B_LAYOUT = {
  canvas: {
    w: 1200,
    h: 675,
  },
  paddingX: 96, // left/right padding inside canvas
  paddingTop: 56,
  paddingBottom: 56,

  headline: {
    fontSize: 52, // desktop target in the 1200x675 preview
    lineHeight: 1.05,
    marginBottom: 16,
    maxWidth: 980,
  },

  underline: {
    height: 2,
    widthPct: 0.8,
    marginBottom: 36,
  },

  statement: {
    fontSize: 32,
    lineHeight: 1.25,
    maxWidthPct: 0.76,
    clampLines: 3,
    marginBottom: 44,
  },

  pillars: {
    rowTopGap: 0, // keep row tight to statement via statement.marginBottom
    colGap: 56,
    titleFontSize: 28,
    titleLineHeight: 1.15,
    bodyFontSize: 18,
    bodyLineHeight: 1.45,
    bodyClampLines: 4,
    dividerWidth: 2,
    dividerInsetTop: 0, // divider starts at top of pillar row
    dividerInsetBottom: 0,
  },
} as const;

