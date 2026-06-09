import Link from "next/link";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

const STATUS_LABEL: Record<string, string> = {
  pending_review: "Needs review",
  completed: "Completed",
};

export default async function ReceiptsPage() {
  const receipts = await prisma.receipt.findMany({
    orderBy: [{ purchaseDate: "desc" }, { createdAt: "desc" }],
    include: { store: true, _count: { select: { lines: true } } },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-aldi-navy">Receipts</h1>
        <Link
          href="/receipts/import"
          className="rounded bg-aldi-navy px-4 py-2 text-sm text-white hover:bg-aldi-navy/90"
        >
          Import receipt
        </Link>
      </div>

      {receipts.length === 0 ? (
        <p className="text-sm text-gray-500">
          No receipts yet. Import one to start building real price history.
        </p>
      ) : (
        <div className="overflow-hidden card">
          <table className="w-full text-sm">
            <thead className="bg-aldi-navy/5 text-left text-xs uppercase tracking-wide text-aldi-navy/70">
              <tr>
                <th className="px-4 py-2">Date</th>
                <th className="px-4 py-2">Store</th>
                <th className="px-4 py-2 text-right">Lines</th>
                <th className="px-4 py-2 text-right">Total</th>
                <th className="px-4 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {receipts.map((r) => (
                <tr key={r.id} className="border-t border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-2">
                    <Link href={`/receipts/${r.id}`} className="text-gray-900 hover:underline">
                      {fmtDate(r.purchaseDate)}
                    </Link>
                  </td>
                  <td className="px-4 py-2">{r.store.name}</td>
                  <td className="px-4 py-2 text-right">{r._count.lines}</td>
                  <td className="px-4 py-2 text-right">
                    {r.currency === "USD" ? "$" : `${r.currency} `}
                    {Number(r.total).toFixed(2)}
                  </td>
                  <td className="px-4 py-2 text-gray-600">
                    {STATUS_LABEL[r.importStatus] ?? r.importStatus}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
