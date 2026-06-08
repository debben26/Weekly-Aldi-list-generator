"use client";

import { useActionState } from "react";
import Link from "next/link";
import type { RecipeFormState } from "@/app/recipes/actions";

type RecipeValues = {
  id?: string;
  title?: string;
  notes?: string | null;
  baseServings?: number;
  prepTime?: number | null;
  cookTime?: number | null;
  favorite?: boolean;
  proteinType?: string | null;
  complexity?: number | null;
  estPrice?: number | null;
};

export default function RecipeForm({
  action,
  recipe,
  submitLabel,
}: {
  action: (prev: RecipeFormState, formData: FormData) => Promise<RecipeFormState>;
  recipe?: RecipeValues;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, {} as RecipeFormState);

  return (
    <form action={formAction} className="max-w-xl space-y-4">
      {recipe?.id ? <input type="hidden" name="id" value={recipe.id} /> : null}

      {state.error ? (
        <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </div>
      ) : null}

      <label className="block">
        <span className="mb-1 block text-sm font-medium text-gray-700">
          Title<span className="text-red-500"> *</span>
        </span>
        <input
          name="title"
          defaultValue={recipe?.title ?? ""}
          required
          className="input"
          placeholder="e.g. Taco Bowls"
        />
      </label>

      <div className="grid grid-cols-3 gap-3">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-gray-700">Base servings</span>
          <input
            name="baseServings"
            type="number"
            min={1}
            defaultValue={recipe?.baseServings ?? 4}
            className="input"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-gray-700">Prep (min)</span>
          <input name="prepTime" type="number" defaultValue={recipe?.prepTime ?? ""} className="input" />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-gray-700">Cook (min)</span>
          <input name="cookTime" type="number" defaultValue={recipe?.cookTime ?? ""} className="input" />
        </label>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-gray-700">Protein</span>
          <input
            name="proteinType"
            defaultValue={recipe?.proteinType ?? ""}
            className="input"
            placeholder="e.g. chicken"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-gray-700">Complexity (1–5)</span>
          <input
            name="complexity"
            type="number"
            min={1}
            max={5}
            defaultValue={recipe?.complexity ?? ""}
            className="input"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-gray-700">Est. price</span>
          <input
            name="estPrice"
            type="number"
            step="0.01"
            min={0}
            defaultValue={recipe?.estPrice ?? ""}
            className="input"
          />
        </label>
      </div>

      <label className="block">
        <span className="mb-1 block text-sm font-medium text-gray-700">Notes</span>
        <textarea name="notes" defaultValue={recipe?.notes ?? ""} rows={2} className="input" />
      </label>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="favorite" defaultChecked={recipe?.favorite ?? false} /> Favorite
      </label>

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-gray-900 px-4 py-2 text-sm text-white hover:bg-gray-700 disabled:opacity-50"
        >
          {pending ? "Saving…" : submitLabel}
        </button>
        <Link href="/recipes" className="text-sm text-gray-500 hover:text-gray-900">
          Cancel
        </Link>
      </div>
    </form>
  );
}
