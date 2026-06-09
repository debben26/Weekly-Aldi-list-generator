import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getPlanWithList } from "../data";
import { includeStaple, excludeStaple, addStapleItem, removeStapleItem } from "../actions";

export const dynamic = "force-dynamic";

export default async function StaplesStep({ params }: { params: Promise<{ id: string }> }) {
  const { id: planId } = await params;
  const data = await getPlanWithList(planId);

  if (!data) return null;
  const { plan, store, list } = data;

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

  const [staples, sections] = await Promise.all([
    prisma.stapleRule.findMany({
      where: { householdId: plan.householdId, ruleType: "weekly", active: true },
      include: { item: { include: { defaultSection: true } }, defaultSection: true },
      orderBy: { item: { canonicalName: "asc" } },
    }),
    prisma.storeSection.findMany({ where: { storeId: store.id }, orderBy: { sortOrder: "asc" } }),
  ]);

  // Group staples by store section in route order; unknown/null section -> a trailing bucket.
  const sectionOrder = new Map(sections.map((s, i) => [s.id, i]));
  const stapleGroups = new Map<
    string,
    { id: string; name: string; sort: number; items: typeof staples }
  >();
  for (const s of staples) {
    const section = s.defaultSection ?? s.item.defaultSection;
    const key = section?.id ?? "none";
    const name = section?.name ?? "Other";
    const sort = section ? (sectionOrder.get(section.id) ?? 9999) : 10000;
    if (!stapleGroups.has(key)) stapleGroups.set(key, { id: key, name, sort, items: [] });
    stapleGroups.get(key)!.items.push(s);
  }
  const orderedStapleGroups = [...stapleGroups.values()].sort((a, b) => a.sort - b.sort);

  const onList = new Set(list.items.map((i) => i.itemId).filter(Boolean) as string[]);
  // One-off items added on this step (purely manual provenance) — shown so they appear right away.
  const added = list.items.filter(
    (i) => i.sources.length > 0 && i.sources.every((s) => s.sourceType === "manual"),
  );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-aldi-navy">Weekly staples</h1>
        <p className="mt-1 text-sm text-gray-500">
          These are added by default. Uncheck anything you don&apos;t need this week.
        </p>
      </div>

      {staples.length === 0 ? (
        <section className="card">
          <p className="px-4 py-3 text-sm text-gray-500">No weekly staples set up yet.</p>
        </section>
      ) : (
        orderedStapleGroups.map((g) => (
          <section key={g.id} className="card">
            <h2 className="border-b border-gray-100 px-4 py-2 text-sm font-semibold text-gray-700">
              {g.name} <span className="font-normal text-gray-400">({g.items.length})</span>
            </h2>
            <ul className="divide-y divide-gray-50">
              {g.items.map((s) => {
                const included = onList.has(s.itemId);
                return (
                  <li key={s.id} className="flex items-center gap-3 px-4 py-2">
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
                        <button className="btn-secondary text-xs">
                          Exclude
                        </button>
                      </form>
                    ) : (
                      <form action={includeStaple}>
                        <input type="hidden" name="planId" value={planId} />
                        <input type="hidden" name="listId" value={list.id} />
                        <input type="hidden" name="ruleId" value={s.id} />
                        <button className="btn-secondary text-xs">
                          Include
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
                  <input type="hidden" name="id" value={i.id} />
                  <button className="btn-secondary text-xs">
                    Remove
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="card p-4">
        <h2 className="mb-2 font-semibold">Add an item</h2>
        <form action={addStapleItem} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="planId" value={planId} />
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
              <option value="">— Other —</option>
              {sections.map((sec) => (
                <option key={sec.id} value={sec.id}>
                  {sec.name}
                </option>
              ))}
            </select>
          </label>
          <button className="rounded bg-aldi-navy px-3 py-1.5 text-sm text-white hover:bg-aldi-navy/90">
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
