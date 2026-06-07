import { getAnalytics } from "./data";
import { ANALYTICS_DEFAULT_WINDOW_MONTHS } from "@/services/AnalyticsService";

export const dynamic = "force-dynamic";

const money = (n: number) => `$${n.toFixed(2)}`;

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ completed?: string }>;
}) {
  const { completed } = await searchParams;
  const a = await getAnalytics();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">History &amp; Analytics</h1>
        <p className="mt-1 text-sm text-gray-500">
          Last {ANALYTICS_DEFAULT_WINDOW_MONTHS} months (since {a.since.toISOString().slice(0, 10)}).
        </p>
      </div>

      {completed ? (
        <div className="rounded border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
          Trip completed and frozen to history.
        </div>
      ) : null}

      {a.trips.length === 0 ? (
        <p className="text-sm text-gray-500">
          No completed trips yet. Generate a grocery list and use{" "}
          <strong>Complete trip</strong> to start building history.
        </p>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Card label="Completed trips" value={String(a.trips.length)} />
            <Card label="Known spend (paid)" value={money(a.totalPaid)} />
            <Card label="Estimated total" value={money(a.totalEstimated)} />
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <Panel title="Spend by section">
              {a.spendBySection.length === 0 ? (
                <Empty>No paid prices recorded.</Empty>
              ) : (
                <Table rows={a.spendBySection.map((s) => [s.section, money(s.total)])} />
              )}
            </Panel>

            <Panel title="Most-purchased items">
              {a.topItems.length === 0 ? (
                <Empty>No purchases recorded.</Empty>
              ) : (
                <Table
                  rows={a.topItems.slice(0, 10).map((i) => [i.displayName, `${i.count}×`])}
                />
              )}
            </Panel>

            <Panel title="Most-selected meals">
              {a.meals.length === 0 ? (
                <Empty>No completed meal plans yet.</Empty>
              ) : (
                <Table rows={a.meals.slice(0, 10).map((m) => [m.title, `${m.count}×`])} />
              )}
            </Panel>

            <Panel title="Recent trips">
              <Table
                rows={a.trips.map((t) => [
                  `Week of ${t.weekStart.toISOString().slice(0, 10)}`,
                  `${t.itemCount} items · ${t.totalPaid != null ? money(t.totalPaid) : "—"}`,
                ])}
              />
            </Panel>
          </div>

          <Panel title="Price history (estimated vs paid)">
            {a.priceHistory.length === 0 ? (
              <Empty>No price observations yet.</Empty>
            ) : (
              <div className="space-y-3">
                {a.priceHistory.map((p) => (
                  <div key={p.name}>
                    <div className="text-sm font-medium">{p.name}</div>
                    <div className="flex flex-wrap gap-2 text-xs text-gray-600">
                      {p.points.map((pt, i) => (
                        <span key={i} className="rounded bg-gray-100 px-2 py-0.5">
                          {pt.date.toISOString().slice(0, 10)}: {money(pt.amount)}
                          <span className="ml-1 text-gray-400">({pt.sourceType})</span>
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </>
      )}
    </div>
  );
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="text-xs uppercase tracking-wide text-gray-500">{label}</div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4">
      <h2 className="mb-2 font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-gray-400">{children}</p>;
}

function Table({ rows }: { rows: [string, string][] }) {
  return (
    <ul className="divide-y divide-gray-100">
      {rows.map(([left, right], i) => (
        <li key={i} className="flex items-center justify-between py-1.5 text-sm">
          <span className="text-gray-700">{left}</span>
          <span className="tabular-nums text-gray-600">{right}</span>
        </li>
      ))}
    </ul>
  );
}
