import Link from "next/link";
import { getRestockSuggestions } from "@/app/staples/data";
import { getPlanWithList } from "../data";
import { includeRestock, excludeRestock } from "../actions";

export const dynamic = "force-dynamic";

const STATE_STYLES: Record<string, { label: string; cls: string }> = {
  due: { label: "Due", cls: "bg-red-100 text-aldi-red" },
  maybe_due: { label: "Maybe due", cls: "bg-amber-100 text-amber-800" },
  not_due: { label: "Not due", cls: "bg-gray-100 text-gray-500" },
  snoozed: { label: "Snoozed", cls: "bg-gray-100 text-gray-400" },
  no_cadence: { label: "No cadence", cls: "bg-blue-100 text-blue-700" },
};

export default async function RestockStep({ params }: { params: Promise<{ id: string }> }) {
  const { id: planId } = await params;
  const data = await getPlanWithList(planId);

  if (!data) return null;
  const { list } = data;

  if (!list) {
    return (
      <div className="card p-6">
        <p className="text-sm text-gray-600">
          Pick your meals first — your grocery list is created when you use them.
        </p>
        <Link
          href={`/plan/${planId}/meals`}
          className="mt-3 inline-block rounded bg-aldi-navy px-4 py-2 text-sm text-white hover:bg-aldi-navy/90"
        >
          ← Back to Meals
        </Link>
      </div>
    );
  }

  const restock = await getRestockSuggestions();

  // Items already carrying a restock source on the draft list.
  const restocked = new Set(
    list.items
      .filter((i) => i.sources.some((s) => s.sourceType === "restock"))
      .map((i) => i.itemId)
      .filter(Boolean) as string[],
  );

  // Group restock suggestions by store section; null section -> a trailing bucket. Each
  // suggestion already carries its section name and sort order from getRestockSuggestions.
  const restockGroups = new Map<string, { name: string; sort: number; items: typeof restock }>();
  for (const r of restock) {
    const name = r.rule.sectionName ?? "Other";
    if (!restockGroups.has(name)) restockGroups.set(name, { name, sort: r.sectionSortOrder, items: [] });
    restockGroups.get(name)!.items.push(r);
  }
  const orderedRestockGroups = [...restockGroups.values()].sort((a, b) => a.sort - b.sort);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-aldi-navy">Restock items</h1>
        <p className="mt-1 text-sm text-gray-500">
          Things you buy occasionally. Add any that are running low this week.
        </p>
      </div>

      {restock.length === 0 ? (
        <section className="card">
          <p className="px-4 py-3 text-sm text-gray-500">No restock items set up yet.</p>
        </section>
      ) : (
        orderedRestockGroups.map((g) => (
          <section key={g.name} className="card">
            <h2 className="border-b border-gray-100 px-4 py-2 text-sm font-semibold text-gray-700">
              {g.name} <span className="font-normal text-gray-400">({g.items.length})</span>
            </h2>
            <ul className="divide-y divide-gray-50">
              {g.items.map((r) => {
                const included = restocked.has(r.rule.itemId);
                const style = STATE_STYLES[r.evaluation.state] ?? STATE_STYLES.not_due;
                return (
                  <li key={r.rule.id} className="flex items-center justify-between px-4 py-2">
                    <span className="flex items-center gap-2 text-sm">
                      <span className={included ? "" : "text-gray-700"}>{r.rule.itemName}</span>
                      <span className={`rounded-full px-2 py-0.5 text-xs ${style.cls}`}>{style.label}</span>
                    </span>
                    {included ? (
                      <form action={excludeRestock}>
                        <input type="hidden" name="planId" value={planId} />
                        <input type="hidden" name="listId" value={list.id} />
                        <input type="hidden" name="itemId" value={r.rule.itemId} />
                        <button className="btn-secondary text-xs">
                          Remove
                        </button>
                      </form>
                    ) : (
                      <form action={includeRestock}>
                        <input type="hidden" name="planId" value={planId} />
                        <input type="hidden" name="listId" value={list.id} />
                        <input type="hidden" name="ruleId" value={r.rule.id} />
                        <button className="btn-secondary text-xs">
                          + Add
                        </button>
                      </form>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}

      <div className="flex justify-end">
        <Link
          href={`/plan/${planId}/final`}
          className="rounded bg-green-700 px-4 py-2 text-sm text-white hover:bg-green-800"
        >
          Generate Final List →
        </Link>
      </div>
    </div>
  );
}
