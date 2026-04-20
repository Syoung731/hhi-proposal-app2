/**
 * Employee email-signature builder.
 *
 * Pure function. No DB access, no network, no filesystem. Takes a narrow
 * subset of the Employee record and returns a pair of rendered blocks —
 * HTML for rich clients, text for plain-text fallback — suitable for
 * concatenation onto the body of an outbound proposal email.
 *
 * # Why it looks the way it does — email-client compatibility constraints
 *
 * ## 1. Inline styles only
 * Gmail (both web and mobile) strips `<style>` blocks entirely, Outlook
 * desktop respects a subset of CSS but ignores selectors that reach through
 * the DOM, and many corporate clients sandbox the body into a limited
 * whitelist. Every visual property here lives in a `style="…"` attribute on
 * the element it targets. No class names, no IDs, no stylesheets, no CSS
 * variables.
 *
 * ## 2. Table-based layout, not flex / grid
 * Outlook desktop (the Word-engine flavour still deployed at most Fortune-
 * 500 shops) does not support `display: flex`, `display: grid`, or
 * `position: absolute`. Two-column layouts must be built with `<table>` +
 * `<tr>` + `<td>`. Padding on `<td>` is the only reliable spacing primitive;
 * margins on block elements are honoured inconsistently.
 *
 * ## 3. Web fonts are unreliable
 * The project's brand font (Cormorant Garamond) will not render in most
 * email clients — they either strip `@font-face` or refuse to fetch remote
 * font files. We fall back to a generic serif stack (`Georgia`, Times New
 * Roman) for headings and a system-ui stack for body copy. This is a
 * compromise: the signature will look subtly different in-inbox than it
 * does in-app, but it will be legible everywhere.
 *
 * ## 4. `border-radius` is best-effort
 * The 72×72 headshot gets `border-radius: 50%` (a circular crop) in modern
 * clients (Gmail web, Apple Mail, Outlook web, iOS Mail, most mobile
 * clients). Outlook desktop ignores the property and renders a square.
 * Acceptable degradation — the image still displays.
 *
 * ## 5. No emoji, no special characters
 * Older Outlook builds and some corporate gateways mangle non-ASCII
 * characters. Quotes, separators, and labels here are ASCII-safe. The one
 * exception: a curly quote pair around the `signatureQuote` is rendered as
 * plain straight quotes.
 *
 * ## 6. Every user-provided string is HTML-escaped
 * Names can contain `&`, `<`, `>`, apostrophes. A quote might contain
 * markup-sensitive characters. The `escapeHtml()` helper is applied to all
 * interpolated values before they enter the HTML output. URLs used in
 * `href` attributes are ALSO passed through `escapeAttr()` to neutralise
 * `"` and angle brackets.
 *
 * ## 7. External URL assumption
 * `headshotUrl` must be an absolute HTTPS URL reachable from the
 * recipient's network. Cloudflare R2 public URLs satisfy this. The builder
 * does not validate; the UI is responsible for ensuring the upload
 * persisted before persisting the URL to the DB.
 *
 * # Respects signatureEnabled
 * When `signatureEnabled === false` the function returns empty strings for
 * both `html` and `text`. Callers can safely concatenate the result onto a
 * message body without a guard — an opted-out employee contributes no
 * bytes.
 */

/**
 * Narrow input shape — only the fields the builder actually reads. Keeps
 * callers honest (the compile-time type prevents passing an unrelated
 * record) and makes the function straightforward to unit-test.
 */
export interface SignatureEmployee {
  firstName: string;
  lastName: string;
  /** Client-facing title (e.g. "Senior Project Manager"). Optional. */
  jobTitle: string | null;
  /** Absolute HTTPS URL for the headshot image. Optional. */
  headshotUrl: string | null;
  /** One-line tagline, rendered in italics beneath the name/title. Optional. */
  signatureQuote: string | null;
  /** Main contact email. Rendered as a mailto link. Optional. */
  email: string | null;
  /** Direct desk line. Optional. */
  directPhone: string | null;
  /** Mobile line. Optional. */
  mobilePhone: string | null;
  /** Absolute LinkedIn profile URL. Optional. */
  linkedInUrl: string | null;
  /** Opt-in flag. When false, the builder returns empty strings. */
  signatureEnabled: boolean;
}

