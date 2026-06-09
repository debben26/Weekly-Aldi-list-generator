"use client";

import { useState, useActionState } from "react";
import { PURCHASE_UNITS } from "@/services/UnitService";
import {
  setLineMatch,
  createItemForLine,
  skipLine,
  type CreateItemFormState,
} from "@/app/receipts/review-actions";

type ItemOption = { id: string; canonicalName: string };
type SectionOption = { id: string; name: string };

export type ReviewLine = {
  id: string;
  rawName: string;
  quantity: number;
  lineTotal: string; // pre-formatted by the server
  matchStatus: "auto_matched" | "confirmed" | "needs_review" | "unmatched" | "new_item";
  matchConfidence: number | null;
  matchedItem: { id: string; canonicalName: string } | null;
};

const STATUS_BADGE: Record<ReviewLine["matchStatus"], { label: string; className: string }> = {
  auto_matched: { label: "Auto-matched", className: "bg-green-100 text-green-700" },
  confirmed: { label: "Confirmed", className: "bg-green-100 text-green-700" },
  new_item: { label: "New item", className: "bg-blue-100 text-blue-700" },
  needs_review: { label: "Needs review", className: "bg-amber-100 text-amber-800" },
  unmatched: { label: "Skipped", className: "bg-gray-100 text-gray-500" },
};

export default function ReceiptReviewLine({
  line,
  items,
  sections,
}: {
  line: ReviewLine;
  items: ItemOption[];
  sections: SectionOption[];
}) {
  const [picking, setPicking] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createState, createAction] = useActionState<CreateItemFormState, FormData>(
    createItemForLine,
    {},
  );

  const badge = STATUS_BADGE[line.matchStatus];
  const needsReview = line.matchStatus === "needs_review";
  const confidencePct =
    line.matchConfidence != null ? `${Math.round(line.matchConfidence * 100)}%` : null;

  return (
    <li className="space-y-2 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <span className="font-mono text-sm text-gray-800">
            {line.quantity}× {line.rawName}
          </span>
          <span className="ml-3 text-sm text-gray-500">${line.lineTotal}</span>
        </div>
        <span className={`rounded px-2 py-0.5 text-xs ${badge.className}`}>{badge.label}</span>
      </div>

      {/* Resolved lines: show the matched item. needs_review: show the suggestion (if any). */}
      {line.matchedItem ? (
        <div className="text-sm text-gray-700">
          {needsReview ? "Suggested: " : "Matched: "}
          <span className="font-medium">{line.matchedItem.canonicalName}</span>
          {confidencePct ? <span className="text-gray-400"> ({confidencePct})</span> : null}
        </div>
      ) : needsReview ? (
        <div className="text-sm text-gray-400">No suggestion — pick or create an item.</div>
      ) : null}

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2">
        {needsReview && line.matchedItem ? (
          <form action={setLineMatch}>
            <input type="hidden" name="lineId" value={line.id} />
            <input type="hidden" name="itemId" value={line.matchedItem.id} />
            <button type="submit" className="rounded bg-aldi-navy px-3 py-1 text-xs text-white hover:bg-aldi-navy/90">
              Confirm
            </button>
          </form>
        ) : null}

        <button
          type="button"
          onClick={() => {
            setPicking((v) => !v);
            setCreating(false);
          }}
          className="btn-secondary px-3 text-xs text-gray-700"
        >
          {line.matchStatus === "unmatched" ? "Pick item" : "Change"}
        </button>

        <button
          type="button"
          onClick={() => {
            setCreating((v) => !v);
            setPicking(false);
          }}
          className="btn-secondary px-3 text-xs text-gray-700"
        >
          New item
        </button>

        {line.matchStatus !== "unmatched" ? (
          <form action={skipLine}>
            <input type="hidden" name="lineId" value={line.id} />
            <button type="submit" className="rounded px-3 py-1 text-xs text-gray-500 hover:text-gray-800">
              Skip
            </button>
          </form>
        ) : null}
      </div>

      {/* Change / pick a different item */}
      {picking ? (
        <form action={setLineMatch} className="flex items-center gap-2">
          <input type="hidden" name="lineId" value={line.id} />
          <select name="itemId" required defaultValue="" className="input flex-1" aria-label="Pick item">
            <option value="" disabled>
              Select an item…
            </option>
            {items.map((i) => (
              <option key={i.id} value={i.id}>
                {i.canonicalName}
              </option>
            ))}
          </select>
          <button type="submit" className="rounded bg-aldi-navy px-3 py-1 text-xs text-white hover:bg-aldi-navy/90">
            Save
          </button>
        </form>
      ) : null}

      {/* Create a new item for this line */}
      {creating ? (
        <form action={createAction} className="space-y-2 rounded border border-gray-200 bg-gray-50 p-3">
          <input type="hidden" name="lineId" value={line.id} />
          {createState.error ? (
            <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-aldi-red">
              {createState.error}
            </div>
          ) : null}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <input
              name="canonicalName"
              defaultValue={line.rawName}
              required
              className="input sm:col-span-2"
              placeholder="Item name"
              aria-label="New item name"
            />
            <input
              name="purchaseUnit"
              required
              list="purchase-units"
              className="input"
              placeholder="Purchase unit"
              aria-label="Purchase unit"
            />
            <datalist id="purchase-units">
              {PURCHASE_UNITS.map((u) => (
                <option key={u} value={u} />
              ))}
            </datalist>
          </div>
          <select name="defaultSectionId" defaultValue="" className="input" aria-label="Section">
            <option value="">— Other —</option>
            {sections.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-1.5 text-xs">
              <input type="checkbox" name="food" defaultChecked /> Food
            </label>
            <label className="flex items-center gap-1.5 text-xs">
              <input type="checkbox" name="aldiFriendly" defaultChecked /> Aldi-friendly
            </label>
            <button type="submit" className="ml-auto rounded bg-aldi-navy px-3 py-1 text-xs text-white hover:bg-aldi-navy/90">
              Create &amp; match
            </button>
          </div>
        </form>
      ) : null}
    </li>
  );
}
