import Link from "next/link";
import SelectAllCheckboxesButton from "@/components/SelectAllCheckboxesButton";
import SubmitButton from "@/components/SubmitButton";
import ManualListItemForm from "@/components/ManualListItemForm";
import { prisma } from "@/lib/prisma";
import { getPlanWithList } from "../data";
import { saveStapleSelections, addStapleItem, removeStapleItem } from "../actions";

export const dynamic = "force-dynamic";

export default async function StaplesStep({
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

  const [staples, sections, items] = await Promise.all([
    prisma.stapleRule.findMany({
      where: { householdId: plan.householdId, ruleType: "weekly", active: true },
      include: { item: { include: { defaultSection: true } }, defaultSection: true },
      orderBy: { item: { canonicalName: "asc" } },
    }),
    prisma.storeSection.findMany({ where: { storeId: store.id }, orderBy: { sortOrder: "asc" } }),
    prisma.item.findMany({
      where: { active: true },
      orderBy: { canonicalName: "asc" },
      select: { id: true, canonicalName: true },
    }),
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

  // Items already carrying weekly_staple provenance on the draft list. Mere list presence (a
  // recipe ingredient or manual add) does NOT pre-check a staple — unchecking only ever strips
  // staple provenance, so it must mirror what saveStapleSelections acts on.
  const stapled = new Set(
    list.items
      .filter((i) => i.sources.some((s) => s.sourceType === "weekly_staple"))
      .map((i) => i.itemId)
      .filter(Boolean) as string[],
  );
  // One-off items added on this step (purely manual provenance) - shown so they appear right away.
  const added = list.items.filter(
    (i) => i.sources.length > 0 && i.sources.every((s) => s.sourceType === "manual"),
  );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-aldi-navy">Weekly staples</h1>
        <p className="mt-1 text-sm text-gray-500">
          Check the staples you want this week. Anything left unchecked won&apos;t go on your
          list.
        </p>
      </div>

      {error ? (
        <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-aldi-red">
          {error}
        </div>
      ) : null}

      <form id="staples-form" action={saveStapleSelections} className="space-y-5">
        <input type="hidden" name="planId" value={planId} />
        <input type="hidden" name="listId" value={list.id} />
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
                {g.items.map((s) => (
                  <li key={s.id}>
                    <label className="flex cursor-pointer items-center gap-3 px-4 py-2 hover:bg-gray-50">
                      <input
                        type="checkbox"
                        name="ruleIds"
                        value={s.id}
                        defaultChecked={stapled.has(s.itemId)}
                        className="peer h-4 w-4 accent-aldi-navy"
                      />
                      <span className="text-sm text-gray-500 peer-checked:text-gray-900">
                        {s.item.canonicalName}
                        {s.defaultQuantity ? (
                          <span className="ml-2 text-xs text-gray-400">
                            {s.defaultQuantity} {s.defaultUnit ?? s.item.purchaseUnit}
                          </span>
                        ) : null}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
        <div className="flex justify-end">
          <SubmitButton className="rounded bg-green-700 px-4 py-2 text-sm text-white hover:bg-green-800">
            Save &amp; Continue
          </SubmitButton>
        </div>
      </form>

      {staples.length > 0 ? (
        <div className="flex justify-start">
          <SelectAllCheckboxesButton formId="staples-form" name="ruleIds" />
        </div>
      ) : null}

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
                  <input type="hidden" name="step" value="staples" />
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
          action={addStapleItem}
          listId={list.id}
          planId={planId}
          step="staples"
          items={items}
          sections={sections}
        />
      </section>
    </div>
  );
}
