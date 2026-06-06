import { prisma } from "@/lib/prisma";
import { getDefaultStore } from "@/lib/context";
import { OTHER_SECTION_NAME } from "@/lib/constants";
import {
  createSection,
  renameSection,
  moveSection,
  setSectionActive,
} from "./actions";

export const dynamic = "force-dynamic";

export default async function StoreLayoutPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const store = await getDefaultStore();
  const sections = await prisma.storeSection.findMany({
    where: { storeId: store.id },
    orderBy: { sortOrder: "asc" },
    include: { _count: { select: { itemsDefault: true } } },
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Store Layout</h1>
        <p className="mt-1 text-sm text-gray-500">
          {store.brand} · {store.name} — sections in walking (route) order. Generated lists
          group items by this order.
        </p>
      </div>

      {error ? (
        <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <ol className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        {sections.map((s, i) => {
          const isOther = s.name === OTHER_SECTION_NAME;
          return (
            <li
              key={s.id}
              className={`flex flex-wrap items-center gap-3 border-b border-gray-100 px-3 py-2 last:border-b-0 ${
                s.active ? "" : "bg-gray-50"
              }`}
            >
              <span className="w-6 text-right text-sm tabular-nums text-gray-400">
                {i + 1}
              </span>

              <span className="flex gap-1">
                <MoveButton id={s.id} direction="up" disabled={i === 0} label="▲" />
                <MoveButton
                  id={s.id}
                  direction="down"
                  disabled={i === sections.length - 1}
                  label="▼"
                />
              </span>

              {isOther ? (
                <span className="flex-1 font-medium">
                  {s.name}{" "}
                  <span className="ml-1 rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                    fallback — locked
                  </span>
                </span>
              ) : (
                <form action={renameSection} className="flex flex-1 items-center gap-2">
                  <input type="hidden" name="id" value={s.id} />
                  <input
                    name="name"
                    defaultValue={s.name}
                    className="min-w-0 flex-1 rounded border border-gray-200 px-2 py-1 text-sm"
                    aria-label="Section name"
                  />
                  <button
                    type="submit"
                    className="rounded border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-gray-100"
                  >
                    Save
                  </button>
                </form>
              )}

              <span className="text-sm text-gray-500">
                {s._count.itemsDefault} item{s._count.itemsDefault === 1 ? "" : "s"}
              </span>

              {!s.active ? (
                <span className="rounded bg-gray-200 px-2 py-0.5 text-xs text-gray-600">
                  inactive
                </span>
              ) : null}

              {isOther ? null : (
                <form action={setSectionActive}>
                  <input type="hidden" name="id" value={s.id} />
                  <input type="hidden" name="active" value={s.active ? "false" : "true"} />
                  <button
                    type="submit"
                    className="rounded border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-gray-100"
                  >
                    {s.active ? "Deactivate" : "Activate"}
                  </button>
                </form>
              )}
            </li>
          );
        })}
      </ol>

      <form
        action={createSection}
        className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white p-3"
      >
        <input
          name="name"
          placeholder="New section name"
          className="flex-1 rounded border border-gray-200 px-2 py-1 text-sm"
          aria-label="New section name"
        />
        <button
          type="submit"
          className="rounded bg-gray-900 px-3 py-1.5 text-sm text-white hover:bg-gray-700"
        >
          Add section
        </button>
      </form>
    </div>
  );
}

function MoveButton({
  id,
  direction,
  disabled,
  label,
}: {
  id: string;
  direction: "up" | "down";
  disabled: boolean;
  label: string;
}) {
  return (
    <form action={moveSection}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="direction" value={direction} />
      <button
        type="submit"
        disabled={disabled}
        className="rounded border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-30"
        aria-label={`Move ${direction}`}
      >
        {label}
      </button>
    </form>
  );
}
