"use client";

import { useRef } from "react";
import { updateListItem, toggleChecked, removeListItem } from "@/app/grocery-list/actions";

type ItemSource = { quantity: number | null; unit: string | null };
type Item = {
  id: string;
  displayName: string;
  quantity: number | null;
  unit: string | null;
  sectionId: string | null;
  notes: string | null;
  checked: boolean;
  sources: ItemSource[];
};
type Section = { id: string; name: string };

function fmtQ(n: number | null): string {
  if (n == null) return "";
  return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(3)));
}

// One editable grocery-list row. Edits auto-save: the section dropdown on change, and the
// quantity/unit/notes fields on blur (only when their value actually changed). The edit form
// is keyed by the persisted values so that after the server action revalidates, the
// uncontrolled inputs remount and reflect the saved data (fixes the section dropdown reverting).
export default function GroceryItemRow({
  item,
  listId,
  sections,
}: {
  item: Item;
  listId: string;
  sections: Section[];
}) {
  const src = item.sources[0];
  const qtyText =
    item.quantity != null
      ? `${fmtQ(item.quantity)} ${item.unit ?? ""}`.trim()
      : src
        ? `${fmtQ(src.quantity)} ${src.unit ?? ""}`.trim()
        : "";

  // Last saved values (as the inputs render them) — used to skip redundant saves when a field
  // is blurred without an edit.
  const saved = useRef({
    quantity: item.quantity != null ? String(item.quantity) : "",
    unit: item.unit ?? "",
    notes: item.notes ?? "",
  });

  function submitOnChange(e: React.SyntheticEvent<HTMLElement>) {
    (e.currentTarget as HTMLElement).closest("form")?.requestSubmit();
  }

  function submitIfChanged(
    e: React.FocusEvent<HTMLInputElement>,
    field: keyof typeof saved.current,
  ) {
    if (e.currentTarget.value === saved.current[field]) return;
    saved.current[field] = e.currentTarget.value;
    e.currentTarget.form?.requestSubmit();
  }

  return (
    <li className="flex flex-wrap items-center gap-2 px-4 py-2">
      <form action={toggleChecked}>
        <input type="hidden" name="id" value={item.id} />
        <input type="hidden" name="listId" value={listId} />
        <input type="hidden" name="checked" value={item.checked ? "false" : "true"} />
        <button className="text-lg leading-none" aria-label="toggle checked">
          {item.checked ? "☑" : "☐"}
        </button>
      </form>
      <span
        className={`w-56 shrink-0 truncate text-sm ${
          item.checked ? "text-gray-400 line-through" : ""
        }`}
      >
        <span className="font-medium">{item.displayName}</span>
        {qtyText ? <span className="ml-1 text-gray-500">{qtyText}</span> : null}
      </span>

      <form
        key={`${item.id}:${item.quantity}:${item.unit}:${item.sectionId}:${item.notes}`}
        action={updateListItem}
        className="flex flex-wrap items-center gap-1.5"
      >
        <input type="hidden" name="id" value={item.id} />
        <input type="hidden" name="listId" value={listId} />
        <input
          name="quantity"
          type="number"
          step="any"
          defaultValue={item.quantity ?? ""}
          placeholder="qty"
          className="input w-14"
          onBlur={(e) => submitIfChanged(e, "quantity")}
        />
        <input
          name="unit"
          defaultValue={item.unit ?? ""}
          placeholder="unit"
          className="input w-16"
          onBlur={(e) => submitIfChanged(e, "unit")}
        />
        <select
          name="sectionId"
          defaultValue={item.sectionId ?? ""}
          className="input w-32"
          onChange={submitOnChange}
        >
          <option value="">— Other —</option>
          {sections.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <input
          name="notes"
          defaultValue={item.notes ?? ""}
          placeholder="notes"
          className="input w-28"
          onBlur={(e) => submitIfChanged(e, "notes")}
        />
        <button
          formAction={removeListItem}
          className="rounded border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
        >
          Remove
        </button>
      </form>
    </li>
  );
}
