/**
 * Website Discovery Questionnaire v2 — question definitions.
 *
 * Source of truth for the /discovery portal. Questions are defined in code
 * (not the DB) so the questionnaire is versioned with the app; the team's
 * answers/links/files are stored in DiscoveryAnswer / DiscoveryLink /
 * DiscoveryAttachment keyed by `key` ("q1".."q73").
 *
 * Text supports **bold** spans only — rendered by renderBold() in the form
 * and passed through verbatim in the Markdown export.
 */

export type DiscoveryQuestion = {
  key: string;
  num: number;
  text: string;
  /** Rendered as a bold sub-heading above this question (Section 12 subgroups). */
  subheading?: string;
};

export type DiscoverySection = {
  id: string;
  num: number;
  title: string;
  /** High-priority sections flagged ⭐ in the source doc. */
  star?: boolean;
  note?: string;
  questions: DiscoveryQuestion[];
};

export const QUESTIONNAIRE_TITLE =
  "HHI Builders — Custom Website Build: Discovery Questionnaire v2";

export const QUESTIONNAIRE_INTRO =
  "Answer inline — short answers or bullets are fine, and “TBD” is a valid answer. " +
  "Attach files (brand guides, photos, current prompts) and links wherever they help. " +
  "Answers save automatically as you type.";

export const PRIORITY_NOTE =
  "Answer first to unlock the highest-value prompts: Sections 3, 4, and 11.";

