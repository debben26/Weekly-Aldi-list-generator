import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import ItemForm from "@/components/ItemForm";
import { updateItem, setItemActive, addAlias, removeAlias } from "../actions";

export const dynamic = "force-dynamic";

export default async function EditItemPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;

  const [item, sections] = await Promise.all([
    prisma.item.findUnique({
      where: { id },
      include: { aliases: { orderBy: { aliasText: "asc" } } },
    }),
    prisma.storeSection.findMany({
      where: { active: true },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  if (!item) notFound();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">
          {item.canonicalName}
          {!item.active ? (
            <span className="ml-2 rounded bg-gray-200 px-2 py-0.5 text-xs text-gray-600">
              inactive
            </span>
          ) : null}
        </h1>
        <Link href="/items" className="text-sm text-gray-500 hover:text-gray-900">
          ← Back to items
        </Link>
      </div>

      <ItemForm
        action={updateItem}
        sections={sections}
        item={item}
        submitLabel="Save changes"
      />

      {/* Aliases (spec 5.3 / 6.2) — stored normalized; drive merge matching in M5. */}
      <section className="max-w-xl space-y-3 rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="font-semibold">Aliases</h2>
        <p className="text-sm text-gray-500">
          Alternate names this item is known by (e.g. &ldquo;2% milk&rdquo;, &ldquo;Friendly
          Farms milk&rdquo;). Stored normalized for matching.
        </p>

        {error ? (
          <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        {item.aliases.length ? (
          <ul className="divide-y divide-gray-100">
            {item.aliases.map((a) => (
              <li key={a.id} className="flex items-center justify-between py-1.5 text-sm">
                <span className="font-mono text-gray-700">{a.aliasText}</span>
                <form action={removeAlias}>
                  <input type="hidden" name="id" value={a.id} />
                  <input type="hidden" name="itemId" value={item.id} />
                  <button
                    type="submit"
                    className="text-xs text-red-600 hover:underline"
                  >
                    Remove
                  </button>
                </form>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gray-400">No aliases yet.</p>
        )}

        <form action={addAlias} className="flex items-center gap-2">
          <input type="hidden" name="itemId" value={item.id} />
          <input
            name="aliasText"
            placeholder="Add an alias"
            className="input flex-1"
            aria-label="New alias"
          />
          <button
            type="submit"
            className="rounded border border-gray-300 px-3 py-1 text-sm text-gray-700 hover:bg-gray-100"
          >
            Add
          </button>
        </form>
      </section>

      {/* Soft-delete / reactivate */}
      <form action={setItemActive} className="max-w-xl">
        <input type="hidden" name="id" value={item.id} />
        <input type="hidden" name="active" value={item.active ? "false" : "true"} />
        <button
          type="submit"
          className={`rounded border px-3 py-1.5 text-sm ${
            item.active
              ? "border-red-200 text-red-600 hover:bg-red-50"
              : "border-green-200 text-green-700 hover:bg-green-50"
          }`}
        >
          {item.active ? "Deactivate item" : "Reactivate item"}
        </button>
      </form>
    </div>
  );
}
