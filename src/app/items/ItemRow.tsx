"use client";

import Link from "next/link";
import { setItemSection, setItemActive } from "./actions";

type Item = {
  id: string;
  canonicalName: string;
  variant: string | null;
  aldiFriendly: boolean;
  active: boolean;
  purchaseUnit: string;
  defaultSectionId: string | null;
};
type Section = { id: string; name: string };

// One catalog row. The section dropdown auto-saves on change (and regroups the list); the
// name still links to the detail page, and Delete soft-deletes (deactivates) the item.
export default function ItemRow({ item, sections }: { item: Item; sections: Section[] }) {
  function submitOnChange(e: React.SyntheticEvent<HTMLElement>) {
    (e.currentTarget as HTMLElement).closest("form")?.requestSubmit();
  }

  return (
    <li className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm">
      <Link
        href={`/items/${item.id}`}
        className={`min-w-0 flex-1 truncate hover:underline ${
          item.active ? "" : "text-gray-400 line-through"
        }`}
      >
        {item.canonicalName}
        {item.variant ? (
          <span className="ml-2 text-xs text-gray-400">{item.variant}</span>
        ) : null}
        {item.aldiFriendly ? null : (
          <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700">
            non-Aldi
          </span>
        )}
      </Link>

      <div className="flex shrink-0 items-center gap-2">
        <form key={`${item.id}:${item.defaultSectionId}`} action={setItemSection}>
          <input type="hidden" name="id" value={item.id} />
          <select
            name="defaultSectionId"
            defaultValue={item.defaultSectionId ?? ""}
            className="input w-40"
            onChange={submitOnChange}
          >
            <option value="">— Other —</option>
            {sections.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </form>

        <span className="w-16 text-right text-gray-500">{item.purchaseUnit}</span>

        <form action={setItemActive}>
          <input type="hidden" name="id" value={item.id} />
          <input type="hidden" name="active" value="false" />
          <button className="text-xs text-red-600 hover:underline">Delete</button>
        </form>
      </div>
    </li>
  );
}