export const DISCOVERY_SECTIONS: DiscoverySection[] = [
  {
    id: "s1",
    num: 1,
    title: "Brand, design & positioning",
    questions: [
      {
        key: "q1",
        num: 1,
        text: "Confirm palette: orange + black. Have exact hex codes / logo / brand guide? (attach)",
      },
      { key: "q2", num: 2, text: "Three words for how the site should feel?" },
      {
        key: "q3",
        num: 3,
        text: "Reference sites you admire (in or out of industry)?",
      },
      { key: "q4", num: 4, text: "Anything to deliberately avoid?" },
      {
        key: "q5",
        num: 5,
        text: "Lead headline: keep “Hilton Head's Trusted Luxury Remodeler,” lead with the fixed-price guarantee, or something else?",
      },
    ],
  },
  {
    id: "s2",
    num: 2,
    title: "Content, pages & IA",
    questions: [
      {
        key: "q6",
        num: 6,
        text: "Confirm page list (Home, Portfolio, Services, Our Process, About, Service Areas, Insights, Reviews, Contact, AI Estimator, Repair Pricer). Add/remove?",
      },
      {
        key: "q7",
        num: 7,
        text: "Service-area towns at launch? Charleston now or later?",
      },
      {
        key: "q8",
        num: 8,
        text: "How many signature projects can launch with good photos? Do you have pro photo/video or need a shoot?",
      },
      {
        key: "q9",
        num: 9,
        text: "Show budget ranges on portfolio projects? (You already do on featured projects — keep?)",
      },
      {
        key: "q10",
        num: 10,
        text: "Keep, replace, or run both: existing estimators vs. the new AI estimator?",
      },
    ],
  },
  {
    id: "s3",
    num: 3,
    title: "AI Estimator",
    star: true,
    note: "Answer first",
    questions: [
      {
        key: "q11",
        num: 11,
        text: "Homeowner inputs? (project type, rooms, sq ft, finish tier, photos, ZIP, free-text, uploaded plans?)",
      },
      {
        key: "q12",
        num: 12,
        text: "Output format? (single range / per-room / Good-Better-Best / range + “what drives the number”)",
      },
      {
        key: "q13",
        num: 13,
        text: "Data source: JobTread catalog + room-price-range logic — live Pave pull or frozen snapshot for the public tool?",
      },
      {
        key: "q14",
        num: 14,
        text: "Range width + disclaimer language? (“estimate, not a quote”)",
      },
      {
        key: "q15",
        num: 15,
        text: "Lead-capture fields required to show the result? Gate the result or show range then capture for the “detailed version”?",
      },
      {
        key: "q16",
        num: 16,
        text: "Generate a PDF + email to lead and team? Auto-push to GHL?",
      },
      {
        key: "q17",
        num: 17,
        text: "Reuse internal A–D finish tiers (never shown to clients)?",
      },
      {
        key: "q18",
        num: 18,
        text: "Include AI-generated visuals (Imagen) of the space in v1, or numbers-only?",
      },
    ],
  },
  {
    id: "s4",
    num: 4,
    title: "Repair Pricer",
    star: true,
    note: "Answer first",
    questions: [
      {
        key: "q19",
        num: 19,
        text: "Confirm flow: realtor uploads inspection report (PDF) → AI extracts + prices repairs → range → first free → capture info.",
      },
      {
        key: "q20",
        num: 20,
        text: "Output format? (line-item list / total range / negotiation-credit summary)",
      },
      {
        key: "q21",
        num: 21,
        text: "“First one free” metering: by account (Clerk login), by realtor, or per-session? What happens on the 2nd request?",
      },
      {
        key: "q22",
        num: 22,
        text: "Realtor info captured (name, brokerage, email, phone)? Auto-add to a separate realtor segment in GHL?",
      },
      {
        key: "q23",
        num: 23,
        text: "**Guardrails:** outputs framed as estimated ranges with disclaimers, never quotes — agreed? Any insurer/legal language?",
      },
      {
        key: "q24",
        num: 24,
        text: "**Data handling:** store the uploaded report or process-and-discard? Retention rule? (reports contain homeowner PII)",
      },
      {
        key: "q25",
        num: 25,
        text: "Same JobTread engine as the estimator, or a separate repair-cost dataset?",
      },
      {
        key: "q26",
        num: 26,
        text: "Is this the Repair Pricer you already run? Can you share the current prompt/logic to port it?",
      },
    ],
  },
  {
    id: "s5",
    num: 5,
    title: "CMS / marketing backend",
    questions: [
      {
        key: "q27",
        num: 27,
        text: "Who publishes day-to-day, and their comfort level (non-technical / light markdown)?",
      },
      {
        key: "q28",
        num: 28,
        text: "Content types to manage (blog, projects, services, service-areas, testimonials, team, FAQs, awards)? Others?",
      },
      {
        key: "q29",
        num: 29,
        text: "Confirm AEO-enforced required fields on blog posts (answer-first summary, FAQ block, meta, target keyword, hero image + alt). Add any?",
      },
      {
        key: "q30",
        num: 30,
        text: "Draft → review → publish approval flow, or direct publish?",
      },
      {
        key: "q31",
        num: 31,
        text: "Should she edit homepage sections (hero, featured) herself, or lock to devs?",
      },
      { key: "q32", num: 32, text: "Need scheduled publishing?" },
    ],
  },
  {
    id: "s6",
    num: 6,
    title: "AI intelligence engine",
    questions: [
      {
        key: "q33",
        num: 33,
        text: "Confirm the four agents (competitor monitor, keyword + AI-visibility monitor, content-opportunity drafter, weekly digest). Add/cut?",
      },
      {
        key: "q34",
        num: 34,
        text: "Confirm competitor list to monitor (H2, Beckwith, Esposito, Classic, Roberts, Forward Builders, RCH, Bluffton Builders, Albrecht, Paul Langan) — add/remove any?",
      },
      {
        key: "q35",
        num: 35,
        text: "Target keyword seed list (rough is fine)?",
      },
      {
        key: "q36",
        num: 36,
        text: "Which AI engines to track (ChatGPT, Perplexity, Google AI Overviews, Claude)?",
      },
      {
        key: "q37",
        num: 37,
        text: "Digest delivery (email / Slack / admin dashboard / .docx)?",
      },
      {
        key: "q38",
        num: 38,
        text: "Content agent: full draft posts (human-edited) or briefs/outlines only?",
      },
      { key: "q39", num: 39, text: "Scan cadence per agent?" },
      {
        key: "q40",
        num: 40,
        text: "Budget comfort for the keyword data feed (DataForSEO-type, usage-based)?",
      },
    ],
  },
  {
    id: "s7",
    num: 7,
    title: "Integrations & systems",
    questions: [
      {
        key: "q41",
        num: 41,
        text: "Confirm integrations: JobTread (Pave), GHL/Stannect, Google Search Console. Others (GA4, Houzz, Buildertrend portal)?",
      },
      {
        key: "q42",
        num: 42,
        text: "Email: route marketing through GHL? Resend (or similar) for transactional?",
      },
      {
        key: "q43",
        num: 43,
        text: "Client/realtor login via Clerk, or email-gated results only?",
      },
      {
        key: "q44",
        num: 44,
        text: "Should estimator/Repair Pricer leads auto-create GHL records/opportunities, and in which pipeline/stage?",
      },
    ],
  },
  {
    id: "s8",
    num: 8,
    title: "Hosting, ops & ownership",
    questions: [
      { key: "q45", num: 45, text: "Deploy on Vercel — confirm?" },
      {
        key: "q46",
        num: 46,
        text: "Domain cutover: switch hhi-builders.com at launch or stage on a subdomain first? (need a 301 redirect map from legacy URLs)",
      },
      {
        key: "q47",
        num: 47,
        text: "Who is the one backup developer (besides you) so you're not the single point of failure?",
      },
      {
        key: "q48",
        num: 48,
        text: "Compliance: privacy policy, cookie consent, accessibility target (recommend WCAG AA)?",
      },
    ],
  },
  {
    id: "s9",
    num: 9,
    title: "Your other ideas (dump zone)",
    questions: [
      {
        key: "q49",
        num: 49,
        text: "List every other feature/idea, even half-formed. Mark each: launch or later. (This is where we control scope creep.)",
      },
    ],
  },
  {
    id: "s10",
    num: 10,
    title: "Priorities & constraints",
    questions: [
      {
        key: "q50",
        num: 50,
        text: "Confirm launch sequence: (a) site + CMS → (b) AI estimator → (c) Repair Pricer → (d) intelligence agents.",
      },
      {
        key: "q51",
        num: 51,
        text: "Hard deadline or external driver (season, HHAHBA seminar, campaign)?",
      },
      {
        key: "q52",
        num: 52,
        text: "Hours/week you can realistically commit without hurting the business?",
      },
    ],
  },
  {
    id: "s11",
    num: 11,
    title: "Strategic decisions surfaced by the audits",
    star: true,
    note: "New in v2",
    questions: [
      {
        key: "q53",
        num: 53,
        text: "**Warranty:** the national leaders use 5-year (CASE 5-yr transferable, Neil Kelly 5-yr; Airoom 10/15-yr). You're at 2-year. Move to a **5-year (transferable?) warranty**? (Strong, cheap trust upgrade.)",
      },
      {
        key: "q54",
        num: 54,
        text: "**Branded process:** the leaders name their process (CASE “CaseStudy®,” Airoom “We Handle Everything!®”). Do you want a branded name for your discovery/estimate step? Any name in mind?",
      },
      {
        key: "q55",
        num: 55,
        text: "**3D/VR previews:** offer 3D renderings (and/or VR walkthroughs) in the design phase to pre-empt change orders (Sun Design model)? Launch or phase 2+?",
      },
      {
        key: "q56",
        num: 56,
        text: "**Aftercare program:** create a named post-completion warranty/maintenance program + an 11-month check-in visit (Sun Design “Forever Home Care,” Meadowlark “Encore”)? What would you call it?",
      },
      {
        key: "q57",
        num: 57,
        text: "**Financing:** offer in-house/partner financing as a conversion tool (Airoom model)? Have a lender partner?",
      },
      {
        key: "q58",
        num: 58,
        text: "**Sub-brand strategy:** do you want a separate sub-brand/lane for small jobs (CASE “FRED”) and/or new construction (Jackson “Luxury Home Builders”), to protect the premium remodel brand? Or stay single-brand?",
      },
      {
        key: "q59",
        num: 59,
        text: "**Reviews platform:** adopt a third-party verified-reviews platform (e.g., GuildQuality) to strengthen trust + AEO citations?",
      },
      {
        key: "q60",
        num: 60,
        text: "**Lead-gen events:** interest in remodeling seminars/webinars as a lead channel (CASE model), tying into your HHAHBA work?",
      },
    ],
  },
  {
    id: "s12",
    num: 12,
    title: "Onsite booking + RENDR LiDAR scan",
    star: true,
    note: "New in v2",
    questions: [
      {
        key: "q61",
        num: 61,
        subheading: "Onsite appointment booking (via Stannect/GHL)",
        text: "**Booking method:** native in-app booking via the GHL API (fully branded, estimator pre-fills the contact) or an embedded GHL calendar widget (faster to ship, lives in an iframe)?",
      },
      {
        key: "q62",
        num: 62,
        text: "**Routing:** do web-booked consults follow the existing dual-track logic (Standard → Dalton, FAST → Charlie), route by project type/budget, or go to a single round-robin team calendar?",
      },
      {
        key: "q63",
        num: 63,
        text: "**Appointment types/lengths:** what should clients be able to book — a 15-min intro call, an in-home consultation, both? Different lengths?",
      },
      {
        key: "q64",
        num: 64,
        text: "**Lead creation:** on booking, auto-create/upsert the GHL contact + opportunity (which pipeline/stage)? Should the estimator's data attach to that record?",
      },
      {
        key: "q65",
        num: 65,
        text: "**Confirmations/reminders:** handled by Stannect (SMS/email)? Should the Voice AI follow up on no-shows/reschedules?",
      },
      {
        key: "q66",
        num: 66,
        text: "**Entry points:** booking offered from the AI Estimator result, Contact Us, and anywhere else (sticky header, end of case studies)?",
      },
      {
        key: "q67",
        num: 67,
        subheading: "RENDR LiDAR pre-call scan",
        text: "**Workflow:** confirmed approach — use RENDR's native “Invite Homeowner to Scan” (site captures lead → triggers a RENDR invite → scan lands in your RENDR workspace), rather than hosting raw file uploads on the site? (Recommended.)",
      },
      {
        key: "q68",
        num: 68,
        text: "**Automation (verify with RENDR):** can the scan invite be triggered automatically (API / Zapier / GHL hook), or is it a manual send from the RENDR dashboard for v1?",
      },
      {
        key: "q69",
        num: 69,
        text: "**Positioning:** confirm the scan is an optional bonus, never required, and the booking flow works fully without it. What's the fallback prompt for clients without a LiDAR device (photos / “we'll measure on site”)?",
      },
      {
        key: "q70",
        num: 70,
        text: "**Device gating:** how do we detect/communicate the LiDAR requirement (iPhone 12 Pro+ / recent iPad Pro)? Simple “do you have a newer iPhone Pro?” check, or device detection?",
      },
      {
        key: "q71",
        num: 71,
        text: "**Downstream use:** does the scan feed the AI estimator for a tighter pre-call range, feed the Proposal App takeoff/JobTread estimate, or just prep the consultation for v1?",
      },
      {
        key: "q72",
        num: 72,
        text: "**Who reviews the scan** when it lands, and where (RENDR dashboard → Proposal App)?",
      },
      {
        key: "q73",
        num: 73,
        text: "**Privacy/consent:** interior scans are sensitive — consent language and retention rule for scan data?",
      },
    ],
  },
];

export const ALL_QUESTION_KEYS: string[] = DISCOVERY_SECTIONS.flatMap((s) =>
  s.questions.map((q) => q.key)
);

export const TOTAL_QUESTIONS = ALL_QUESTION_KEYS.length;

const VALID_KEYS = new Set(ALL_QUESTION_KEYS);

export function isValidQuestionKey(key: string): boolean {
  return VALID_KEYS.has(key);
}
