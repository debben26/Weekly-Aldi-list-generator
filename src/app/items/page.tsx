import Link from "next/link";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function ItemsPage({
  searchParams,
}: {
  searchParams: Promise<{ show?: string }>;
}) {
  const { show } = await searchParams;
  const includeInactive = show === "all";

  const sections = await prisma.storeSection.findMany({
    orderBy: { sortOrder: "asc" },
    include: {
      itemsDefault: {
        where: includeInactive ? {} : { active: true },
        orderBy: { canonicalName: "asc" },
      },
    },
  });

  // Items with no default section (fall under Other / Unassigned in output).
  const unsectioned = await prisma.item.findMany({
    where: { defaultSectionId: null, ...(includeInactive ? {} : { active: true }) },
    orderBy: { canonicalName: "asc" },
  });

  const inactiveCount = await prisma.item.count({ where: { active: false } });
  const total = sections.reduce((n, s) => n + s.itemsDefault.length, 0) + unsectioned.length;

  const groups = [
    ...sections.map((s) => ({ name: s.name, items: s.itemsDefault })),
    ...(unsectioned.length
      ? [{ name: "Other / Unassigned (no default section)", items: unsectioned }]
      : []),
  ].filter((g) => g.items.length > 0);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Items</h1>
          <p className="mt-1 text-sm text-gray-500">
            {total} item{total === 1 ? "" : "s"} grouped by default section.{" "}
            {includeInactive ? (
              <Link href="/items" className="underline">
                Hide inactive
              </Link>
            ) : (
              <Link href="/items?show=all" className="underline">
                Show inactive ({inactiveCount})
              </Link>
            )}
          </p>
        </div>
        <Link
          href="/items/new"
          className="rounded bg-gray-900 px-3 py-1.5 text-sm text-white hover:bg-gray-700"
        >
          + New item
        </Link>
      </div>

      {groups.map((g) => (
        <section key={g.name} className="rounded-lg border border-gray-200 bg-white">
          <h2 className="border-b border-gray-100 px-4 py-2 text-sm font-semibold text-gray-700">
            {g.name} <span className="font-normal text-gray-400">({g.items.length})</span>
          </h2>
          <ul className="divide-y divide-gray-50">
            {g.items.map((item) => (
              <li key={item.id}>
                <Link
                  href={`/items/${item.id}`}
                  className="flex items-center justify-between px-4 py-2 text-sm hover:bg-gray-50"
                >
                  <span className={item.active ? "" : "text-gray-400 line-through"}>
                    {item.canonicalName}
                    {item.variant ? (
                      <span className="ml-2 text-xs text-gray-400">{item.variant}</span>
                    ) : null}
                    {item.aldiFriendly ? null : (
                      <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700">
                        non-Aldi
                      </span>
                    )}
                  </span>
                  <span className="text-gray-500">{item.purchaseUnit}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