export interface BuiltSignature {
  /** HTML block suitable for appending to an email body. Fully inline-styled. */
  html: string;
  /** Plain-text equivalent for multipart/alternative fallback. */
  text: string;
}

const BRAND_NAVY = "#1A2332";
const BRAND_ORANGE = "#F47216";
const MUTED = "#6B7280";
const DIVIDER = "#D4D4D0";

const HEADING_FONT = "Georgia, 'Times New Roman', serif";
const BODY_FONT =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif";

/**
 * Build an employee email-signature pair.
 *
 * The HTML side uses a two-column table when a headshot is present
 * (headshot left, name + title + quote right), collapsing to a single
 * column when no headshot URL is supplied. Contact lines stack as a
 * separate row beneath the identity block, one link per line.
 *
 * The text side mirrors the same information in a stripped form suitable
 * for the `text` part of a multipart/alternative MIME body.
 */
export function buildEmployeeSignature(
  employee: SignatureEmployee,
): BuiltSignature {
  if (!employee.signatureEnabled) {
    return { html: "", text: "" };
  }

  const fullName = [employee.firstName, employee.lastName]
    .map((s) => s.trim())
    .filter(Boolean)
    .join(" ");
  const jobTitle = employee.jobTitle?.trim() || null;
  const quote = employee.signatureQuote?.trim() || null;
  const email = employee.email?.trim() || null;
  const directPhone = employee.directPhone?.trim() || null;
  const mobilePhone = employee.mobilePhone?.trim() || null;
  const linkedInUrl = employee.linkedInUrl?.trim() || null;
  const headshotUrl = employee.headshotUrl?.trim() || null;

  return {
    html: renderHtml({
      fullName,
      jobTitle,
      quote,
      email,
      directPhone,
      mobilePhone,
      linkedInUrl,
      headshotUrl,
    }),
    text: renderText({
      fullName,
      jobTitle,
      quote,
      email,
      directPhone,
      mobilePhone,
      linkedInUrl,
    }),
  };
}

// ─── HTML ────────────────────────────────────────────────────────────────────

interface RenderArgs {
  fullName: string;
  jobTitle: string | null;
  quote: string | null;
  email: string | null;
  directPhone: string | null;
  mobilePhone: string | null;
  linkedInUrl: string | null;
  headshotUrl: string | null;
}

function renderHtml(args: RenderArgs): string {
  const {
    fullName,
    jobTitle,
    quote,
    email,
    directPhone,
    mobilePhone,
    linkedInUrl,
    headshotUrl,
  } = args;

  const identity = renderIdentityBlock({ fullName, jobTitle, quote });
  const contactLines = renderContactLines({
    email,
    directPhone,
    mobilePhone,
    linkedInUrl,
  });

  const wrapperStyle = `font-family: ${BODY_FONT}; color: ${BRAND_NAVY}; font-size: 12px; line-height: 1.5; max-width: 520px;`;
  const outerTableStyle = `border-collapse: collapse; border: 0;`;
  const dividerRowStyle = `border-top: 1px solid ${DIVIDER}; padding-top: 10px;`;

  // Identity row — two columns when we have a headshot, one column otherwise.
  let identityRow: string;
  if (headshotUrl) {
    identityRow = `
      <tr>
        <td valign="top" style="padding: 0 14px 0 0;">
          <img src="${escapeAttr(headshotUrl)}" width="72" height="72" alt="${escapeAttr(fullName)}" style="display: block; width: 72px; height: 72px; border: 0; border-radius: 50%; object-fit: cover;" />
        </td>
        <td valign="top">${identity}</td>
      </tr>`;
  } else {
    identityRow = `
      <tr>
        <td valign="top">${identity}</td>
      </tr>`;
  }

  // Contact row spans whatever columns are above it.
  const colspan = headshotUrl ? ' colspan="2"' : "";
  const contactRow = contactLines
    ? `
      <tr>
        <td${colspan} style="${dividerRowStyle}">${contactLines}</td>
      </tr>`
    : "";

  return [
    `<div style="${wrapperStyle}">`,
    `<table role="presentation" cellpadding="0" cellspacing="0" style="${outerTableStyle}">`,
    identityRow,
    contactRow,
    `</table>`,
    `</div>`,
  ].join("");
}

