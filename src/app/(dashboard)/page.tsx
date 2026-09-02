import Link from "next/link";
import { requireFinancialAccess } from "@/lib/auth";
import { resolvePeriod, yearPeriod } from "@/lib/finance/period";
import {
  getSummary,
  getMonthlyTrend,
  getClientPerformance,
  getExpenseBreakdown,
} from "@/lib/finance/service";
import { getFilterOptions } from "@/lib/layout-data";
import { Filters } from "@/components/filters";
import { PageHeader, KpiCard, Card, SectionTitle, EmptyState, Badge } from "@/components/ui";
import { RevenueVsCostChart, TrendChart, HorizontalBarChart, DonutChart } from "@/components/charts";
import { formatCurrency, formatPercent } from "@/lib/format";
import { NoAccess } from "@/components/no-access";

export const dynamic = "force-dynamic";

export default async function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  try {
    await requireFinancialAccess();
  } catch {
    return <NoAccess />;
  }

  const sp = await searchParams;
  const period = resolvePeriod(sp);
  const filters = { clientId: sp.clientId, source: sp.source };
  const { clients, sources } = await getFilterOptions();

  const [summary, trend, clientPerf, breakdown] = await Promise.all([
    getSummary(period, filters),
    // Trend uses the whole year for context, not just the selected month.
    getMonthlyTrend(yearPeriod(period.start.getUTCFullYear()), filters),
    getClientPerformance(period, filters),
    getExpenseBreakdown(period, filters),
  ]);

  const cur = summary.reportingCurrency;
  const money = (n: number) => formatCurrency(n, cur);

  const breakdownData = [
    { name: "Team", value: breakdown.team },
    { name: "Subscriptions", value: breakdown.subscriptions },
    { name: "Other Expenses", value: breakdown.otherExpenses },
  ].filter((d) => d.value > 0);

  const revenueByClient = clientPerf.slice(0, 8).map((c) => ({ name: c.clientName, value: c.revenue }));

  return (
    <div>
      <PageHeader
        title="Overview"
        description={`How are we doing financially — ${period.label}`}
      />
      <Filters clients={clients} sources={sources} />

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KpiCard label="Revenue" value={money(summary.revenue)} change={summary.changes.revenue} />
        <KpiCard label="Received" value={money(summary.received)} change={summary.changes.received} />
        <KpiCard label="Pending" value={money(summary.pending)} change={summary.changes.pending} invertChange />
        <KpiCard label="Team Cost" value={money(summary.teamCost)} change={summary.changes.teamCost} invertChange />
        <KpiCard label="Subscriptions" value={money(summary.subscriptionCost)} change={summary.changes.subscriptionCost} invertChange />
        <KpiCard label="Other Expenses" value={money(summary.otherExpenses)} change={summary.changes.otherExpenses} invertChange />
        <KpiCard label="Net Profit" value={money(summary.netProfit)} change={summary.changes.netProfit} />
        <KpiCard label="Profit Margin" value={formatPercent(summary.profitMargin)} change={summary.changes.profitMargin} />
      </div>

      {/* Revenue vs Cost */}
      <Card className="mb-6">
        <SectionTitle>Revenue vs Cost — {period.start.getUTCFullYear()}</SectionTitle>
        {trend.length > 0 ? <RevenueVsCostChart data={trend} /> : <EmptyState message="No data for this year." />}
      </Card>

      <div className="grid lg:grid-cols-2 gap-6 mb-6">
        <Card>
          <SectionTitle>Revenue Trend</SectionTitle>
          {trend.length > 0 ? <TrendChart data={trend} dataKey="revenue" name="Revenue" /> : <EmptyState message="No data." />}
        </Card>
        <Card>
          <SectionTitle>Profit Trend</SectionTitle>
          {trend.length > 0 ? <TrendChart data={trend} dataKey="netProfit" name="Net Profit" color="#16a34a" /> : <EmptyState message="No data." />}
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-6 mb-6">
        <Card>
          <SectionTitle>Revenue by Client</SectionTitle>
          {revenueByClient.length > 0 ? <HorizontalBarChart data={revenueByClient} /> : <EmptyState message="No revenue this period." />}
        </Card>
        <Card>
          <SectionTitle>Expense Breakdown</SectionTitle>
          {breakdownData.length > 0 ? <DonutChart data={breakdownData} /> : <EmptyState message="No expenses this period." />}
        </Card>
      </div>

      {/* Client performance table */}
      <Card>
        <SectionTitle>Client Performance</SectionTitle>
        {clientPerf.length === 0 ? (
          <EmptyState message="No client revenue in this period." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted border-b">
                  <th className="py-2 font-medium">Client</th>
                  <th className="py-2 font-medium text-right">Revenue</th>
                  <th className="py-2 font-medium text-right">Received</th>
                  <th className="py-2 font-medium text-right">Pending</th>
                  <th className="py-2 font-medium text-right">Contribution</th>
                </tr>
              </thead>
              <tbody>
                {clientPerf.map((c) => (
                  <tr key={c.clientId} className="border-b last:border-0 hover:bg-surface-2">
                    <td className="py-2.5">
                      <Link href={`/clients/${c.clientId}`} className="font-medium hover:underline" style={{ color: "var(--primary)" }}>
                        {c.clientName}
                      </Link>
                    </td>
                    <td className="py-2.5 text-right tabular-nums">{money(c.revenue)}</td>
                    <td className="py-2.5 text-right tabular-nums" style={{ color: "var(--positive)" }}>{money(c.received)}</td>
                    <td className="py-2.5 text-right tabular-nums" style={{ color: c.pending > 0 ? "var(--warning)" : "var(--muted)" }}>{money(c.pending)}</td>
                    <td className="py-2.5 text-right">
                      <Badge tone="neutral">{formatPercent(c.contribution)}</Badge>
                    </td>
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
