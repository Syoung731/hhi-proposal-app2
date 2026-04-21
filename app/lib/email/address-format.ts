/**
 * Email-address formatting + parsing helpers.
 *
 * Two pure functions, no server-only imports — safe to use from client or
 * server code.
 *
 * # Why a shared module
 *   - Delivery server action needs `formatEmailAddress()` to produce
 *     "Steve Young <syoung@hhi-builders.com>" for the From + Reply-To
 *     fields so inbox display names look right.
 *   - Google Workspace DWD provider needs `extractBareEmail()` twice:
 *       1. To apply the authorized-domain guard against the actual email
 *          (not the display-name wrapper).
 *       2. To set the JWT subject for impersonation — DWD requires a bare
 *          email there; passing "Display Name <user@domain>" makes the
 *          token reject.
 *
 * Keeping both in one small module avoids drift between the code that
 * composes addresses and the code that parses them.
 */

export interface EmailAddressParts {
  firstName: string | null;
  lastName: string | null;
  email: string;
}

/**
 * RFC 5322 characters that require the display-name to be quoted when used
 * in an address like `"Display Name" <email>`. Per the spec the full set
 * of "specials" is `( ) < > [ ] : ; @ \ , "` — period is technically also
 * a special, but in practice every widely-deployed MUA accepts
 * `John M. Smith <…>` without quoting, and quoting it produces uglier
 * inbox display. We follow that pragmatic convention.
 */
// eslint-disable-next-line no-useless-escape
const REQUIRES_QUOTING_RE = /[(),:;<>@\[\]\\"]/;

/**
 * Format a sender identity as an RFC 5322 mailbox-address string.
 *
 *   formatEmailAddress({ firstName: "Steve", lastName: "Young",
 *                         email: "syoung@hhi-builders.com" })
 *     → 'Steve Young <syoung@hhi-builders.com>'
 *
 *   formatEmailAddress({ firstName: null, lastName: null,
 *                         email: "ops@hhi-builders.com" })
 *     → 'ops@hhi-builders.com'
 *
 *   formatEmailAddress({ firstName: "Jones, Inc.", lastName: null,
 *                         email: "hi@jones.com" })
 *     → '"Jones, Inc." <hi@jones.com>'
 *
 * Returns a bare email when no usable display name exists — preserves the
 * prior behavior for callers that haven't been updated.
 */
export function formatEmailAddress(parts: EmailAddressParts): string {
  const first = parts.firstName?.trim() ?? "";
  const last = parts.lastName?.trim() ?? "";
  const email = parts.email.trim();
  if (!email) return "";

  const display = [first, last].filter((s) => s.length > 0).join(" ");
  if (!display) return email;

  if (REQUIRES_QUOTING_RE.test(display)) {
    // Escape backslash first, then the inner double-quotes. Order matters:
    // escaping backslash last would re-escape the backslashes we added for
    // the quotes.
    const escaped = display.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    return `"${escaped}" <${email}>`;
  }
  return `${display} <${email}>`;
}

/**
 * Extract the bare email from an address in either plain or
 * angle-bracket form. Safe on values that are already bare.
 *
 *   extractBareEmail('Steve Young <syoung@hhi-builders.com>')
 *     → 'syoung@hhi-builders.com'
 *   extractBareEmail('syoung@hhi-builders.com')
 *     → 'syoung@hhi-builders.com'
 *   extractBareEmail('"Jones, Inc." <hi@jones.com>')
 *     → 'hi@jones.com'
 *
 * If the value contains multiple `<…>` segments (malformed input) the
 * LAST one wins — matches the RFC 5322 grammar where the addr-spec is
 * terminated by `>`. Downstream validators still apply; this helper is
 * a formatter, not a validator.
 */
export function extractBareEmail(raw: string): string {
  const trimmed = raw.trim();
  // Match `<...>` terminating the string, allowing trailing whitespace.
  const m = trimmed.match(/<([^<>]+)>\s*$/);
  if (m) return m[1].trim();
  return trimmed;
}
