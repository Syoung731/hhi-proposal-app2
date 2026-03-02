/**
 * Shared display logic for Cover and any UI that shows project owner and address.
 * No placeholder fallbacks (e.g. "Owner Name", "Project Address").
 */

export type OwnerFields = {
  client1First?: string | null;
  client1Last?: string | null;
  client2First?: string | null;
  client2Last?: string | null;
};

/**
 * Format owner names for display.
 * - If client2 exists: same last name (case-insensitive) => "First1 & First2 Last", else => "First1 Last1 & First2 Last2"
 * - Else => "First1 Last1"
 * Returns empty string if client1 first/last are both empty.
 */
export function formatOwnerNames(fields: OwnerFields): string {
  const f1 = (fields.client1First ?? "").trim();
  const l1 = (fields.client1Last ?? "").trim();
  const f2 = (fields.client2First ?? "").trim();
  const l2 = (fields.client2Last ?? "").trim();

  const has1 = !!(f1 || l1);
  const has2 = !!(f2 || l2);

  if (!has1) return "";
  const one = [f1, l1].filter(Boolean).join(" ").trim();

  if (!has2) return one;

  const lastMatch = l1 && l2 && l1.toLowerCase() === l2.toLowerCase();
  if (lastMatch) {
    const firsts = [f1, f2].filter(Boolean);
    return firsts.length ? `${firsts.join(" & ")} ${l1}` : l1;
  }
  const two = [f2, l2].filter(Boolean).join(" ").trim();
  return two ? `${one} & ${two}` : one;
}

export type AddressFields = {
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
};

/**
 * Format address for display.
 * "addressLine1{ addressLine2? ' ' + addressLine2 : ''}, city, state zip"
 * Returns empty string if addressLine1 (or required parts) are missing.
 */
export function formatAddress(fields: AddressFields): string {
  const line1 = (fields.addressLine1 ?? "").trim();
  const line2 = (fields.addressLine2 ?? "").trim();
  const city = (fields.city ?? "").trim();
  const state = (fields.state ?? "").trim();
  const zip = (fields.zip ?? "").trim();

  if (!line1 || !city || !state || !zip) return "";

  const fullLine1 = line2 ? `${line1} ${line2}` : line1;
  return `${fullLine1}, ${city}, ${state} ${zip}`.trim();
}
