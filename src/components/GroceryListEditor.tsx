import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getRestockSuggestions } from "@/app/staples/data";
import { estimateListOrder } from "@/app/grocery-list/estimate";
import OrderEstimatePanel from "@/components/OrderEstimatePanel";
import {
  updateListItem,
  toggleChecked,
  removeListItem,
  addManualItem,
  addRestockToList,
  finalizeTrip,
} from "@/app/grocery-list/actions";

function fmtQ(n: number | null): string {
  if (n == null) return "";
  return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(3)));
}

// Section-grouped grocery list editor: check off, edit, remove, add manual items, add due restock,
// see the order estimate, print, and complete the trip. Shared by /grocery-list/[id] and the
// planning wizard's Final List step so both stay in sync.
export default async function GroceryListEditor({
  listId,
  error,
}: {
  listId: string;
  error?: string;
}) {
  const list = await prisma.shoppingList.findUnique({
    where: { id: listId },
    include: {
      store: true,
      items: { include: { section: true, sources: true }, orderBy: { displayName: "asc" } },
    },
  });
  if (!list) notFound();

  const [sections, restock, orderEstimate] = await Promise.all([
    prisma.storeSection.findMany({ where: { storeId: list.storeId }, orderBy: { sortOrder: "asc" } }),
    getRestockSuggestions(),
    estimateListOrder(list.id),
  ]);

  // Group items by section in route order; unknown/null section -> a trailing bucket.
  const sectionOrder = new Map(sections.map((s, i) => [s.id, i]));
  const groups = new Map<string, { id: string; name: string; sort: number; items: typeof list.items }>();
  for (const it of list.items) {
    const key = it.sectionId ?? "none";
    const name = it.section?.name ?? "Other / Unassigned";
    const sort = it.sectionId ? (sectionOrder.get(it.sectionId) ?? 9999) : 10000;
    if (!groups.has(key)) groups.set(key, { id: key, name, sort, items: [] });
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

      {orderEstimate && orderEstimate.totalLines > 0 ? (
        <OrderEstimatePanel estimate={orderEstimate} />
      ) : null}

      {orderedGroups.map((g) => (
        <section key={g.id} className="rounded-lg border border-gray-200 bg-white">
          <h2 className="border-b border-gray-100 px-4 py-2 text-sm font-semibold text-gray-700">
            {g.name} <span className="font-normal text-gray-400">({g.items.length})</span>
          </h2>
          <ul className="divide-y divide-gray-50">
            {g.items.map((it) => {
              // Plain quantity text — no dash, no "needs:", no source labels. Falls back to the
              // first source's unit when the row has no merged total (e.g. "bag").
              const src = it.sources[0];
              const qtyText =
                it.quantity != null
                  ? `${fmtQ(it.quantity)} ${it.unit ?? ""}`.trim()
                  : src
                    ? `${fmtQ(src.quantity)} ${src.unit ?? ""}`.trim()
                    : "";
              return (
                <li key={it.id} className="flex flex-wrap items-center gap-2 px-4 py-2">
                  <form action={toggleChecked}>
                    <input type="hidden" name="id" value={it.id} />
                    <input type="hidden" name="listId" value={list.id} />
                    <input type="hidden" name="checked" value={it.checked ? "false" : "true"} />
                    <button className="text-lg leading-none" aria-label="toggle checked">
                      {it.checked ? "☑" : "☐"}
                    </button>
                  </form>
                  <span
                    className={`w-56 shrink-0 truncate text-sm ${
                      it.checked ? "text-gray-400 line-through" : ""
                    }`}
                  >
                    <span className="font-medium">{it.displayName}</span>
                    {qtyText ? <span className="ml-1 text-gray-500">{qtyText}</span> : null}
                  </span>

                  <form action={updateListItem} className="flex flex-wrap items-center gap-1.5">
                    <input type="hidden" name="id" value={it.id} />
                    <input type="hidden" name="listId" value={list.id} />
                    <input name="quantity" type="number" step="any" defaultValue={it.quantity ?? ""} placeholder="qty" className="input w-14" />
                    <input name="unit" defaultValue={it.unit ?? ""} placeholder="unit" className="input w-16" />
                    <select name="sectionId" defaultValue={it.sectionId ?? ""} className="input w-32">
                      <option value="">— Other —</option>
                      {sections.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                    <input name="notes" defaultValue={it.notes ?? ""} placeholder="notes" className="input w-28" />
                    <button className="rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-100">Save</button>
                    <button
                      formAction={removeListItem}
                      className="rounded border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                    >
                      Remove
                    </button>
                  </form>
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
              <option value="">— Other —</option>
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
