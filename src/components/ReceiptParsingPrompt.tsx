"use client";

import { useState } from "react";
import { RECEIPT_PARSING_PROMPT } from "@/lib/receiptParsingPrompt";

// Shows the saved receipt-parsing prompt (phase2 Appendix B) on the Import Receipt screen with a
// copy button, so step 1 ("paste the saved receipt-parsing prompt") has something to copy. Expanded
// by default (it's the first step) but still collapsible.
export default function ReceiptParsingPrompt() {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(RECEIPT_PARSING_PROMPT);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <details open className="max-w-xl rounded border border-gray-200 bg-white px-4 py-3 text-sm">
      <summary className="cursor-pointer font-medium text-gray-800">
        Receipt-parsing prompt
      </summary>
      <div className="mt-3 space-y-2">
        <button
          type="button"
          onClick={copy}
          className="rounded bg-gray-900 px-3 py-1.5 text-xs text-white hover:bg-gray-700"
        >
          {copied ? "Copied!" : "Copy prompt"}
        </button>
        <pre className="max-h-72 overflow-auto rounded bg-gray-50 p-3 font-mono text-xs whitespace-pre-wrap text-gray-700">
          {RECEIPT_PARSING_PROMPT}
        </pre>
      </div>
    </details>
  );
}
