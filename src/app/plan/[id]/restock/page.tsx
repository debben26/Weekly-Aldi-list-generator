import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getRestockSuggestions } from "@/app/staples/data";
import ManualListItemForm from "@/components/ManualListItemForm";
import SelectAllCheckboxesButton from "@/components/SelectAllCheckboxesButton";
import SubmitButton from "@/components/SubmitButton";
import { getPlanWithList } from "../data";
import { addRestockManualItem, removeStapleItem, saveRestockSelections } from "../actions";

export const dynamic = "force-dynamic";

const STATE_STYLES: Record<string, { label: string; cls: string }> = {
  due: { label: "Due", cls: "bg-red-100 text-aldi-red" },
  maybe_due: { label: "Maybe due", cls: "bg-amber-100 text-amber-800" },
  not_due: { label: "Not due", cls: "bg-gray-100 text-gray-500" },
  snoozed: { label: "Snoozed", cls: "bg-gray-100 text-gray-400" },
  no_cadence: { label: "No cadence", cls: "bg-blue-100 text-blue-700" },
};

export default async function RestockStep({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id: planId } = await params;
  const { error } = await searchParams;
  const data = await getPlanWithList(planId);

  if (!data) return null;
  const { store, list } = data;

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

  const [restock, sections, items] = await Promise.all([
    getRestockSuggestions(),
    prisma.storeSection.findMany({ where: { storeId: store.id }, orderBy: { sortOrder: "asc" } }),
    prisma.item.findMany({
      where: { active: true },
      orderBy: { canonicalName: "asc" },
      select: { id: true, canonicalName: true },
    }),
  ]);

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
  const added = list.items.filter(
    (i) => i.sources.length > 0 && i.sources.every((s) => s.sourceType === "manual"),
  );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-aldi-navy">Restock items</h1>
        <p className="mt-1 text-sm text-gray-500">
          Things you buy occasionally. Check any that are running low this week — anything left
          unchecked won&apos;t go on your list.
        </p>
      </div>

      {error ? (
        <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-aldi-red">
          {error}
        </div>
      ) : null}

      <form id="restock-form" action={saveRestockSelections} className="space-y-5">
        <input type="hidden" name="planId" value={planId} />
        <input type="hidden" name="listId" value={list.id} />
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
                  const style = STATE_STYLES[r.evaluation.state] ?? STATE_STYLES.not_due;
                  return (
                    <li key={r.rule.id}>
                      <label className="flex cursor-pointer items-center gap-3 px-4 py-2 hover:bg-gray-50">
                        <input
                          type="checkbox"
                          name="ruleIds"
                          value={r.rule.id}
                          defaultChecked={restocked.has(r.rule.itemId)}
                          className="peer h-4 w-4 accent-aldi-navy"
                        />
                        <span className="flex items-center gap-2 text-sm text-gray-500 peer-checked:text-gray-900">
                          {r.rule.itemName}
                          <span className={`rounded-full px-2 py-0.5 text-xs ${style.cls}`}>
                            {style.label}
                          </span>
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))
        )}

        <div className="flex items-center justify-between">
          {restock.length > 0 ? (
            <div className="flex gap-2">
              <SelectAllCheckboxesButton formId="restock-form" name="ruleIds" />
              <SelectAllCheckboxesButton formId="restock-form" name="ruleIds" checked={false}>
                Deselect all
              </SelectAllCheckboxesButton>
            </div>
          ) : (
            <span />
          )}
          <SubmitButton className="rounded bg-green-700 px-4 py-2 text-sm text-white hover:bg-green-800">
            Save &amp; Continue →
          </SubmitButton>
        </div>
      </form>

      {added.length > 0 ? (
        <section className="card">
          <h2 className="border-b border-gray-100 px-4 py-2 text-sm font-semibold text-gray-700">
            Added this week
          </h2>
          <ul className="divide-y divide-gray-50">
            {added.map((i) => (
              <li key={i.id} className="flex items-center gap-3 px-4 py-2">
                <span className="text-sm">
                  {i.displayName}
                  {i.quantity != null || i.unit ? (
                    <span className="ml-2 text-xs text-gray-400">
                      {[i.quantity, i.unit].filter(Boolean).join(" ")}
                    </span>
                  ) : null}
                </span>
                <form action={removeStapleItem}>
                  <input type="hidden" name="planId" value={planId} />
                  <input type="hidden" name="step" value="restock" />
                  <input type="hidden" name="id" value={i.id} />
                  <SubmitButton pendingChildren="Removing..." className="btn-secondary text-xs">
                    Remove
                  </SubmitButton>
                </form>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="card p-4">
        <h2 className="mb-2 font-semibold">Add an item</h2>
        <ManualListItemForm
          action={addRestockManualItem}
          listId={list.id}
          planId={planId}
          step="restock"
          items={items}
          sections={sections}
        />
      </section>
    </div>
  );
}
