import { requireFinancialAccess } from "@/lib/auth";
import { resolvePeriod } from "@/lib/finance/period";
import { loadRateTable } from "@/lib/finance/rates";
import { tryConvertCurrency } from "@/lib/finance/calculations";
import { prisma } from "@/lib/prisma";
import { getFilterOptions } from "@/lib/layout-data";
import { Filters } from "@/components/filters";
import { PageHeader, Card, StatTile, EmptyState, Badge } from "@/components/ui";
import { formatCurrency, formatDate } from "@/lib/format";
import { NoAccess } from "@/components/no-access";

export const dynamic = "force-dynamic";

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  try {
    await requireFinancialAccess();
  } catch {
    return <NoAccess />;
  }

  const sp = await searchParams;
  const period = resolvePeriod(sp);
  const { clients } = await getFilterOptions();
  const reporting = process.env.DEFAULT_REPORTING_CURRENCY || "USD";
  const rates = await loadRateTable(period.end);

  const rows = await prisma.payment.findMany({
    where: {
      archived: false,
      date: { gte: period.start, lt: period.end },
      ...(sp.clientId ? { clientId: sp.clientId } : {}),
    },
    include: { client: true, revenue: true },
    orderBy: { date: "desc" },
  });

  const converted = rows.map((r) => tryConvertCurrency(Number(r.amount), r.currency, reporting, rates) ?? 0);
  const total = Math.round(converted.reduce((a, b) => a + b, 0) * 100) / 100;

  return (
    <div>
      <PageHeader title="Payments" description={`Actual cash received — ${period.label}`} />
      <Filters clients={clients} sources={[]} />

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        <StatTile label="Total Received" value={formatCurrency(total, reporting)} />
        <StatTile label="Payments" value={String(rows.length)} />
        <StatTile label="Cleared" value={String(rows.filter((r) => r.status === "CLEARED").length)} />
      </div>

      <Card>
        {rows.length === 0 ? (
          <EmptyState message="No payments for this period." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted border-b">
                  <th className="py-2 font-medium">ID</th>
                  <th className="py-2 font-medium">Date</th>
                  <th className="py-2 font-medium">Client</th>
                  <th className="py-2 font-medium">Revenue</th>
                  <th className="py-2 font-medium">Method</th>
                  <th className="py-2 font-medium text-right">Amount</th>
                  <th className="py-2 font-medium text-right">In {reporting}</th>
                  <th className="py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.id} className="border-b last:border-0 hover:bg-surface-2">
                    <td className="py-2.5 font-mono text-xs">{r.paymentKey}</td>
                    <td className="py-2.5 text-muted">{formatDate(r.date)}</td>
                    <td className="py-2.5">{r.client.name}</td>
                    <td className="py-2.5 font-mono text-xs text-muted">{r.revenue?.revenueKey ?? "—"}</td>
                    <td className="py-2.5">{r.method ?? "—"}</td>
                    <td className="py-2.5 text-right tabular-nums">{formatCurrency(Number(r.amount), r.currency)}</td>
                    <td className="py-2.5 text-right tabular-nums" style={{ color: "var(--positive)" }}>{formatCurrency(converted[i], reporting)}</td>
                    <td className="py-2.5"><Badge tone={r.status === "CLEARED" ? "positive" : r.status === "FAILED" ? "negative" : "warning"}>{r.status}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
