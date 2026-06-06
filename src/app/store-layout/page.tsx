import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function StoreLayoutPage() {
  const store = await prisma.store.findFirst({
    where: { isDefault: true },
    include: {
      sections: {
        orderBy: { sortOrder: "asc" },
        include: { _count: { select: { itemsDefault: true } } },
      },
    },
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Store Layout</h1>
        <p className="mt-1 text-sm text-gray-500">
          {store ? `${store.brand} · ${store.name}` : "No store"} — sections in walking
          (route) order. Reordering arrives in M2.
        </p>
      </div>

      <ol className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        {store?.sections.map((s) => (
          <li
            key={s.id}
            className="flex items-center justify-between border-b border-gray-100 px-4 py-3 last:border-b-0"
          >
            <span className="flex items-center gap-3">
              <span className="w-6 text-right text-sm tabular-nums text-gray-400">
                {s.sortOrder + 1}
              </span>
              <span className="font-medium">{s.name}</span>
              {!s.active ? (
                <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                  inactive
                </span>
              ) : null}
            </span>
            <span className="text-sm text-gray-500">
              {s._count.itemsDefault} item{s._count.itemsDefault === 1 ? "" : "s"}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
