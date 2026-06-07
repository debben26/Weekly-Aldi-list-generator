// TripCompletionService — freezing a completed week (spec 6.13 / 10.3).
// Pure builders only (no DB). The orchestration that persists snapshots + observations lives in
// the grocery-list completion data layer. Snapshots are denormalized COPIES so later edits to a
// live Item can never change history.

export type LiveListItem = {
  itemId: string | null;
  displayName: string;
  quantity: number | null;
  unit: string | null;
  sectionName: string | null;
  checked: boolean;
  estimatedPrice: number | null;
  paidPrice: number | null;
  sourceLabels: string[];
};

export type SnapshotItemData = {
  itemId: string | null; // analytics join only — NOT a relation
  displayName: string;
  quantity: number | null;
  unit: string | null;
  sectionName: string | null;
  checked: boolean;
  estimatedPrice: number | null;
  paidPrice: number | null;
  sourceLabels: string[];
};

// Copy every display value (and clone the labels array) so the snapshot is independent of the
// live item it was built from.
export function buildSnapshotItem(item: LiveListItem): SnapshotItemData {
  return {
    itemId: item.itemId,
    displayName: item.displayName,
    quantity: item.quantity,
    unit: item.unit,
    sectionName: item.sectionName,
    checked: item.checked,
    estimatedPrice: item.estimatedPrice,
    paidPrice: item.paidPrice,
    sourceLabels: [...item.sourceLabels],
  };
}

export function tripTotals(items: LiveListItem[]): {
  totalEstimated: number | null;
  totalPaid: number | null;
} {
  let est = 0;
  let paid = 0;
  let hasEst = false;
  let hasPaid = false;
  for (const i of items) {
    if (i.estimatedPrice != null) {
      est += i.estimatedPrice;
      hasEst = true;
    }
    if (i.paidPrice != null) {
      paid += i.paidPrice;
      hasPaid = true;
    }
  }
  return { totalEstimated: hasEst ? est : null, totalPaid: hasPaid ? paid : null };
}

// Item ids of checked rows — used to update restock last_purchased_date (spec 6.13).
export function checkedItemIds(items: LiveListItem[]): string[] {
  return items.filter((i) => i.checked && i.itemId).map((i) => i.itemId as string);
}
