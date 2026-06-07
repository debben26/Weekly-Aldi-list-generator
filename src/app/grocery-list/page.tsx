import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getDefaultHousehold } from "@/lib/context";
import { generateList } from "./actions";

export const dynamic = "force-dynamic";

export default async function GroceryListIndex({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const household = await getDefaultHousehold();

  const [plans, lists] = await Promise.all([
    prisma.mealPlan.findMany({
      where: { householdId: household.id },
      orderBy: { weekStartDate: "desc" },
      include: { _count: { select: { entries: true } } },
    }),
    prisma.shoppingList.findMany({
      where: { householdId: household.id },
      orderBy: { weekStart: "desc" },
      include: { _count: { select: { items: true } } },
    }),
  ]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Grocery List</h1>
        <p className="mt-1 text-sm text-gray-500">
          Generate a merged, route-sorted list from a meal plan&rsquo;s staples + scaled recipes,
          then edit and print it.
        </p>
      </div>

      {error ? (
        <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <form
        action={generateList}
        className="flex items-end gap-3 rounded-lg border border-gray-200 bg-white p-4"
      >
        <label className="text-sm">
          <span className="mb-1 block text-xs text-gray-500">Meal plan</span>
          <select name="mealPlanId" required className="input w-72" defaultValue="">
            <option value="">— choose a plan —</option>
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                Week of {p.weekStartDate.toISOString().slice(0, 10)} ({p._count.entries} recipes)
              </option>
            ))}
          </select>
        </label>
        <button className="rounded bg-gray-900 px-4 py-2 text-sm text-white hover:bg-gray-700">
          Generate list
        </button>
      </form>
      <p className="-mt-3 text-xs text-gray-400">
        Generating replaces any existing list for that week.
      </p>

      <ul className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        {lists.length === 0 ? (
          <li className="px-4 py-3 text-sm text-gray-400">No lists yet.</li>
        ) : (
          lists.map((l) => (
            <li key={l.id} className="border-b border-gray-100 last:border-b-0">
              <Link
                href={`/grocery-list/${l.id}`}
                className="flex items-center justify-between px-4 py-3 text-sm hover:bg-gray-50"
              >
                <span className="font-medium">
                  Week of {l.weekStart.toISOString().slice(0, 10)}
                </span>
                <span className="text-gray-500">
                  {l._count.items} items · {l.status}
                </span>
              </Link>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
