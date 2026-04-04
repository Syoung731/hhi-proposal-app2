/**
 * Hilton Head Island permit fee calculator.
 * Pre-calculates fees in code so the AI never does arithmetic.
 *
 * Fee schedule: Town of Hilton Head Island — Miscellaneous Single Family Permits
 */

export interface PermitFeeResult {
  baseFee: number;
  planReviewFee: number;
  planReviewRequired: boolean;
  planReviewReasons: string[];
  totalPermitCost: number;
  calculation: string;
}

export function calculatePermitFee(
  totalProjectValue: number,
  scopeFlags: {
    hasFraming: boolean;
    hasPlumbing: boolean;
    hasWindows: boolean;
  },
): PermitFeeResult {
  let baseFee: number;
  let calculation: string;

  if (totalProjectValue <= 1000) {
    baseFee = 35;
    calculation = `Project value $${totalProjectValue.toLocaleString()} \u2264 $1,000 \u2192 fee = $35`;
  } else if (totalProjectValue <= 2000) {
    baseFee = 70;
    calculation = `Project value $${totalProjectValue.toLocaleString()} in $1,001\u2013$2,000 range \u2192 fee = $70`;
  } else if (totalProjectValue <= 3000) {
    baseFee = 77;
    calculation = `Project value $${totalProjectValue.toLocaleString()} in $2,001\u2013$3,000 range \u2192 fee = $77`;
  } else if (totalProjectValue <= 50000) {
    const over3000 = Math.ceil((totalProjectValue - 3000) / 1000);
    baseFee = 77 + 9 * over3000;
    calculation = `Project value $${totalProjectValue.toLocaleString()} in $3,001\u2013$50,000 range \u2192 $77 + $9 \u00D7 ${over3000} (ceil of (${totalProjectValue.toLocaleString()} \u2212 3,000) / 1,000) = $${baseFee.toFixed(2)}`;
  } else {
    const over50000 = Math.ceil((totalProjectValue - 50000) / 1000);
    baseFee = 500 + 3.50 * over50000;
    calculation = `Project value $${totalProjectValue.toLocaleString()} > $50,000 \u2192 $500 + $3.50 \u00D7 ${over50000} (ceil of (${totalProjectValue.toLocaleString()} \u2212 50,000) / 1,000) = $${baseFee.toFixed(2)}`;
  }

  // Plan review: 50% of permit fee, required if structural/plumbing/windows
  const planReviewReasons: string[] = [];
  if (scopeFlags.hasFraming) planReviewReasons.push("Structural work (framing) present");
  if (scopeFlags.hasPlumbing) planReviewReasons.push("Plumbing work present");
  if (scopeFlags.hasWindows) planReviewReasons.push("Window/exterior door replacement");

  const planReviewRequired = planReviewReasons.length > 0;
  const planReviewFee = planReviewRequired
    ? Math.round(baseFee * 0.5 * 100) / 100
    : 0;

  return {
    baseFee: Math.round(baseFee * 100) / 100,
    planReviewFee,
    planReviewRequired,
    planReviewReasons,
    totalPermitCost: Math.round((baseFee + planReviewFee) * 100) / 100,
    calculation,
  };
}
