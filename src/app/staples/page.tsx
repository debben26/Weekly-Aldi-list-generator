import { prisma } from "@/lib/prisma";
import { getDefaultHousehold } from "@/lib/context";
import { getRestockSuggestions, type RestockSuggestion } from "./data";
import {
  createStapleRule,
  setStapleActive,
  snoozeRestock,
  unsnoozeRestock,
  markPurchased,
  updateRestock,
} from "./actions";

export const dynamic = "force-dynamic";

const STATE_STYLES: Record<string, string> = {
  due: "bg-red-100 text-red-700",
  maybe_due: "bg-amber-100 text-amber-700",
  not_due: "bg-gray-100 text-gray-500",
  no_cadence: "bg-blue-100 text-blue-700",
  snoozed: "bg-gray-100 text-gray-500",
};

function dateInput(d: Date | null): string {
  return d ? d.toISOString().slice(0, 10) : "";
}

export default async function StaplesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const household = await getDefaultHousehold();

  const [items, sections, weekly, suggestions] = await Promise.all([
    prisma.item.findMany({
      where: { active: true },
      orderBy: { canonicalName: "asc" },
      select: { id: true, canonicalName: true, purchaseUnit: true },
    }),
    prisma.storeSection.findMany({
      where: { active: true },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true },
    }),
    prisma.stapleRule.findMany({
      where: { householdId: household.id, ruleType: "weekly" },
      include: { item: true, defaultSection: true },
      orderBy: [{ active: "desc" }, { createdAt: "asc" }],
    }),
    getRestockSuggestions(),
  ]);

  const byState = (s: string) => suggestions.filter((x) => x.evaluation.state === s);
  const suggested = [...byState("due"), ...byState("maybe_due")];
  const notDue = byState("not_due");
  const noCadence = byState("no_cadence");
  const snoozed = byState("snoozed");

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Staples &amp; Restock</h1>
        <p className="mt-1 text-sm text-gray-500">
          Weekly staples auto-add to every list. Restock items appear here when due — they are
          not added automatically.
        </p>
      </div>

      {error ? (
        <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {/* Create rule */}
      <section className="rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="mb-3 font-semibold">Add a rule</h2>
        <form action={createStapleRule} className="grid grid-cols-2 gap-3 md:grid-cols-3">
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
            <span className="mb-1 block text-xs text-gray-500">Type *</span>
            <select name="ruleType" required className="input" defaultValue="weekly">
              <option value="weekly">Weekly staple</option>
              <option value="restock">Restock</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-gray-500">Section</span>
            <select name="defaultSectionId" className="input">
              <option value="">— item default —</option>
              {sections.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-gray-500">Quantity</span>
            <input name="defaultQuantity" type="number" step="any" className="input" placeholder="1" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-gray-500">Unit</span>
            <input name="defaultUnit" className="input" placeholder="(item default)" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-gray-500">Interval days (restock)</span>
            <input name="expectedIntervalDays" type="number" className="input" placeholder="30" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-gray-500">Last purchased (restock)</span>
            <input name="lastPurchasedDate" type="date" className="input" />
          </label>
          <div className="col-span-2 md:col-span-3">
            <button
              type="submit"
              className="rounded bg-gray-900 px-4 py-2 text-sm text-white hover:bg-gray-700"
            >
              Add rule
            </button>
          </div>
        </form>
      </section>

      {/* Weekly staples */}
      <section>
        <h2 className="mb-2 font-semibold">Weekly staples ({weekly.filter((w) => w.active).length} active)</h2>
        <ul className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          {weekly.length === 0 ? (
            <li className="px-4 py-3 text-sm text-gray-400">No weekly staples yet.</li>
          ) : (
            weekly.map((w) => (
              <li
                key={w.id}
                className={`flex items-center justify-between border-b border-gray-100 px-4 py-2 text-sm last:border-b-0 ${
                  w.active ? "" : "bg-gray-50 text-gray-400"
                }`}
              >
                <span>
                  <span className="font-medium">{w.item.canonicalName}</span>
                  <span className="ml-2 text-gray-500">
                    {w.defaultQuantity ?? ""} {w.defaultUnit ?? w.item.purchaseUnit}
                  </span>
                  {w.defaultSection ? (
                    <span className="ml-2 text-xs text-gray-400">{w.defaultSection.name}</span>
                  ) : null}
                  {!w.active ? <span className="ml-2 text-xs">(inactive)</span> : null}
                </span>
                <ToggleActive id={w.id} active={w.active} />
              </li>
            ))
          )}
        </ul>
      </section>

      {/* Restock review */}
      <section className="space-y-5">
        <h2 className="font-semibold">Restock review</h2>

        <RestockGroup
          title="Suggested (due / maybe due)"
          empty="Nothing due right now."
          rows={suggested}
          showSuggestActions
        />

        {noCadence.length > 0 ? (
          <RestockGroup
            title="Needs a cadence"
            empty=""
            rows={noCadence}
            hint="Set an interval (or record purchases over time) so these can be suggested."
          />
        ) : null}

        {snoozed.length > 0 ? (
          <div>
            <h3 className="mb-1 text-sm font-medium text-gray-600">Snoozed</h3>
            <ul className="rounded-lg border border-gray-200 bg-white">
              {snoozed.map((s) => (
                <li
                  key={s.rule.id}
                  className="flex items-center justify-between border-b border-gray-100 px-4 py-2 text-sm last:border-b-0"
                >
                  <span>
                    {s.rule.itemName}{" "}
                    <span className="text-xs text-gray-400">{s.evaluation.reason}</span>
                  </span>
                  <form action={unsnoozeRestock}>
                    <input type="hidden" name="id" value={s.rule.id} />
                    <button className="text-xs text-gray-600 hover:underline">Unsnooze</button>
                  </form>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {notDue.length > 0 ? (
          <details className="rounded-lg border border-gray-200 bg-white px-4 py-2">
            <summary className="cursor-pointer text-sm text-gray-600">
              Not due yet ({notDue.length})
            </summary>
            <ul className="mt-2 space-y-1">
              {notDue.map((s) => (
                <li key={s.rule.id} className="text-sm text-gray-500">
                  {s.rule.itemName} — {s.evaluation.reason}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </section>
    </div>
  );
}

function ToggleActive({ id, active }: { id: string; active: boolean }) {
  return (
    <form action={setStapleActive}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="active" value={active ? "false" : "true"} />
      <button className="rounded border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-gray-100">
        {active ? "Deactivate" : "Activate"}
      </button>
    </form>
  );
}

function RestockGroup({
  title,
  rows,
  empty,
  hint,
  showSuggestActions,
}: {
  title: string;
  rows: RestockSuggestion[];
  empty: string;
  hint?: string;
  showSuggestActions?: boolean;
}) {
  return (
    <div>
      <h3 className="mb-1 text-sm font-medium text-gray-600">{title}</h3>
      {hint ? <p className="mb-1 text-xs text-gray-400">{hint}</p> : null}
      {rows.length === 0 ? (
        <p className="text-sm text-gray-400">{empty}</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((s) => (
            <li key={s.rule.id} className="rounded-lg border border-gray-200 bg-white p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{s.rule.itemName}</span>
                <span
                  className={`rounded px-2 py-0.5 text-xs ${STATE_STYLES[s.evaluation.state]}`}
                >
                  {s.evaluation.state.replace("_", " ")}
                </span>
                <span className="text-xs text-gray-400">{s.evaluation.confidence} confidence</span>
                {showSuggestActions ? (
                  <span className="ml-auto flex gap-2">
                    <FormButton action={markPurchased} id={s.rule.id} label="Mark purchased" />
                    <FormButton
                      action={snoozeRestock}
                      id={s.rule.id}
                      label="Snooze 1wk"
                      extra={{ days: "7" }}
                    />
                  </span>
                ) : null}
              </div>
              <p className="mt-1 text-sm text-gray-500">{s.evaluation.reason}</p>

              {/* inline cadence edit */}
              <form action={updateRestock} className="mt-2 flex flex-wrap items-end gap-2">
                <input type="hidden" name="id" value={s.rule.id} />
                <label className="text-xs text-gray-500">
                  Interval days
                  <input
                    name="expectedIntervalDays"
                    type="number"
                    defaultValue={s.rule.expectedIntervalDays ?? ""}
                    className="input mt-0.5 w-24"
                  />
                </label>
                <label className="text-xs text-gray-500">
                  Last purchased
                  <input
                    name="lastPurchasedDate"
                    type="date"
                    defaultValue={dateInput(s.rule.lastPurchasedDate)}
                    className="input mt-0.5 w-40"
                  />
                </label>
                <button className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-100">
                  Save
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FormButton({
  action,
  id,
  label,
  extra,
}: {
  action: (formData: FormData) => Promise<void>;
  id: string;
  label: string;
  extra?: Record<string, string>;
}) {
  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      {extra
        ? Object.entries(extra).map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))
        : null}
      <button className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-100">
        {label}
      </button>
    </form>
  );
}
