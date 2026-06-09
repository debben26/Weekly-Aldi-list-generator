import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import ReceiptReviewLine, { type ReviewLine } from "@/components/ReceiptReviewLine";

export const dynamic = "force-dynamic";

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function money(currency: string, value: { toString(): string } | null): string | null {
  if (value == null) return null;
  const prefix = currency === "USD" ? "$" : `${currency} `;
  return `${prefix}${Number(value).toFixed(2)}`;
}

export default async function ReceiptDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [receipt, items, sections] = await Promise.all([
    prisma.receipt.findUnique({
      where: { id },
      include: {
        store: true,
        lines: {
          orderBy: { id: "asc" },
          include: { matchedItem: { select: { id: true, canonicalName: true } } },
        },
      },
    }),
    prisma.item.findMany({
      where: { active: true },
      orderBy: { canonicalName: "asc" },
      select: { id: true, canonicalName: true },
    }),
    prisma.storeSection.findMany({
      where: { active: true },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  if (!receipt) notFound();

  const total = receipt.lines.length;
  const resolved = receipt.lines.filter((l) => l.matchStatus !== "needs_review").length;
  const completed = receipt.importStatus === "completed";

  const lines: ReviewLine[] = receipt.lines.map((l) => ({
    id: l.id,
    rawName: l.rawName,
    quantity: l.quantity,
    lineTotal: Number(l.lineTotal).toFixed(2),
    matchStatus: l.matchStatus,
    matchConfidence: l.matchConfidence,
    matchedItem: l.matchedItem,
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-aldi-navy">{receipt.store.name}</h1>
        <Link href="/receipts" className="text-sm text-gray-500 hover:text-gray-900">
          ← Back to receipts
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm text-gray-600">
        <span>{fmtDate(receipt.purchaseDate)}</span>
        {money(receipt.currency, receipt.subtotal) ? (
          <span>Subtotal {money(receipt.currency, receipt.subtotal)}</span>
        ) : null}
        {money(receipt.currency, receipt.tax) ? (
          <span>Tax {money(receipt.currency, receipt.tax)}</span>
        ) : null}
        <span className="font-medium text-gray-800">Total {money(receipt.currency, receipt.total)}</span>
        <span
          className={`rounded px-2 py-0.5 text-xs ${
            completed ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-800"
          }`}
        >
          {completed ? "Completed" : `${resolved} of ${total} lines resolved`}
        </span>
      </div>

      <div className="overflow-hidden card">
        <ul className="divide-y divide-gray-100">
          {lines.map((line) => (
            <ReceiptReviewLine key={line.id} line={line} items={items} sections={sections} />
          ))}
        </ul>
      </div>
    </div>
  );
}
