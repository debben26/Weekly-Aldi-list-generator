import Link from "next/link";
import { prisma } from "@/lib/prisma";
import ItemRow from "./ItemRow";

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

  const sectionOptions = sections
    .filter((s) => s.active)
    .map((s) => ({ id: s.id, name: s.name }));

  const groups = [
    ...sections.map((s) => ({ name: s.name, items: s.itemsDefault })),
    ...(unsectioned.length
      ? [{ name: "Other / Unassigned (no default section)", items: unsectioned }]
      : []),
  ].filter((g) => g.items.length > 0);

  return (
    <div className="max-w-lg space-y-4">
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
              <ItemRow key={item.id} item={item} sections={sectionOptions} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
