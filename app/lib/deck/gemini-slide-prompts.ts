/**
 * Prompt builder for AI-generated slide backgrounds.
 * Given a slide type and optional style preset, returns a text prompt for
 * Gemini image generation that produces an abstract texture or graphic
 * background sized for a 16:9 presentation slide.
 *
 * Rules:
 * - No text, no numbers, no labels, no watermarks in the output image.
 * - No faces, no identifiable people.
 * - Abstract background textures only — NOT room photos, NOT interior design
 *   photography, NOT architectural photography.
 * - Output must be suitable as a full-bleed slide background (16:9, 1920×1080).
 */

import type { SlideType } from "./types";

// ─── Abstract no-photo guardrail added to every prompt ────────────────────────

const NO_PHOTO_GUARDRAIL =
  "Abstract background texture only. NOT a room photo. NOT interior design photography. NOT architectural photography. No furniture, no fixtures, no people, no identifiable objects.";

// ─── Per-type subject descriptions ───────────────────────────────────────────

const SLIDE_SUBJECTS: Record<SlideType, string> = {
  cover:
    "Luxury material texture — brushed metal, marble grain, or linen fabric close-up. Warm tones.",

  objective:
    "Soft watercolor wash blending warm cream into pale gold. Subtle paper grain texture. Abstract, painterly, no objects.",

  "investment-by-space":
    "Clean warm cream paper texture with very subtle horizontal ruled lines. Minimal, financial document feel.",

  "why-us":
    "Subtle grid of four equal zones implied by very faint border lines on warm white. Abstract, clean.",

  "scope-overview":
    "Layered translucent geometric planes in warm neutral tones — ivory, warm gray, and pale sand. Abstract, architectural feel, no objects.",

  "before-after":
    "Abstract two-tone horizontal split. Left half cool stone gray texture. Right half warm linen texture. Clean seam down the center. No objects.",

  "scope-breakdown":
    "Fine dot-grid pattern on warm off-white. Very subtle, minimal, professional. No objects.",

  "our-process":
    "Soft horizontal gradient wash, warm cream to light gray. No objects, no rooms.",

  "core-values":
    "Warm linen parchment texture with very faint geometric lattice pattern. Elegant, minimal, no objects.",

  timeline:
    "Soft vertical gradient wash, warm cream transitioning to pale sand. Subtle paper grain. No objects, no rooms.",

  cope:
    "Warm off-white surface with very faint blueprint grid lines. Construction document feel, minimal, no objects.",

  "overall-investment":
    "Elegant linen textured background with soft warm lighting, subtle architectural drafting elements at edges. Premium, confident, minimal.",

  "next-steps":
    "Clean warm parchment surface with faint directional lines suggesting forward motion. Minimal, professional, no objects.",

  closing:
    "Dark moody architectural interior with deep navy tones, soft warm light spill from a window. Elegant, quiet, premium closing feel.",

  testimonials:
    "Warm elegant interior with soft natural light, muted warm tones, slightly out of focus. Luxurious residential feel, perfect testimonial backdrop.",

  "design-build":
    "Clean architectural blueprint overlay on warm linen, very subtle technical drawing lines. Professional, structured, design-forward.",

  "addition-overview":
    "Warm linen background with very subtle architectural drafting elements — faint dashed construction lines and light pencil sketches of building additions. Professional, elegant, no objects.",

  "design-experience":
    "Clean warm parchment surface with a faint horizontal progression of light pathway lines suggesting a journey from left to right. Minimal, professional, no objects.",

  "floor-plan":
    "Very faint architectural graph-paper grid on warm white. Extremely subtle, drafting-table feel. No objects, no rooms, no plans.",

  craftsmanship:
    "Macro close-up texture of fine natural wood grain in warm honey tones, softly lit. Abstract material study, no objects, no tools, no rooms.",
};

// ─── Style-preset colour / mood overlays ─────────────────────────────────────

function getStyleModifier(stylePreset: string): string {
  const s = stylePreset.toLowerCase().trim();

  if (s.includes("modern") || s.includes("contemporary")) {
    return "cool whites and concrete-gray tones, crisp and minimalist";
  }
  if (s.includes("traditional") || s.includes("classic")) {
    return "warm amber and cream tones, soft and timeless";
  }
  if (s.includes("transitional")) {
    return "warm neutrals with clean geometric structure";
  }
  if (s.includes("rustic") || s.includes("farmhouse")) {
    return "earthy warm tones — cream, warm tan, and soft brown";
  }
  if (s.includes("luxur") || s.includes("high-end") || s.includes("premium")) {
    return "rich gold and deep charcoal tones, refined and opulent";
  }
  if (s.includes("industrial")) {
    return "cool steel-gray and dark charcoal tones, strong and graphic";
  }
  if (s.includes("coastal") || s.includes("beach")) {
    return "soft sea-blue and warm white tones, light and airy";
  }
  if (s.includes("scandinavian") || s.includes("nordic")) {
    return "pale birch white and light gray tones, calm and minimal";
  }
  if (s.includes("mid-century") || s.includes("mid century")) {
    return "warm walnut and amber tones with clean mid-century geometry";
  }
  // Default: neutral, professional
  return "warm whites and soft warm-gray tones, professional and refined";
}

// ─── Core guardrails appended to every prompt ────────────────────────────────

const GUARDRAILS = [
  "No text of any kind, no numbers, no labels, no logos, no watermarks.",
  "No human faces, no identifiable people, no furniture, no fixtures, no rooms.",
  "Abstract texture or graphic only.",
  "Sized for a 16:9 widescreen presentation background (1920 × 1080).",
  "Output exactly one image.",
].join(" ");

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Build a Gemini text-to-image prompt for a deck slide background.
 *
 * @param slideType  - The ProposalSlide.type value (e.g. "cover", "objective").
 * @param stylePreset - Free-text style preset name from the company's brand settings
 *                      (e.g. "Modern Luxury", "Rustic Farmhouse"). Pass empty string
 *                      for the default neutral style.
 * @returns A single string prompt ready to send to Gemini image generation.
 */
export function buildSlideImagePrompt(
  slideType: SlideType,
  stylePreset: string
): string {
  const subject = SLIDE_SUBJECTS[slideType] ?? SLIDE_SUBJECTS.cover;
  const styleModifier = getStyleModifier(stylePreset);

  return [
    `Generate an abstract background texture for a professional presentation slide.`,
    ``,
    `${NO_PHOTO_GUARDRAIL}`,
    ``,
    `Subject: ${subject}`,
    `Color / mood: ${styleModifier}`,
    ``,
    `Requirements: ${GUARDRAILS}`,
  ].join("\n");
}
