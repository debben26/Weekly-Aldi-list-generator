"use client";

export default function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="no-print rounded bg-gray-900 px-3 py-1.5 text-sm text-white hover:bg-gray-700"
    >
      Print
    </button>
  );
}
