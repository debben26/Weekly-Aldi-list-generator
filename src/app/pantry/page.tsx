import { prisma } from "@/lib/prisma";
import { getDefaultHousehold } from "@/lib/context";
import { setPantryStatus, removePantryItem } from "./actions";

export const dynamic = "force-dynamic";

const STATUSES = ["have", "low", "out", "unknown"] as const;
const STATUS_STYLES: Record<string, string> = {
  have: "bg-green-100 text-green-700",
  low: "bg-amber-100 text-amber-700",
  out: "bg-red-100 text-aldi-red",
  unknown: "bg-gray-100 text-gray-500",
};

export default async function PantryPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const household = await getDefaultHousehold();

  const [items, pantry] = await Promise.all([
    prisma.item.findMany({
      where: { active: true },
      orderBy: { canonicalName: "asc" },
      select: { id: true, canonicalName: true, purchaseUnit: true },
    }),
    prisma.pantryItem.findMany({
      where: { householdId: household.id },
      include: { item: true },
      orderBy: { item: { canonicalName: "asc" } },
    }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-aldi-navy">Pantry</h1>
        <p className="mt-1 text-sm text-gray-500">
          Lightweight on-hand status. Items marked <strong>have</strong> are excluded from
          generated lists (you can override per list).
        </p>
      </div>

      {error ? (
        <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-aldi-red">
          {error}
        </div>
      ) : null}

      {/* Add / set status */}
      <section className="card p-4">
        <h2 className="mb-3 font-semibold">Set status</h2>
        <form action={setPantryStatus} className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <label className="col-span-2 block md:col-span-1">
            <span className="mb-1 block text-xs text-gray-500">Item *</span>
            <select name="itemId" required className="input">
              <option value="">— choose —</option>
              {items.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.canonicalName}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-gray-500">Status *</span>
            <select name="status" required className="input" defaultValue="have">
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-gray-500">Quantity</span>
            <input name="quantity" type="number" step="any" className="input" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-gray-500">Unit</span>
            <input name="unit" className="input" placeholder="optional" />
          </label>
          <div className="col-span-2 md:col-span-4">
            <button className="rounded bg-aldi-navy px-4 py-2 text-sm text-white hover:bg-aldi-navy/90">
              Save status
            </button>
          </div>
        </form>
      </section>

      {/* Current pantry */}
      <section>
        <h2 className="mb-2 font-semibold">On hand ({pantry.length})</h2>
        <ul className="overflow-hidden card">
          {pantry.length === 0 ? (
            <li className="px-4 py-3 text-sm text-gray-400">Nothing tracked yet.</li>
          ) : (
            pantry.map((p) => (
              <li
                key={p.id}
                className="flex flex-wrap items-center gap-3 border-b border-gray-100 px-4 py-2 text-sm last:border-b-0"
              >
                <span className="font-medium">{p.item.canonicalName}</span>
                <span className={`rounded px-2 py-0.5 text-xs ${STATUS_STYLES[p.status]}`}>
                  {p.status}
                </span>
                {p.quantity != null ? (
                  <span className="text-xs text-gray-500">
                    {p.quantity} {p.unit ?? ""}
                  </span>
                ) : null}

                <span className="ml-auto flex items-center gap-1">
                  {STATUSES.map((s) => (
                    <form key={s} action={setPantryStatus}>
                      <input type="hidden" name="itemId" value={p.itemId} />
                      <input type="hidden" name="status" value={s} />
                      <button
                        className={`rounded border px-2 py-0.5 text-xs ${
                          p.status === s
                            ? "border-aldi-navy bg-aldi-navy text-white"
                            : "border-gray-200 text-gray-600 hover:bg-gray-100"
                        }`}
                      >
                        {s}
                      </button>
                    </form>
                  ))}
                  <form action={removePantryItem} className="ml-2">
                    <input type="hidden" name="id" value={p.id} />
                    <button className="text-xs text-aldi-red hover:underline">Remove</button>
                  </form>
                </span>
              </li>
            ))
          )}
        </ul>
      </section>
    </div>
  );
}
