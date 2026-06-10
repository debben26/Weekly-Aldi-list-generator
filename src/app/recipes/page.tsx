import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getDefaultHousehold } from "@/lib/context";
import { sortRecipesBy } from "@/services/MealPackageService";
import { deleteRecipe } from "./actions";

export const dynamic = "force-dynamic";

const FIT_STYLES: Record<string, string> = {
  good: "bg-green-100 text-green-700",
  medium: "bg-amber-100 text-amber-700",
  low: "bg-red-100 text-aldi-red",
  unknown: "bg-gray-100 text-gray-500",
};

const SORTS = [
  { key: "default", label: "Default" },
  { key: "price", label: "Price" },
  { key: "protein", label: "Protein" },
  { key: "complexity", label: "Complexity" },
] as const;

type SortKey = (typeof SORTS)[number]["key"];

export default async function RecipesPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string }>;
}) {
  const { sort } = await searchParams;
  const activeSort: SortKey = SORTS.some((s) => s.key === sort) ? (sort as SortKey) : "default";

  const household = await getDefaultHousehold();
  const recipes = sortRecipesBy(
    await prisma.recipe.findMany({
      where: { householdId: household.id },
      include: { _count: { select: { ingredients: true } } },
    }),
    activeSort,
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-aldi-navy">Recipes</h1>
          <p className="mt-1 text-sm text-gray-500">
            {recipes.length} recipe{recipes.length === 1 ? "" : "s"}. Map ingredients to items
            for better merging and Aldi-fit.
          </p>
        </div>
        <Link
          href="/recipes/new"
          className="rounded bg-aldi-navy px-3 py-1.5 text-sm text-white hover:bg-aldi-navy/90"
        >
          + New recipe
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-1 text-sm">
        <span className="mr-1 text-xs text-gray-400">Sort:</span>
        {SORTS.map((s) => {
          const active = s.key === activeSort;
          const href = s.key === "default" ? "/recipes" : `/recipes?sort=${s.key}`;
          return (
            <Link
              key={s.key}
              href={href}
              className={`rounded px-2.5 py-1 ${
                active ? "bg-aldi-navy text-white" : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              {s.label}
            </Link>
          );
        })}
      </div>

      <ul className="overflow-hidden card">
        {recipes.length === 0 ? (
          <li className="px-4 py-3 text-sm text-gray-400">No recipes yet.</li>
        ) : (
          recipes.map((r) => (
            <li key={r.id} className="flex items-center border-b border-gray-100 last:border-b-0">
              <Link
                href={`/recipes/${r.id}`}
                className="flex flex-1 items-center justify-between px-4 py-3 text-sm hover:bg-gray-50"
              >
                <span className="flex items-center gap-2">
                  {r.favorite ? <span title="Favorite">★</span> : null}
                  <span className="font-medium">{r.title}</span>
                  <span className="text-gray-400">· serves {r.baseServings}</span>
                  <span className="text-gray-400">· {r._count.ingredients} ingredients</span>
                  {activeSort === "price" && r.estPrice != null ? (
                    <span className="text-gray-400">· ${r.estPrice.toFixed(2)}</span>
                  ) : null}
                  {activeSort === "protein" && r.proteinType ? (
                    <span className="text-gray-400">· {r.proteinType}</span>
                  ) : null}
                  {activeSort === "complexity" && r.complexity != null ? (
                    <span className="text-gray-400">· complexity {r.complexity}</span>
                  ) : null}
                </span>
                <span className={`rounded px-2 py-0.5 text-xs ${FIT_STYLES[r.aldiFitStatus]}`}>
                  Aldi: {r.aldiFitStatus}
                </span>
              </Link>
              <form action={deleteRecipe} className="px-4">
                <input type="hidden" name="id" value={r.id} />
                <button className="text-xs text-aldi-red hover:underline">Delete</button>
              </form>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
