// PriceObservationService — pure pricing helpers (spec 5.7 / 6.14).
// Estimated and paid prices are kept distinct everywhere; observations prefer the actual paid
// price, falling back to the estimate.

export type PriceSourceType = "manual" | "estimated";

export function computeUnitPrice(
  amount: number | null,
  quantity: number | null,
): number | null {
  if (amount == null || quantity == null || quantity === 0) return null;
  return amount / quantity;
}

// Build the price observations to record for a purchased line. Estimated and paid are recorded
// SEPARATELY (spec 6.15: price history must keep estimated vs paid distinguishable), so a line
// with both prices yields two observations. Empty when no price is known — missing prices never
// break completion (spec 6.14).
export function priceObservations(
  estimatedPrice: number | null,
  paidPrice: number | null,
): { amount: number; sourceType: PriceSourceType }[] {
  const out: { amount: number; sourceType: PriceSourceType }[] = [];
  if (estimatedPrice != null) out.push({ amount: estimatedPrice, sourceType: "estimated" });
  if (paidPrice != null) out.push({ amount: paidPrice, sourceType: "manual" });
  return out;
}
