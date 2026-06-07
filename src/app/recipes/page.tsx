import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getDefaultHousehold } from "@/lib/context";

export const dynamic = "force-dynamic";

const FIT_STYLES: Record<string, string> = {
  good: "bg-green-100 text-green-700",
  medium: "bg-amber-100 text-amber-700",
  low: "bg-red-100 text-red-700",
  unknown: "bg-gray-100 text-gray-500",
};

export default async function RecipesPage() {
  const household = await getDefaultHousehold();
  const recipes = await prisma.recipe.findMany({
    where: { householdId: household.id },
    orderBy: [{ favorite: "desc" }, { title: "asc" }],
    include: { _count: { select: { ingredients: true } } },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Recipes</h1>
          <p className="mt-1 text-sm text-gray-500">
            {recipes.length} recipe{recipes.length === 1 ? "" : "s"}. Map ingredients to items
            for better merging and Aldi-fit.
          </p>
        </div>
        <Link
          href="/recipes/new"
          className="rounded bg-gray-900 px-3 py-1.5 text-sm text-white hover:bg-gray-700"
        >
          + New recipe
        </Link>
      </div>

      <ul className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        {recipes.length === 0 ? (
          <li className="px-4 py-3 text-sm text-gray-400">No recipes yet.</li>
        ) : (
          recipes.map((r) => (
            <li key={r.id} className="border-b border-gray-100 last:border-b-0">
              <Link
                href={`/recipes/${r.id}`}
                className="flex items-center justify-between px-4 py-3 text-sm hover:bg-gray-50"
              >
                <span className="flex items-center gap-2">
                  {r.favorite ? <span title="Favorite">★</span> : null}
                  <span className="font-medium">{r.title}</span>
                  <span className="text-gray-400">· serves {r.baseServings}</span>
                  <span className="text-gray-400">· {r._count.ingredients} ingredients</span>
                </span>
                <span className={`rounded px-2 py-0.5 text-xs ${FIT_STYLES[r.aldiFitStatus]}`}>
                  Aldi: {r.aldiFitStatus}
                </span>
              </Link>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
