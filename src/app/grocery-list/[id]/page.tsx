import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getRestockSuggestions } from "@/app/staples/data";
import {
  updateListItem,
  toggleChecked,
  removeListItem,
  addManualItem,
  addRestockToList,
  finalizeTrip,
} from "../actions";

export const dynamic = "force-dynamic";

const SOURCE_LABELS: Record<string, string> = {
  weekly_staple: "Weekly Staples",
  restock: "Restock",
  pantry_review: "Pantry",
  manual: "Manual",
  recipe: "Recipe",
};

function fmtQ(n: number | null): string {
  if (n == null) return "";
  return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(3)));
}
function money(d: { toString(): string } | null): string {
  return d == null ? "" : Number(d.toString()).toFixed(2);
}

export default async function GroceryListDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;

  const list = await prisma.shoppingList.findUnique({
    where: { id },
    include: {
      store: true,
      items: { include: { section: true, sources: true }, orderBy: { displayName: "asc" } },
    },
  });
  if (!list) notFound();

  const [sections, restock] = await Promise.all([
    prisma.storeSection.findMany({ where: { storeId: list.storeId }, orderBy: { sortOrder: "asc" } }),
    getRestockSuggestions(),
  ]);

  // Recipe titles for source labels.
  const recipeIds = [
    ...new Set(list.items.flatMap((i) => i.sources.map((s) => s.recipeId).filter(Boolean))),
  ] as string[];
  const recipeTitles = new Map(
    (await prisma.recipe.findMany({ where: { id: { in: recipeIds } }, select: { id: true, title: true } })).map(
      (r) => [r.id, r.title],
    ),
  );
  const labelFor = (s: { recipeId: string | null; sourceType: string }) =>
    s.recipeId ? (recipeTitles.get(s.recipeId) ?? "Recipe") : SOURCE_LABELS[s.sourceType];

  // Group items by section in route order; unknown/null section -> a trailing bucket.
  const sectionOrder = new Map(sections.map((s, i) => [s.id, i]));
  const groups = new Map<string, { name: string; sort: number; items: typeof list.items }>();
  for (const it of list.items) {
    const key = it.sectionId ?? "none";
    const name = it.section?.name ?? "Other / Unassigned";
    const sort = it.sectionId ? (sectionOrder.get(it.sectionId) ?? 9999) : 10000;
    if (!groups.has(key)) groups.set(key, { name, sort, items: [] });
    groups.get(key)!.items.push(it);
  }
  const orderedGroups = [...groups.values()].sort((a, b) => a.sort - b.sort);

  const estTotal = list.items.reduce((t, i) => t + (i.estimatedPrice ? Number(i.estimatedPrice) : 0), 0);
  const checkedCount = list.items.filter((i) => i.checked).length;
  // Disable a restock add only when that item's row already carries a restock source — an item
  // present merely as a staple/recipe ingredient can still have restock provenance added (6.10/6.11).
  const restockedItems = new Set(
    list.items
      .filter((i) => i.sources.some((s) => s.sourceType === "restock"))
      .map((i) => i.itemId)
      .filter(Boolean),
  );
  const dueRestock = restock.filter(
    (r) => (r.evaluation.state === "due" || r.evaluation.state === "maybe_due"),
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">
            Grocery List · week of {list.weekStart.toISOString().slice(0, 10)}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            {list.store.brand} · {list.store.name} — {list.items.length} items, {checkedCount}{" "}
            checked{estTotal > 0 ? ` · est. $${estTotal.toFixed(2)}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/grocery-list/${list.id}/print`}
            className="rounded border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-100"
          >
            Print
          </Link>
          {list.status === "completed" ? (
            <span className="rounded bg-green-100 px-3 py-1.5 text-sm text-green-700">
              Trip completed
            </span>
          ) : (
            <form action={finalizeTrip}>
              <input type="hidden" name="listId" value={list.id} />
              <button className="rounded bg-green-700 px-3 py-1.5 text-sm text-white hover:bg-green-800">
                Complete trip
              </button>
            </form>
          )}
          <Link href="/grocery-list" className="rounded px-3 py-1.5 text-sm text-gray-500 hover:text-gray-900">
            ← All lists
          </Link>
        </div>
      </div>

      {error ? (
        <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {orderedGroups.map((g) => (
        <section key={g.name} className="rounded-lg border border-gray-200 bg-white">
          <h2 className="border-b border-gray-100 px-4 py-2 text-sm font-semibold text-gray-700">
            {g.name} <span className="font-normal text-gray-400">({g.items.length})</span>
          </h2>
          <ul className="divide-y divide-gray-50">
            {g.items.map((it) => {
              const breakdown =
                it.quantity == null && it.sources.length > 0
                  ? it.sources
                      .map((s) => `${fmtQ(s.quantity)} ${s.unit ?? ""} [${labelFor(s)}]`.replace(/\s+/g, " ").trim())
                      .join(" + ")
                  : null;
              return (
                <li key={it.id} className="px-4 py-2">
                  <div className="flex items-center gap-3">
                    <form action={toggleChecked}>
                      <input type="hidden" name="id" value={it.id} />
                      <input type="hidden" name="listId" value={list.id} />
                      <input type="hidden" name="checked" value={it.checked ? "false" : "true"} />
                      <button className="text-lg leading-none" aria-label="toggle checked">
                        {it.checked ? "☑" : "☐"}
                      </button>
                    </form>
                    <span className={`flex-1 text-sm ${it.checked ? "text-gray-400 line-through" : ""}`}>
                      <span className="font-medium">{it.displayName}</span>{" "}
                      {it.quantity != null ? (
                        <span className="text-gray-600">
                          — {fmtQ(it.quantity)} {it.unit ?? ""}
                        </span>
                      ) : breakdown ? (
                        <span className="text-amber-700">— needs: {breakdown}</span>
                      ) : null}
                      <span className="ml-2 text-xs text-gray-400">{it.sourceSummary}</span>
                    </span>
                  </div>

                  <details className="ml-9 mt-1">
                    <summary className="cursor-pointer text-xs text-gray-400">edit</summary>
                    <form action={updateListItem} className="mt-2 flex flex-wrap items-end gap-2">
                      <input type="hidden" name="id" value={it.id} />
                      <input type="hidden" name="listId" value={list.id} />
                      <L label="Qty">
                        <input name="quantity" type="number" step="any" defaultValue={it.quantity ?? ""} className="input w-20" />
                      </L>
                      <L label="Unit">
                        <input name="unit" defaultValue={it.unit ?? ""} className="input w-24" />
                      </L>
                      <L label="Section">
                        <select name="sectionId" defaultValue={it.sectionId ?? ""} className="input w-40">
                          <option value="">— Other / Unassigned —</option>
                          {sections.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                        </select>
                      </L>
                      <L label="Est $">
                        <input name="estimatedPrice" type="number" step="0.01" defaultValue={money(it.estimatedPrice)} className="input w-20" />
                      </L>
                      <L label="Paid $">
                        <input name="paidPrice" type="number" step="0.01" defaultValue={money(it.paidPrice)} className="input w-20" />
                      </L>
                      <L label="Notes">
                        <input name="notes" defaultValue={it.notes ?? ""} className="input w-40" />
                      </L>
                      <button className="rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-100">Save</button>
                      <button
                        formAction={removeListItem}
                        className="rounded border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                      >
                        Remove
                      </button>
                    </form>
                  </details>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {/* Add manual item */}
      <section className="rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="mb-2 font-semibold">Add manual item</h2>
        <form action={addManualItem} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="listId" value={list.id} />
          <L label="Name *">
            <input name="displayName" required className="input w-48" placeholder="e.g. Birthday candles" />
          </L>
          <L label="Qty">
            <input name="quantity" type="number" step="any" className="input w-20" />
          </L>
          <L label="Unit">
            <input name="unit" className="input w-24" />
          </L>
          <L label="Section">
            <select name="sectionId" className="input w-40" defaultValue="">
              <option value="">— Other / Unassigned —</option>
              {sections.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </L>
          <button className="rounded bg-gray-900 px-3 py-1.5 text-sm text-white hover:bg-gray-700">Add</button>
        </form>
      </section>

      {/* Add due restock items */}
      {dueRestock.length > 0 ? (
        <section className="rounded-lg border border-gray-200 bg-white p-4">
          <h2 className="mb-2 font-semibold">Add due restock</h2>
          <ul className="flex flex-wrap gap-2">
            {dueRestock.map((r) => (
              <li key={r.rule.id}>
                <form action={addRestockToList}>
                  <input type="hidden" name="listId" value={list.id} />
                  <input type="hidden" name="ruleId" value={r.rule.id} />
                  <button
                    disabled={restockedItems.has(r.rule.itemId)}
                    className="rounded-full border border-gray-300 px-3 py-1 text-sm hover:bg-gray-100 disabled:opacity-40"
                  >
                    + {r.rule.itemName} ({r.evaluation.state.replace("_", " ")})
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function L({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="text-xs text-gray-500">
      <span className="mb-0.5 block">{label}</span>
      {children}
    </label>
  );
}
