import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import RecipeForm from "@/components/RecipeForm";
import { updateRecipe, addIngredient, updateIngredient, removeIngredient } from "../actions";

export const dynamic = "force-dynamic";

const FIT_STYLES: Record<string, string> = {
  good: "bg-green-100 text-green-700",
  medium: "bg-amber-100 text-amber-700",
  low: "bg-red-100 text-red-700",
  unknown: "bg-gray-100 text-gray-500",
};

export default async function EditRecipePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;

  const [recipe, items] = await Promise.all([
    prisma.recipe.findUnique({
      where: { id },
      include: { ingredients: { orderBy: { position: "asc" }, include: { item: true } } },
    }),
    prisma.item.findMany({
      where: { active: true },
      orderBy: { canonicalName: "asc" },
      select: { id: true, canonicalName: true },
    }),
  ]);

  if (!recipe) notFound();

  const unmapped = recipe.ingredients.filter((i) => i.itemId == null).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          {recipe.title}
          <span className={`rounded px-2 py-0.5 text-xs ${FIT_STYLES[recipe.aldiFitStatus]}`}>
            Aldi: {recipe.aldiFitStatus}
          </span>
        </h1>
        <Link href="/recipes" className="text-sm text-gray-500 hover:text-gray-900">
          ← All recipes
        </Link>
      </div>

      <RecipeForm action={updateRecipe} recipe={recipe} submitLabel="Save recipe" />

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Ingredients ({recipe.ingredients.length})</h2>
          {unmapped > 0 ? (
            <span className="text-xs text-amber-700">
              {unmapped} unmapped — mapping improves merging &amp; Aldi-fit
            </span>
          ) : null}
        </div>

        {error ? (
          <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <ul className="space-y-2">
          {recipe.ingredients.map((ing) => (
            <li key={ing.id} className="rounded-lg border border-gray-200 bg-white p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-medium">{ing.rawText}</span>
                <form action={removeIngredient}>
                  <input type="hidden" name="id" value={ing.id} />
                  <input type="hidden" name="recipeId" value={recipe.id} />
                  <button className="text-xs text-red-600 hover:underline">Remove</button>
                </form>
              </div>
              <form action={updateIngredient} className="flex flex-wrap items-end gap-2">
                <input type="hidden" name="id" value={ing.id} />
                <input type="hidden" name="recipeId" value={recipe.id} />
                <label className="text-xs text-gray-500">
                  Maps to item
                  <select name="itemId" defaultValue={ing.itemId ?? ""} className="input mt-0.5 w-48">
                    <option value="">— unmapped —</option>
                    {items.map((it) => (
                      <option key={it.id} value={it.id}>
                        {it.canonicalName}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs text-gray-500">
                  Qty
                  <input
                    name="quantity"
                    type="number"
                    step="any"
                    defaultValue={ing.quantity ?? ""}
                    className="input mt-0.5 w-20"
                  />
                </label>
                <label className="text-xs text-gray-500">
                  Unit
                  <input
                    name="recipeUnit"
                    defaultValue={ing.recipeUnit ?? ""}
                    className="input mt-0.5 w-24"
                    placeholder="cup"
                  />
                </label>
                <label className="flex items-center gap-1 text-xs text-gray-500">
                  <input type="checkbox" name="optional" defaultChecked={ing.optional} /> optional
                </label>
                <label className="flex items-center gap-1 text-xs text-gray-500">
                  <input
                    type="checkbox"
                    name="scalable"
                    value="on"
                    defaultChecked={ing.scalable}
                  />{" "}
                  scalable
                </label>
                <button className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-100">
                  Save
                </button>
              </form>
            </li>
          ))}
          {recipe.ingredients.length === 0 ? (
            <li className="text-sm text-gray-400">No ingredients yet.</li>
          ) : null}
        </ul>

        {/* Add ingredient */}
        <form
          action={addIngredient}
          className="flex flex-wrap items-end gap-2 rounded-lg border border-gray-200 bg-white p-3"
        >
          <input type="hidden" name="recipeId" value={recipe.id} />
          <label className="text-xs text-gray-500">
            Ingredient text *
            <input
              name="rawText"
              required
              className="input mt-0.5 w-56"
              placeholder="1 lb ground beef"
            />
          </label>
          <label className="text-xs text-gray-500">
            Maps to item
            <select name="itemId" className="input mt-0.5 w-48" defaultValue="">
              <option value="">— unmapped —</option>
              {items.map((it) => (
                <option key={it.id} value={it.id}>
                  {it.canonicalName}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-gray-500">
            or new item
            <input name="newItemName" className="input mt-0.5 w-40" placeholder="adds to catalog" />
          </label>
          <label className="text-xs text-gray-500">
            Qty
            <input name="quantity" type="number" step="any" className="input mt-0.5 w-20" />
          </label>
          <label className="text-xs text-gray-500">
            Unit
            <input name="recipeUnit" className="input mt-0.5 w-24" placeholder="cup" />
          </label>
          <label className="flex items-center gap-1 text-xs text-gray-500">
            <input type="checkbox" name="optional" /> optional
          </label>
          <label className="flex items-center gap-1 text-xs text-gray-500">
            <input type="checkbox" name="scalable" value="on" defaultChecked /> scalable
          </label>
          <button className="rounded bg-gray-900 px-3 py-1.5 text-sm text-white hover:bg-gray-700">
            Add
          </button>
        </form>
      </section>
    </div>
  );
}
