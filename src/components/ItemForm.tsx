"use client";

import { useActionState } from "react";
import Link from "next/link";
import { PURCHASE_UNITS } from "@/services/UnitService";
import type { ItemFormState } from "@/app/items/actions";

type SectionOption = { id: string; name: string };

type ItemValues = {
  id?: string;
  canonicalName?: string;
  defaultSectionId?: string | null;
  purchaseUnit?: string;
  purchaseUnitSize?: number | null;
  purchaseUnitSizeUnit?: string | null;
  variant?: string | null;
  size?: string | null;
  food?: boolean;
  aldiFriendly?: boolean;
  notes?: string | null;
};

export default function ItemForm({
  action,
  sections,
  item,
  submitLabel,
}: {
  action: (prev: ItemFormState, formData: FormData) => Promise<ItemFormState>;
  sections: SectionOption[];
  item?: ItemValues;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, {} as ItemFormState);

  return (
    <form action={formAction} className="max-w-xl space-y-4">
      {item?.id ? <input type="hidden" name="id" value={item.id} /> : null}

      {state.error ? (
        <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </div>
      ) : null}

      <Field label="Name" required>
        <input
          name="canonicalName"
          defaultValue={item?.canonicalName ?? ""}
          required
          className="input"
          placeholder="e.g. Milk (2%, 1 gallon)"
        />
      </Field>

      <Field label="Default section">
        <select
          name="defaultSectionId"
          defaultValue={item?.defaultSectionId ?? ""}
          className="input"
        >
          <option value="">— Other / Unassigned —</option>
          {sections.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </Field>

      <div className="grid grid-cols-3 gap-3">
        <Field label="Purchase unit" required>
          <input
            name="purchaseUnit"
            defaultValue={item?.purchaseUnit ?? ""}
            required
            list="purchase-units"
            className="input"
            placeholder="bag"
          />
          <datalist id="purchase-units">
            {PURCHASE_UNITS.map((u) => (
              <option key={u} value={u} />
            ))}
          </datalist>
        </Field>
        <Field label="Size">
          <input
            name="purchaseUnitSize"
            defaultValue={item?.purchaseUnitSize ?? ""}
            type="number"
            step="any"
            className="input"
            placeholder="8"
          />
        </Field>
        <Field label="Size unit">
          <input
            name="purchaseUnitSizeUnit"
            defaultValue={item?.purchaseUnitSizeUnit ?? ""}
            className="input"
            placeholder="oz"
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Variant / flavor">
          <input
            name="variant"
            defaultValue={item?.variant ?? ""}
            className="input"
            placeholder="2%"
          />
        </Field>
        <Field label="Size label">
          <input
            name="size"
            defaultValue={item?.size ?? ""}
            className="input"
            placeholder="1 gallon"
          />
        </Field>
      </div>

      <Field label="Notes">
        <textarea name="notes" defaultValue={item?.notes ?? ""} rows={2} className="input" />
      </Field>

      <div className="flex gap-6">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="food" defaultChecked={item?.food ?? true} /> Food
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="aldiFriendly"
            defaultChecked={item?.aldiFriendly ?? true}
          />{" "}
          Aldi-friendly
        </label>
      </div>

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-gray-900 px-4 py-2 text-sm text-white hover:bg-gray-700 disabled:opacity-50"
        >
          {pending ? "Saving…" : submitLabel}
        </button>
        <Link href="/items" className="text-sm text-gray-500 hover:text-gray-900">
          Cancel
        </Link>
      </div>
    </form>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-gray-700">
        {label}
        {required ? <span className="text-red-500"> *</span> : null}
      </span>
      {children}
    </label>
  );
}
