import Link from "next/link";
import ReceiptImportForm from "@/components/ReceiptImportForm";

export const dynamic = "force-dynamic";

export default function ImportReceiptPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Import receipt</h1>
        <Link href="/receipts" className="text-sm text-gray-500 hover:text-gray-900">
          ← All receipts
        </Link>
      </div>

      {/* The boundary (phase2 §0): receipt READING happens in a separate chat; the app only
          imports the resulting JSON file. The app never calls an LLM or reads receipt images. */}
      <div className="max-w-xl rounded border border-gray-200 bg-white px-4 py-3 text-sm text-gray-600">
        <p className="font-medium text-gray-800">How this works</p>
        <ol className="mt-1 list-decimal space-y-1 pl-5">
          <li>Paste the saved receipt-parsing prompt into a fresh LLM chat.</li>
          <li>Attach your Aldi receipt photo (or paste the digital-receipt text).</li>
          <li>Save the JSON it returns and import it below.</li>
        </ol>
        <p className="mt-2 text-xs text-gray-500">
          The app stays local: it validates and stores the JSON deterministically and never sends
          anything to an external service.
        </p>
      </div>

      <ReceiptImportForm />
    </div>
  );
}
