import { Fragment } from "react";
import type { OrderEstimate } from "@/services/OrderEstimationService";

// Total-order estimate panel (phase2-receipts-spec.md section 6.5 / 9). Server component,
// display-only: a prominent total, the [low, high] range, tax, trust summary, and breakdown.

const CONFIDENCE_BADGE: Record<string, string> = {
  high: "bg-green-100 text-green-700",
  medium: "bg-amber-100 text-amber-800",
  low: "bg-gray-100 text-gray-500",
};

function usd(n: number): string {
  return `$${n.toFixed(2)}`;
}

export default function OrderEstimatePanel({ estimate }: { estimate: OrderEstimate }) {
  const { subtotal, tax, total, lines, summary } = estimate;
  const groups = new Map<string, { name: string; sort: number; lines: typeof lines }>();
  for (const line of lines) {
    const key = line.sectionId ?? "none";
    if (!groups.has(key)) {
      groups.set(key, { name: line.sectionName, sort: line.sectionSort, lines: [] });
    }
    groups.get(key)!.lines.push(line);
  }
  const orderedGroups = [...groups.values()].sort((a, b) => a.sort - b.sort);

  return (
    <section className="card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-gray-700">Order estimate</h2>
        <span className="text-xs text-gray-500">{summary}</span>
      </div>

      <div className="mt-1 flex flex-wrap items-baseline gap-3">
        <span className="text-2xl font-semibold">{usd(total.point)}</span>
        <span className="text-sm text-gray-500">
          range {usd(total.low)} - {usd(total.high)}
        </span>
      </div>
      <p className="mt-0.5 text-xs text-gray-400">
        subtotal {usd(subtotal.point)}
        {tax.point > 0 ? ` - est. tax ${usd(tax.point)}` : " - no taxable items"}
      </p>

      <details className="mt-3">
        <summary className="cursor-pointer text-xs text-gray-500 hover:text-gray-800">
          Per-item breakdown
        </summary>
        <table className="mt-2 w-full text-xs">
          <thead className="text-left text-gray-400">
            <tr>
              <th className="py-1 font-medium">Item</th>
              <th className="py-1 text-right font-medium">Qty</th>
              <th className="py-1 text-right font-medium">Est.</th>
              <th className="py-1 text-right font-medium">Range</th>
              <th className="py-1 pl-2 font-medium">Basis</th>
            </tr>
          </thead>
          <tbody>
            {orderedGroups.map((g) => (
              <Fragment key={g.name}>
                <tr className="border-t border-gray-200 bg-gray-50">
                  <th colSpan={5} className="px-2 py-1 text-left font-semibold text-gray-700">
                    {g.name}
                  </th>
                </tr>
                {g.lines.map((l, i) => (
                  <tr key={`${l.displayName}-${i}`} className="border-t border-gray-100">
                    <td className="py-1 pr-2">
                      {l.displayName}
                      {l.taxable ? <span className="ml-1 text-gray-400">(taxable)</span> : null}
                    </td>
                    <td className="py-1 text-right text-gray-500">{l.quantity}</td>
                    <td className="py-1 text-right">{usd(l.point)}</td>
                    <td className="py-1 text-right text-gray-500">
                      {usd(l.low)}-{usd(l.high)}
                    </td>
                    <td className="py-1 pl-2">
                      <span className={`rounded px-1.5 py-0.5 ${CONFIDENCE_BADGE[l.confidence]}`}>
                        {l.confidence}
                      </span>
                      <span className="ml-1 text-gray-400">{l.basis}</span>
                    </td>
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  );
}
