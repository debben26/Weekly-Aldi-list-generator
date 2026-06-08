import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { addManualItem } from "@/app/grocery-list/actions";
import { getPlanWithList } from "../data";
import { includeStaple, excludeStaple } from "../actions";

export const dynamic = "force-dynamic";

export default async function StaplesStep({ params }: { params: Promise<{ id: string }> }) {
  const { id: planId } = await params;
  const data = await getPlanWithList(planId);

  if (!data) return null;
  const { plan, store, list } = data;

  if (!list) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <p className="text-sm text-gray-600">
          Pick your meals first — your grocery list is created when you use them.
        </p>
        <Link
          href={`/plan/${planId}/meals`}
          className="mt-3 inline-block rounded bg-gray-900 px-4 py-2 text-sm text-white hover:bg-gray-700"
        >
          ← Back to Meals
        </Link>
      </div>
    );
  }

  const [staples, sections] = await Promise.all([
    prisma.stapleRule.findMany({
      where: { householdId: plan.householdId, ruleType: "weekly", active: true },
      include: { item: true },
      orderBy: { item: { canonicalName: "asc" } },
    }),
    prisma.storeSection.findMany({ where: { storeId: store.id }, orderBy: { sortOrder: "asc" } }),
  ]);

  const onList = new Set(list.items.map((i) => i.itemId).filter(Boolean) as string[]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Weekly staples</h1>
        <p className="mt-1 text-sm text-gray-500">
          These are added by default. Uncheck anything you don&apos;t need this week.
        </p>
      </div>

      <section className="rounded-lg border border-gray-200 bg-white">
        {staples.length === 0 ? (
          <p className="px-4 py-3 text-sm text-gray-500">No weekly staples set up yet.</p>
        ) : (
          <ul className="divide-y divide-gray-50">
            {staples.map((s) => {
              const included = onList.has(s.itemId);
              return (
                <li key={s.id} className="flex items-center justify-between px-4 py-2">
                  <span className={`text-sm ${included ? "" : "text-gray-400"}`}>
                    {s.item.canonicalName}
                    {s.defaultQuantity ? (
                      <span className="ml-2 text-xs text-gray-400">
                        {s.defaultQuantity} {s.defaultUnit ?? s.item.purchaseUnit}
                      </span>
                    ) : null}
                  </span>
                  {included ? (
                    <form action={excludeStaple}>
                      <input type="hidden" name="planId" value={planId} />
                      <input type="hidden" name="listId" value={list.id} />
                      <input type="hidden" name="itemId" value={s.itemId} />
                      <button className="rounded border border-gray-300 px-2.5 py-1 text-xs hover:bg-gray-100">
                        Exclude
                      </button>
                    </form>
                  ) : (
                    <form action={includeStaple}>
                      <input type="hidden" name="planId" value={planId} />
                      <input type="hidden" name="listId" value={list.id} />
                      <input type="hidden" name="ruleId" value={s.id} />
                      <button className="rounded border border-gray-300 px-2.5 py-1 text-xs hover:bg-gray-100">
                        Include
                      </button>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="mb-2 font-semibold">Add an item</h2>
        <form action={addManualItem} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="listId" value={list.id} />
          <label className="text-xs text-gray-500">
            <span className="mb-0.5 block">Name *</span>
            <input name="displayName" required className="input w-48" placeholder="e.g. Bananas" />
          </label>
          <label className="text-xs text-gray-500">
            <span className="mb-0.5 block">Qty</span>
            <input name="quantity" type="number" step="any" className="input w-20" />
          </label>
          <label className="text-xs text-gray-500">
            <span className="mb-0.5 block">Unit</span>
            <input name="unit" className="input w-24" />
          </label>
          <label className="text-xs text-gray-500">
            <span className="mb-0.5 block">Section</span>
            <select name="sectionId" className="input w-40" defaultValue="">
              <option value="">— Other / Unassigned —</option>
              {sections.map((sec) => (
                <option key={sec.id} value={sec.id}>
                  {sec.name}
                </option>
              ))}
            </select>
          </label>
          <button className="rounded bg-gray-900 px-3 py-1.5 text-sm text-white hover:bg-gray-700">
            Add
          </button>
        </form>
      </section>

      <div className="flex justify-end">
        <Link
          href={`/plan/${planId}/restock`}
          className="rounded bg-green-700 px-4 py-2 text-sm text-white hover:bg-green-800"
        >
          Continue to Restock →
        </Link>
      </div>
    </div>
  );
}
