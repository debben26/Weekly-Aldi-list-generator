import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getDefaultHousehold } from "@/lib/context";
import { createMealPlan } from "./actions";

export const dynamic = "force-dynamic";

function nextSunday(): string {
  const d = new Date();
  d.setDate(d.getDate() + ((7 - d.getDay()) % 7 || 7));
  return d.toISOString().slice(0, 10);
}

export default async function MealPlanPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const household = await getDefaultHousehold();
  const plans = await prisma.mealPlan.findMany({
    where: { householdId: household.id },
    orderBy: { weekStartDate: "desc" },
    include: { _count: { select: { entries: true } } },
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Meal Plan</h1>
        <p className="mt-1 text-sm text-gray-500">
          Pick a week, then select ~3–4 recipes. Their scaled ingredients feed the grocery list.
        </p>
      </div>

      {error ? (
        <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <form
        action={createMealPlan}
        className="flex items-end gap-3 rounded-lg border border-gray-200 bg-white p-4"
      >
        <label className="text-sm">
          <span className="mb-1 block text-xs text-gray-500">Week starting</span>
          <input
            name="weekStartDate"
            type="date"
            defaultValue={nextSunday()}
            className="input"
          />
        </label>
        <button className="rounded bg-gray-900 px-4 py-2 text-sm text-white hover:bg-gray-700">
          Create plan
        </button>
      </form>

      <ul className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        {plans.length === 0 ? (
          <li className="px-4 py-3 text-sm text-gray-400">No plans yet.</li>
        ) : (
          plans.map((p) => (
            <li key={p.id} className="border-b border-gray-100 last:border-b-0">
              <Link
                href={`/meal-plan/${p.id}`}
                className="flex items-center justify-between px-4 py-3 text-sm hover:bg-gray-50"
              >
                <span className="font-medium">
                  Week of {p.weekStartDate.toISOString().slice(0, 10)}
                </span>
                <span className="text-gray-500">
                  {p._count.entries} recipe{p._count.entries === 1 ? "" : "s"} · {p.status}
                </span>
              </Link>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
