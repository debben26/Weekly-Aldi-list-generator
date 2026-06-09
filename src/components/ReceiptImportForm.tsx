"use client";

import { useActionState } from "react";
import { importReceiptAction, type ImportFormState } from "@/app/receipts/actions";

// Import Receipt screen (phase2 §9). Accepts a .json file OR pasted text. Validation errors block;
// reconciliation mismatches come back as warnings with a "proceed anyway" confirmation (the JSON is
// echoed back as pendingJson so the user doesn't have to re-pick the file).
export default function ReceiptImportForm() {
  const [state, formAction, pending] = useActionState(importReceiptAction, {} as ImportFormState);
  const needsConfirmation = !!state.warnings?.length && !!state.pendingJson;

  return (
    <div className="max-w-xl space-y-4">
      {state.error ? (
        <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-aldi-red">
          {state.error}
        </div>
      ) : null}

      {needsConfirmation ? (
        <div className="space-y-3 rounded border border-amber-300 bg-amber-50 px-3 py-3 text-sm text-amber-900">
          <div className="font-medium">The totals don&apos;t fully reconcile:</div>
          <ul className="list-disc space-y-1 pl-5">
            {state.warnings!.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
          <p className="text-amber-800">
            Coupons, deposits, and rounding can cause this. You can import anyway.
          </p>
          <form action={formAction} className="flex items-center gap-3">
            <input type="hidden" name="json" value={state.pendingJson} />
            <input type="hidden" name="acknowledgeWarnings" value="true" />
            <button
              type="submit"
              disabled={pending}
              className="rounded bg-amber-700 px-4 py-2 text-sm text-white hover:bg-amber-800 disabled:opacity-50"
            >
              {pending ? "Importing…" : "Import anyway"}
            </button>
          </form>
        </div>
      ) : null}

      <form action={formAction} className="space-y-4">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-gray-700">
            Receipt JSON file (.json)
          </span>
          <input type="file" name="file" accept="application/json,.json" className="block text-sm" />
        </label>

        <div className="text-center text-xs uppercase tracking-wide text-gray-400">or paste</div>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-gray-700">Paste JSON</span>
          <textarea
            name="json"
            rows={10}
            className="input font-mono text-xs"
            placeholder='{ "store": "Aldi", "purchase_date": "2026-06-05", ... }'
          />
        </label>

        <button
          type="submit"
          disabled={pending}
          className="btn-primary"
        >
          {pending ? "Importing…" : "Import receipt"}
        </button>
      </form>
    </div>
  );
}
