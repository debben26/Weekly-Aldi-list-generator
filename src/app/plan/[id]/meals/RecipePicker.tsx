"use client";

import { useState } from "react";
import {
  searchRecipesByName,
  sortRecipesBy,
  type RecipeSortKey,
} from "@/services/MealPackageService";

export type SavedRecipe = {
  id: string;
  title: string;
  favorite: boolean;
  proteinType: string | null;
  complexity: number | null;
  estPrice: number | null;
};

const SORTS: { key: RecipeSortKey; label: string }[] = [
  { key: "default", label: "Default" },
  { key: "price", label: "Price" },
  { key: "protein", label: "Protein" },
  { key: "complexity", label: "Complexity" },
];

// Show the value being sorted on, so the order is legible.
function meta(r: SavedRecipe, key: RecipeSortKey): string | null {
  if (key === "price") return r.estPrice != null ? `$${r.estPrice.toFixed(2)}` : null;
  if (key === "protein") return r.proteinType || null;
  if (key === "complexity") return r.complexity != null ? `complexity ${r.complexity}` : null;
  return null;
}

// Search + sort browser over saved recipes, shared by the per-card Swap panel and the Add-a-meal
// panel. The caller supplies the per-row action (Swap form / Add form) via `renderAction`.
export default function RecipePicker({
  recipes,
  emptyText = "No matching meals found.",
  renderAction,
}: {
  recipes: SavedRecipe[];
  emptyText?: string;
  renderAction: (r: SavedRecipe) => React.ReactNode;
}) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<RecipeSortKey>("default");
  const results = sortRecipesBy(searchRecipesByName(recipes, query), sort).slice(0, 30);

  return (
    <div>
      <input
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search my meals…"
        className="input w-full"
      />
      <div className="mt-2 flex flex-wrap items-center gap-1 text-xs">
        <span className="mr-1 text-gray-400">Sort:</span>
        {SORTS.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => setSort(s.key)}
            className={`rounded px-2 py-0.5 ${
              sort === s.key ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>
      {results.length === 0 ? (
        <p className="mt-2 text-xs text-gray-400">{emptyText}</p>
      ) : (
        <ul className="mt-2 max-h-60 space-y-1 overflow-auto">
          {results.map((r) => {
            const m = meta(r, sort);
            return (
              <li key={r.id} className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-2 text-sm">
                  {r.favorite ? <span className="text-amber-500">★</span> : null}
                  <span className="truncate">{r.title}</span>
                  {m ? <span className="flex-shrink-0 text-xs text-gray-400">{m}</span> : null}
                </span>
                {renderAction(r)}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
