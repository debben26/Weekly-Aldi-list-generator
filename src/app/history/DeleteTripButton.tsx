"use client";

import { deleteTrip } from "./actions";

// Irreversible action — guard with a confirm before the server action runs.
export default function DeleteTripButton({ snapshotId }: { snapshotId: string }) {
  return (
    <form action={deleteTrip}>
      <input type="hidden" name="snapshotId" value={snapshotId} />
      <button
        onClick={(e) => {
          if (
            !window.confirm(
              "Delete this trip? This permanently removes it from history and deletes its shopping list.",
            )
          ) {
            e.preventDefault();
          }
        }}
        className="rounded border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
      >
        Delete
      </button>
    </form>
  );
}
