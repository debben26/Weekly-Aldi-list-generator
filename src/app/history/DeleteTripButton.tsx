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
        className="btn-danger px-2 text-xs"
      >
        Delete
      </button>
    </form>
  );
}
