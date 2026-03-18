/**
 * Pricing group classifier (sync, no server). Used by jobtread-pricing and sources/actions.
 * Import from here to avoid exporting a sync function from a 'use server' file.
 */

export type PricingGroupKind =
  | 'interior-room'
  | 'exterior-area'
  | 'specialty-area'
  | 'invalid';

export type PricingGroupClassification = {
  isValidPricingGroup: boolean;
  normalizedPricingGroup: string | null;
  groupKind: PricingGroupKind;
  exclusionReason: string | null;
};

const COST_CODE_PREFIX_REGEX = /^\d+[A-Z]\b/;
const INVALID_GROUP_PHRASES = [
  'purchase order',
  'other line items',
  'uncategorized',
  'change order',
  'electrical change order',
  'materials',
  'material',
  'labor',
  'subcontract',
  'subcontractor',
];
const INVALID_PO_REGEX = /\bpo\b/i;

const CANONICAL_PRICING_GROUPS: Record<
  string,
  { normalizedName: string; kind: 'interior-room' | 'exterior-area' | 'specialty-area' }
> = {
  kitchen: { normalizedName: 'Kitchen', kind: 'interior-room' },
  bathroom: { normalizedName: 'Bathroom', kind: 'interior-room' },
  bath: { normalizedName: 'Bathroom', kind: 'interior-room' },
  'primary bathroom': { normalizedName: 'Primary Bathroom', kind: 'interior-room' },
  'primary bath': { normalizedName: 'Primary Bathroom', kind: 'interior-room' },
  'guest bathroom': { normalizedName: 'Guest Bathroom', kind: 'interior-room' },
  'guest bath': { normalizedName: 'Guest Bathroom', kind: 'interior-room' },
  bedroom: { normalizedName: 'Bedroom', kind: 'interior-room' },
  'primary bedroom': { normalizedName: 'Primary Bedroom', kind: 'interior-room' },
  'guest bedroom': { normalizedName: 'Guest Bedroom', kind: 'interior-room' },
  office: { normalizedName: 'Office', kind: 'interior-room' },
  hall: { normalizedName: 'Hall', kind: 'interior-room' },
  hallway: { normalizedName: 'Hall', kind: 'interior-room' },
  laundry: { normalizedName: 'Laundry', kind: 'interior-room' },
  pantry: { normalizedName: 'Pantry', kind: 'interior-room' },
  'living room': { normalizedName: 'Living Room', kind: 'interior-room' },
  'dining room': { normalizedName: 'Dining Room', kind: 'interior-room' },
  entry: { normalizedName: 'Entry', kind: 'interior-room' },
  'entry hall': { normalizedName: 'Entry', kind: 'interior-room' },
  closet: { normalizedName: 'Closet', kind: 'interior-room' },
  'hall closet': { normalizedName: 'Closet', kind: 'interior-room' },
  'guest bedroom closet': { normalizedName: 'Closet', kind: 'interior-room' },
  stairway: { normalizedName: 'Stairway', kind: 'interior-room' },
  landing: { normalizedName: 'Landing', kind: 'interior-room' },
  'elevator lobby': { normalizedName: 'Elevator Lobby', kind: 'interior-room' },
  'conference room': { normalizedName: 'Conference Room', kind: 'interior-room' },
  'break room': { normalizedName: 'Break Room', kind: 'interior-room' },
  lounge: { normalizedName: 'Lounge', kind: 'interior-room' },
  'design studio': { normalizedName: 'Design Studio', kind: 'specialty-area' },
  'sauna room': { normalizedName: 'Sauna Room', kind: 'interior-room' },
  deck: { normalizedName: 'Deck', kind: 'exterior-area' },
  pool: { normalizedName: 'Pool', kind: 'exterior-area' },
  porch: { normalizedName: 'Porch', kind: 'exterior-area' },
  'screened porch': { normalizedName: 'Screened Porch', kind: 'exterior-area' },
  exterior: { normalizedName: 'Exterior', kind: 'exterior-area' },
  garage: { normalizedName: 'Garage', kind: 'exterior-area' },
  driveway: { normalizedName: 'Driveway', kind: 'exterior-area' },
  landscaping: { normalizedName: 'Landscaping', kind: 'exterior-area' },
  addition: { normalizedName: 'Addition', kind: 'specialty-area' },
};

export function classifyPricingGroup(rawName: string): PricingGroupClassification {
  const trimmed = rawName.trim();
  if (!trimmed) {
    return {
      isValidPricingGroup: false,
      normalizedPricingGroup: null,
      groupKind: 'invalid',
      exclusionReason: 'Empty group name',
    };
  }
  if (COST_CODE_PREFIX_REGEX.test(trimmed)) {
    return {
      isValidPricingGroup: false,
      normalizedPricingGroup: null,
      groupKind: 'invalid',
      exclusionReason: 'Cost-code style prefix (e.g. 01L, 42M)',
    };
  }
  const lower = trimmed.toLowerCase();
  if (INVALID_PO_REGEX.test(lower)) {
    return {
      isValidPricingGroup: false,
      normalizedPricingGroup: null,
      groupKind: 'invalid',
      exclusionReason: 'Contains "PO" (purchase order)',
    };
  }
  for (const phrase of INVALID_GROUP_PHRASES) {
    if (lower.includes(phrase)) {
      return {
        isValidPricingGroup: false,
        normalizedPricingGroup: null,
        groupKind: 'invalid',
        exclusionReason: `Contains invalid phrase: "${phrase}"`,
      };
    }
  }
  let key = trimmed
    .replace(/^.+?'s?\s+/i, '')
    .replace(/\s+\d+$/, '')
    .trim();
  key = key.toLowerCase().replace(/\s+/g, ' ').trim();
  if (!key) {
    return {
      isValidPricingGroup: false,
      normalizedPricingGroup: null,
      groupKind: 'invalid',
      exclusionReason: 'Empty after normalization',
    };
  }
  const canonical = CANONICAL_PRICING_GROUPS[key];
  if (canonical) {
    return {
      isValidPricingGroup: true,
      normalizedPricingGroup: canonical.normalizedName,
      groupKind: canonical.kind,
      exclusionReason: null,
    };
  }
  return {
    isValidPricingGroup: false,
    normalizedPricingGroup: null,
    groupKind: 'invalid',
    exclusionReason: 'Not a known pricing group',
  };
}
