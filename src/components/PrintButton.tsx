"use client";

export default function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="no-print rounded bg-aldi-navy px-3 py-1.5 text-sm text-white hover:bg-aldi-navy/90"
    >
      Print
    </button>
  );
}
