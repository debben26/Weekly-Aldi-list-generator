import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function ItemsPage() {
  const sections = await prisma.storeSection.findMany({
    orderBy: { sortOrder: "asc" },
    include: {
      itemsDefault: {
        where: { active: true },
        orderBy: { canonicalName: "asc" },
      },
    },
  });

  const total = sections.reduce((n, s) => n + s.itemsDefault.length, 0);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Items</h1>
        <p className="mt-1 text-sm text-gray-500">
          Starter catalog — {total} items grouped by default section. Editing, aliases, and
          variants arrive in M2.
        </p>
      </div>

      {sections
        .filter((s) => s.itemsDefault.length > 0)
        .map((s) => (
          <section key={s.id} className="rounded-lg border border-gray-200 bg-white">
            <h2 className="border-b border-gray-100 px-4 py-2 text-sm font-semibold text-gray-700">
              {s.name}{" "}
              <span className="font-normal text-gray-400">({s.itemsDefault.length})</span>
            </h2>
            <ul className="divide-y divide-gray-50">
              {s.itemsDefault.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center justify-between px-4 py-2 text-sm"
                >
                  <span>
                    {item.canonicalName}
                    {item.aldiFriendly ? null : (
                      <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700">
                        non-Aldi
                      </span>
                    )}
                  </span>
                  <span className="text-gray-500">{item.purchaseUnit}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
    </div>
  );
}
