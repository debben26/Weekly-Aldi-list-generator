import { prisma } from "@/lib/prisma";
import { getDefaultHousehold } from "@/lib/context";
import { getRestockSuggestions, type RestockSuggestion } from "./data";
import {
  createStapleRule,
  setStapleActive,
  snoozeRestock,
  unsnoozeRestock,
  markPurchased,
  updateStapleRule,
  deleteStapleRule,
} from "./actions";

type SectionOption = { id: string; name: string };

export const dynamic = "force-dynamic";

const STATE_STYLES: Record<string, string> = {
  due: "bg-red-100 text-aldi-red",
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
        <h1 className="text-2xl font-bold tracking-tight text-aldi-navy">Staples &amp; Restock</h1>
        <p className="mt-1 text-sm text-gray-500">
          Weekly staples auto-add to every list. Restock items appear here when due — they are
          not added automatically.
        </p>
      </div>

      {error ? (
        <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-aldi-red">
          {error}
        </div>
      ) : null}

      {/* Create rule */}
      <section className="card p-4">
        <h2 className="mb-3 font-semibold">Add a rule</h2>
        <form action={createStapleRule} className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <label className="col-span-2 block md:col-span-1">
            <span className="mb-1 block text-xs text-gray-500">Item *</span>
            <select name="itemId" className="input">
              <option value="">— choose —</option>
              {items.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.canonicalName}
                </option>
              ))}
            </select>
          </label>
          <label className="col-span-2 block md:col-span-1">
            <span className="mb-1 block text-xs text-gray-500">or new item</span>
            <input name="newItemName" className="input" placeholder="adds to catalog" />
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
              className="rounded bg-aldi-navy px-4 py-2 text-sm text-white hover:bg-aldi-navy/90"
            >
              Add rule
            </button>
          </div>
        </form>
      </section>

      {/* Weekly staples */}
      <section>
        <h2 className="mb-2 font-semibold">Weekly staples ({weekly.filter((w) => w.active).length} active)</h2>
        <ul className="overflow-hidden card">
          {weekly.length === 0 ? (
            <li className="px-4 py-3 text-sm text-gray-400">No weekly staples yet.</li>
          ) : (
            weekly.map((w) => (
              <li
                key={w.id}
                className={`border-b border-gray-100 px-4 py-2 text-sm last:border-b-0 ${
                  w.active ? "" : "bg-gray-50 text-gray-400"
                }`}
              >
                <div className="flex items-center justify-between">
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
                  <span className="flex items-center gap-2">
                    <ToggleActive id={w.id} active={w.active} />
                    <DeleteButton id={w.id} />
                  </span>
                </div>
                <details className="mt-1">
                  <summary className="cursor-pointer text-xs text-gray-500 hover:underline">
                    Edit
                  </summary>
                  <form
                    action={updateStapleRule}
                    className="mt-2 flex flex-wrap items-end gap-2"
                  >
                    <input type="hidden" name="id" value={w.id} />
                    <RuleEditFields
                      sections={sections}
                      defaultQuantity={w.defaultQuantity}
                      defaultUnit={w.defaultUnit}
                      defaultSectionId={w.defaultSectionId}
                    />
                    <SaveButton />
                  </form>
                </details>
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
          sections={sections}
          showSuggestActions
        />

        {noCadence.length > 0 ? (
          <RestockGroup
            title="Needs a cadence"
            empty=""
            rows={noCadence}
            sections={sections}
            hint="Set an interval (or record purchases over time) so these can be suggested."
          />
        ) : null}

        {snoozed.length > 0 ? (
          <div>
            <h3 className="mb-1 text-sm font-medium text-gray-600">Snoozed</h3>
            <ul className="card">
              {snoozed.map((s) => (
                <li
                  key={s.rule.id}
                  className="border-b border-gray-100 px-4 py-2 text-sm last:border-b-0"
                >
                  <div className="flex items-center justify-between">
                    <span>
                      {s.rule.itemName}{" "}
                      <span className="text-xs text-gray-400">{s.evaluation.reason}</span>
                    </span>
                    <span className="flex items-center gap-2">
                      <form action={unsnoozeRestock}>
                        <input type="hidden" name="id" value={s.rule.id} />
                        <button className="text-xs text-gray-600 hover:underline">Unsnooze</button>
                      </form>
                      <DeleteButton id={s.rule.id} />
                    </span>
                  </div>
                  <RestockEdit rule={s.rule} sections={sections} />
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {notDue.length > 0 ? (
          <details className="card px-4 py-2">
            <summary className="cursor-pointer text-sm text-gray-600">
              Not due yet ({notDue.length})
            </summary>
            <ul className="mt-2 space-y-1">
              {notDue.map((s) => (
                <li key={s.rule.id} className="text-sm text-gray-500">
                  <div className="flex items-center justify-between">
                    <span>
                      {s.rule.itemName} — {s.evaluation.reason}
                    </span>
                    <DeleteButton id={s.rule.id} />
                  </div>
                  <RestockEdit rule={s.rule} sections={sections} />
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </section>
    </div>
  );
}

function DeleteButton({ id }: { id: string }) {
  return (
    <form action={deleteStapleRule}>
      <input type="hidden" name="id" value={id} />
      <button className="text-xs text-aldi-red hover:underline">Delete</button>
    </form>
  );
}

function SaveButton() {
  return (
    <button className="btn-secondary px-2 text-xs text-gray-700">
      Save
    </button>
  );
}

// Shared quantity / unit / section inputs for the inline edit forms (weekly + restock).
function RuleEditFields({
  sections,
  defaultQuantity,
  defaultUnit,
  defaultSectionId,
}: {
  sections: SectionOption[];
  defaultQuantity: number | null;
  defaultUnit: string | null;
  defaultSectionId: string | null;
}) {
  return (
    <>
      <label className="text-xs text-gray-500">
        Quantity
        <input
          name="defaultQuantity"
          type="number"
          step="any"
          defaultValue={defaultQuantity ?? ""}
          className="input mt-0.5 w-24"
        />
      </label>
      <label className="text-xs text-gray-500">
        Unit
        <input
          name="defaultUnit"
          defaultValue={defaultUnit ?? ""}
          placeholder="(item default)"
          className="input mt-0.5 w-32"
        />
      </label>
      <label className="text-xs text-gray-500">
        Section
        <select
          name="defaultSectionId"
          defaultValue={defaultSectionId ?? ""}
          className="input mt-0.5 w-40"
        >
          <option value="">— item default —</option>
          {sections.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
    </>
  );
}

// Inline edit expander for a restock rule: quantity / unit / section + cadence.
function RestockEdit({
  rule,
  sections,
}: {
  rule: RestockSuggestion["rule"];
  sections: SectionOption[];
}) {
  return (
    <details className="mt-2">
      <summary className="cursor-pointer text-xs text-gray-500 hover:underline">Edit</summary>
      <form action={updateStapleRule} className="mt-2 flex flex-wrap items-end gap-2">
        <input type="hidden" name="id" value={rule.id} />
        <RuleEditFields
          sections={sections}
          defaultQuantity={rule.defaultQuantity}
          defaultUnit={rule.defaultUnit}
          defaultSectionId={rule.defaultSectionId}
        />
        <label className="text-xs text-gray-500">
          Interval days
          <input
            name="expectedIntervalDays"
            type="number"
            defaultValue={rule.expectedIntervalDays ?? ""}
            className="input mt-0.5 w-24"
          />
        </label>
        <label className="text-xs text-gray-500">
          Last purchased
          <input
            name="lastPurchasedDate"
            type="date"
            defaultValue={dateInput(rule.lastPurchasedDate)}
            className="input mt-0.5 w-40"
          />
        </label>
        <SaveButton />
      </form>
    </details>
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
  sections,
  hint,
  showSuggestActions,
}: {
  title: string;
  rows: RestockSuggestion[];
  empty: string;
  sections: SectionOption[];
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
            <li key={s.rule.id} className="card p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{s.rule.itemName}</span>
                <span
                  className={`rounded px-2 py-0.5 text-xs ${STATE_STYLES[s.evaluation.state]}`}
                >
                  {s.evaluation.state.replace("_", " ")}
                </span>
                <span className="text-xs text-gray-400">{s.evaluation.confidence} confidence</span>
                <span className="ml-auto flex items-center gap-2">
                  {showSuggestActions ? (
                    <>
                      <FormButton action={markPurchased} id={s.rule.id} label="Mark purchased" />
                      <FormButton
                        action={snoozeRestock}
                        id={s.rule.id}
                        label="Snooze 1wk"
                        extra={{ days: "7" }}
                      />
                    </>
                  ) : null}
                  <DeleteButton id={s.rule.id} />
                </span>
              </div>
              <p className="mt-1 text-sm text-gray-500">{s.evaluation.reason}</p>

              <RestockEdit rule={s.rule} sections={sections} />
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
      <button className="btn-secondary px-2 text-xs text-gray-700">
        {label}
      </button>
    </form>
  );
}
