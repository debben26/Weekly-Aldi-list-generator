// AnalyticsService — deterministic aggregations over frozen trip history (spec 6.15).
// Pure functions; the DB queries that feed them live in the history data layer. Default window
// is 6 months.

export const ANALYTICS_DEFAULT_WINDOW_MONTHS = 6;

// Start of the analytics window (default 6 months back from `now`).
// Uses UTC-based arithmetic to avoid two JS Date pitfalls:
//   1. setMonth() month-end overflow: July 31 - 6 months → setMonth(1) (Feb) rolls to March 3.
//   2. Local vs UTC mismatch: new Date(y,m,d) is local time; toISOString() is UTC.
export function windowStart(now: Date, months: number = ANALYTICS_DEFAULT_WINDOW_MONTHS): Date {
  const y = now.getUTCFullYear();
  const targetMonth = now.getUTCMonth() - months;
  const daysInTarget = new Date(Date.UTC(y, targetMonth + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, targetMonth, Math.min(now.getUTCDate(), daysInTarget)));
}

export type SpendRow = { sectionName: string | null; paidPrice: number | null };

// Spend grouped by section (spec 6.15), descending by total. Rows without a paid price or
// section contribute 0 / "Unassigned".
export function aggregateSpendBySection(
  rows: SpendRow[],
): { section: string; total: number }[] {
  const totals = new Map<string, number>();
  for (const r of rows) {
    if (r.paidPrice == null) continue;
    const key = r.sectionName ?? "Unassigned";
    totals.set(key, (totals.get(key) ?? 0) + r.paidPrice);
  }
  return [...totals.entries()]
    .map(([section, total]) => ({ section, total }))
    .sort((a, b) => b.total - a.total || a.section.localeCompare(b.section));
}

export type MealEntry = { recipeId: string; title: string };

// Most-selected meals (spec 6.15), descending by count, tie-broken by title.
export function mealFrequency(
  entries: MealEntry[],
): { recipeId: string; title: string; count: number }[] {
  const counts = new Map<string, { title: string; count: number }>();
  for (const e of entries) {
    const cur = counts.get(e.recipeId);
    if (cur) cur.count += 1;
    else counts.set(e.recipeId, { title: e.title, count: 1 });
  }
  return [...counts.entries()]
    .map(([recipeId, v]) => ({ recipeId, title: v.title, count: v.count }))
    .sort((a, b) => b.count - a.count || a.title.localeCompare(b.title));
}

export type PurchaseRow = { itemId: string | null; displayName: string; checked: boolean };

// Item purchase frequency (spec 6.15: "How many times did we buy milk in 6 months?").
// Counts checked snapshot lines, grouped by item id (or display name when unmapped).
export function purchaseFrequency(
  rows: PurchaseRow[],
): { key: string; displayName: string; count: number }[] {
  const counts = new Map<string, { displayName: string; count: number }>();
  for (const r of rows) {
    if (!r.checked) continue;
    const key = r.itemId ?? `text:${r.displayName.toLowerCase()}`;
    const cur = counts.get(key);
    if (cur) cur.count += 1;
    else counts.set(key, { displayName: r.displayName, count: 1 });
  }
  return [...counts.entries()]
    .map(([key, v]) => ({ key, displayName: v.displayName, count: v.count }))
    .sort((a, b) => b.count - a.count || a.displayName.localeCompare(b.displayName));
}
