/**
 * Single-player automatic tea-fee calculation.
 * Amounts are represented in cents so the result is deterministic and never
 * depends on JavaScript floating-point arithmetic.
 */
export function calculatePerPlayerTeaFeeCents(
  amountCents: number,
  thresholdCents: number,
  ratePercent: number,
): number {
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) return 0;
  if (!Number.isSafeInteger(thresholdCents) || thresholdCents < 0) return 0;
  if (!Number.isSafeInteger(ratePercent) || ratePercent <= 0) return 0;
  if (thresholdCents > 0 && amountCents < thresholdCents) return 0;
  return Math.ceil((amountCents * ratePercent) / 100);
}

