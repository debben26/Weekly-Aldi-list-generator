import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const [household, store, sectionCount, itemCount] = await Promise.all([
    prisma.household.findFirst({ include: { members: { include: { user: true } } } }),
    prisma.store.findFirst({ where: { isDefault: true } }),
    prisma.storeSection.count({ where: { active: true } }),
    prisma.item.count({ where: { active: true } }),
  ]);

  const owner = household?.members[0]?.user;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">This Week</h1>
        <p className="mt-1 text-sm text-gray-500">
          Foundation is seeded and ready. The weekly planning flow arrives across M3–M6.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card
          label="Household"
          value={household?.name ?? "—"}
          sub={owner ? `Owner: ${owner.name}` : undefined}
        />
        <Card
          label="Store"
          value={store ? `${store.brand} · ${store.name}` : "—"}
          sub={store?.isDefault ? "Default store" : undefined}
        />
        <Card label="Sections" value={String(sectionCount)} sub="In route order" />
        <Card label="Catalog items" value={String(itemCount)} sub="Starter catalog" />
      </div>
    </div>
  );
}

function Card({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="text-xs uppercase tracking-wide text-gray-500">{label}</div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
      {sub ? <div className="mt-0.5 text-xs text-gray-500">{sub}</div> : null}
    </div>
  );
}