function renderIdentityBlock(args: {
  fullName: string;
  jobTitle: string | null;
  quote: string | null;
}): string {
  const { fullName, jobTitle, quote } = args;
  const lines: string[] = [];
  lines.push(
    `<div style="font-family: ${HEADING_FONT}; font-size: 17px; line-height: 1.2; color: ${BRAND_NAVY}; font-weight: 600;">${escapeHtml(fullName)}</div>`,
  );
  if (jobTitle) {
    lines.push(
      `<div style="margin-top: 2px; font-family: ${BODY_FONT}; font-size: 12px; line-height: 1.3; color: ${MUTED}; letter-spacing: 0.02em;">${escapeHtml(jobTitle)}</div>`,
    );
  }
  if (quote) {
    lines.push(
      `<div style="margin-top: 8px; font-family: ${HEADING_FONT}; font-style: italic; font-size: 12px; line-height: 1.4; color: ${BRAND_NAVY};">"${escapeHtml(quote)}"</div>`,
    );
  }
  return lines.join("");
}

function renderContactLines(args: {
  email: string | null;
  directPhone: string | null;
  mobilePhone: string | null;
  linkedInUrl: string | null;
}): string {
  const { email, directPhone, mobilePhone, linkedInUrl } = args;
  const lines: string[] = [];
  const lineStyle = `margin: 0; font-family: ${BODY_FONT}; font-size: 12px; line-height: 1.6; color: ${BRAND_NAVY};`;
  const linkStyle = `color: ${BRAND_ORANGE}; text-decoration: none;`;
  const labelStyle = `color: ${MUTED}; font-weight: 600;`;

  if (email) {
    lines.push(
      `<div style="${lineStyle}"><a href="mailto:${escapeAttr(email)}" style="${linkStyle}">${escapeHtml(email)}</a></div>`,
    );
  }
  if (directPhone) {
    lines.push(
      `<div style="${lineStyle}"><span style="${labelStyle}">Direct</span> <a href="tel:${escapeAttr(normalizeTel(directPhone))}" style="${linkStyle}">${escapeHtml(directPhone)}</a></div>`,
    );
  }
  if (mobilePhone) {
    lines.push(
      `<div style="${lineStyle}"><span style="${labelStyle}">Mobile</span> <a href="tel:${escapeAttr(normalizeTel(mobilePhone))}" style="${linkStyle}">${escapeHtml(mobilePhone)}</a></div>`,
    );
  }
  if (linkedInUrl) {
    lines.push(
      `<div style="${lineStyle}"><a href="${escapeAttr(linkedInUrl)}" style="${linkStyle}">LinkedIn</a></div>`,
    );
  }
  return lines.join("");
}

// ─── Text ────────────────────────────────────────────────────────────────────

function renderText(args: Omit<RenderArgs, "headshotUrl">): string {
  const {
    fullName,
    jobTitle,
    quote,
    email,
    directPhone,
    mobilePhone,
    linkedInUrl,
  } = args;

  const lines: string[] = [];
  lines.push(fullName);
  if (jobTitle) lines.push(jobTitle);
  if (quote) {
    lines.push("");
    lines.push(`"${quote}"`);
  }

  const contactLines: string[] = [];
  if (email) contactLines.push(email);
  if (directPhone) contactLines.push(`Direct: ${directPhone}`);
  if (mobilePhone) contactLines.push(`Mobile: ${mobilePhone}`);
  if (linkedInUrl) contactLines.push(`LinkedIn: ${linkedInUrl}`);

  if (contactLines.length > 0) {
    lines.push("");
    lines.push(...contactLines);
  }

  return lines.join("\n");
}

// ─── Pure helpers ────────────────────────────────────────────────────────────

/**
 * HTML-escape a string for interpolation into element text content.
 * Not suitable for attribute values — use escapeAttr() for those so that
 * embedded `"` or `'` are neutralised.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Escape a string for use inside an HTML attribute value (href, src, alt).
 * Covers the same characters as escapeHtml — reused alias so the call
 * sites make the intent explicit.
 */
export function escapeAttr(value: string): string {
  return escapeHtml(value);
}

/**
 * Produce a tel: URI-safe form of a phone number by stripping everything
 * except digits, `+`, and extension characters. Preserves a leading `+`.
 */
function normalizeTel(raw: string): string {
  const trimmed = raw.trim();
  const leadingPlus = trimmed.startsWith("+") ? "+" : "";
  const digits = trimmed.replace(/[^0-9]/g, "");
  return `${leadingPlus}${digits}`;
}
