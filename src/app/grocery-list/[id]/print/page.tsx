import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import PrintButton from "@/components/PrintButton";

export const dynamic = "force-dynamic";

const SOURCE_LABELS: Record<string, string> = {
  weekly_staple: "Weekly Staples",
  restock: "Restock",
  pantry_review: "Pantry",
  manual: "Manual",
  recipe: "Recipe",
};

function fmtQ(n: number | null): string {
  if (n == null) return "";
  return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(3)));
}

export default async function PrintList({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const list = await prisma.shoppingList.findUnique({
    where: { id },
    include: {
      store: true,
      items: { include: { section: true, sources: true }, orderBy: { displayName: "asc" } },
    },
  });
  if (!list) notFound();

  const sections = await prisma.storeSection.findMany({
    where: { storeId: list.storeId },
    orderBy: { sortOrder: "asc" },
  });
  const recipeIds = [
    ...new Set(list.items.flatMap((i) => i.sources.map((s) => s.recipeId).filter(Boolean))),
  ] as string[];
  const recipeTitles = new Map(
    (await prisma.recipe.findMany({ where: { id: { in: recipeIds } }, select: { id: true, title: true } })).map(
      (r) => [r.id, r.title],
    ),
  );
  const labelFor = (s: { recipeId: string | null; sourceType: string }) =>
    s.recipeId ? (recipeTitles.get(s.recipeId) ?? "Recipe") : SOURCE_LABELS[s.sourceType];

  const sectionOrder = new Map(sections.map((s, i) => [s.id, i]));
  const groups = new Map<string, { name: string; sort: number; items: typeof list.items }>();
  for (const it of list.items) {
    const key = it.sectionId ?? "none";
    const name = it.section?.name ?? "Other";
    const sort = it.sectionId ? (sectionOrder.get(it.sectionId) ?? 9999) : 10000;
    if (!groups.has(key)) groups.set(key, { name, sort, items: [] });
    groups.get(key)!.items.push(it);
  }
  const orderedGroups = [...groups.values()].sort((a, b) => a.sort - b.sort);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="no-print mb-4 flex items-center justify-between">
        <Link href={`/grocery-list/${list.id}`} className="text-sm text-gray-500 hover:text-gray-900">
          ← Back
        </Link>
        <PrintButton />
      </div>

      <h1 className="text-xl font-bold">
        {list.store.brand} · {list.store.name}
      </h1>
      <p className="mb-4 text-sm text-gray-600">
        Shopping list — week of {list.weekStart.toISOString().slice(0, 10)}
      </p>

      {orderedGroups.map((g) => (
        <section key={g.name} className="mb-4 break-inside-avoid">
          <h2 className="border-b border-gray-400 pb-0.5 text-sm font-bold uppercase tracking-wide">
            {g.name}
          </h2>
          <ul className="mt-1">
            {g.items.map((it) => {
              const qty =
                it.quantity != null
                  ? `${fmtQ(it.quantity)} ${it.unit ?? ""}`.trim()
                  : it.sources
                      .map((s) => `${fmtQ(s.quantity)} ${s.unit ?? ""} [${labelFor(s)}]`.replace(/\s+/g, " ").trim())
                      .join(" + ");
              return (
                <li key={it.id} className="flex items-baseline gap-2 py-0.5 text-sm">
                  <span className="inline-block h-3.5 w-3.5 flex-shrink-0 border border-gray-700" />
                  <span className="font-medium">{it.displayName}</span>
                  {qty ? <span className="text-gray-600">— {qty}</span> : null}
                  {it.notes ? <span className="text-gray-500">({it.notes})</span> : null}
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {list.items.length === 0 ? <p className="text-sm text-gray-500">List is empty.</p> : null}
    </div>
  );
}
