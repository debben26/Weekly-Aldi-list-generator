import Link from "next/link";
import ReceiptImportForm from "@/components/ReceiptImportForm";
import ReceiptParsingPrompt from "@/components/ReceiptParsingPrompt";
import { loadRecentTrips } from "@/app/receipts/trip-link";

export const dynamic = "force-dynamic";

export default async function ImportReceiptPage() {
  const trips = await loadRecentTrips();
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-aldi-navy">Import receipt</h1>
        <Link href="/receipts" className="text-sm text-gray-500 hover:text-gray-900">
          ← All receipts
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <div className="space-y-6">
          {/* The boundary (phase2 §0): receipt READING happens in a separate chat; the app only
              imports the resulting JSON file. The app never calls an LLM or reads receipt images. */}
          <div className="rounded border border-gray-200 bg-white px-4 py-3 text-sm text-gray-600">
            <p className="font-medium text-gray-800">How this works</p>
            <ol className="mt-1 list-decimal space-y-1 pl-5">
              <li>Copy the saved receipt-parsing prompt (right) into a fresh LLM chat.</li>
              <li>Attach your Aldi receipt photo (or paste the digital-receipt text).</li>
              <li>Save the JSON it returns and import it below.</li>
            </ol>
            <p className="mt-2 text-xs text-gray-500">
              The app stays local: it validates and stores the JSON deterministically and never sends
              anything to an external service.
            </p>
          </div>

          <ReceiptImportForm trips={trips} />
        </div>

        <ReceiptParsingPrompt />
      </div>
    </div>
  );
}
