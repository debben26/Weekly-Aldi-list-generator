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

// Choose the observation to record for a purchased line: the paid price (a real, manually
// entered amount) when present, otherwise the estimate. Null when no price is known — missing
// prices never break completion (spec 6.14).
export function selectObservation(
  estimatedPrice: number | null,
  paidPrice: number | null,
): { amount: number; sourceType: PriceSourceType } | null {
  if (paidPrice != null) return { amount: paidPrice, sourceType: "manual" };
  if (estimatedPrice != null) return { amount: estimatedPrice, sourceType: "estimated" };
  return null;
}
