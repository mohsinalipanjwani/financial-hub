import Link from "next/link";
import { notFound } from "next/navigation";
import { requireFinancialAccess } from "@/lib/auth";
import { getClientDetail } from "@/lib/finance/service";
import { PageHeader, Card, StatTile, SectionTitle, EmptyState, Badge } from "@/components/ui";
import { TrendChart, DonutChart } from "@/components/charts";
import { formatCurrency, formatPercent, formatDate } from "@/lib/format";
import { NoAccess } from "@/components/no-access";

export const dynamic = "force-dynamic";

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  try {
    await requireFinancialAccess();
  } catch {
    return <NoAccess />;
  }

  const { id } = await params;
  const detail = await getClientDetail(id);
  if (!detail) notFound();

  const money = (n: number) => formatCurrency(n, detail.reportingCurrency);

  return (
    <div>
      <div className="mb-4">
        <Link href="/clients" className="text-sm text-muted hover:text-foreground">← Back to clients</Link>
      </div>
      <PageHeader
        title={detail.client.name}
        description={[detail.client.source, detail.client.lead && `Lead: ${detail.client.lead}`, detail.client.accountManager && `AM: ${detail.client.accountManager}`].filter(Boolean).join(" · ")}
        actions={<Badge tone={detail.client.active ? "positive" : "neutral"}>{detail.client.active ? "Active" : "Inactive"}</Badge>}
      />

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        <StatTile label="Total Revenue" value={money(detail.totalRevenue)} />
        <StatTile label="Received" value={money(detail.received)} />
        <StatTile label="Pending" value={money(detail.pending)} />
        <StatTile label="Projects" value={String(detail.projectCount)} />
        <StatTile label="Contribution" value={formatPercent(detail.contribution)} sub="of total revenue" />
      </div>

      <div className="grid lg:grid-cols-2 gap-6 mb-6">
        <Card>
          <SectionTitle>Monthly Revenue Trend</SectionTitle>
          {detail.monthlyTrend.length > 0 ? <TrendChart data={detail.monthlyTrend} dataKey="revenue" name="Revenue" /> : <EmptyState message="No revenue recorded." />}
        </Card>
        <Card>
          <SectionTitle>Revenue by Phase</SectionTitle>
          {detail.revenueByPhase.length > 0 ? <DonutChart data={detail.revenueByPhase} /> : <EmptyState message="No phase data." />}
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-6 mb-6">
        <Card>
          <SectionTitle>Projects</SectionTitle>
          {detail.projects.length === 0 ? (
            <EmptyState message="No projects." />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted border-b"><th className="py-2 font-medium">Project</th><th className="py-2 font-medium text-right">Revenue</th></tr>
              </thead>
              <tbody>
                {detail.projects.map((p) => (
                  <tr key={p.name} className="border-b last:border-0"><td className="py-2">{p.name}</td><td className="py-2 text-right tabular-nums">{money(p.revenue)}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card>
          <SectionTitle>Pending Payments</SectionTitle>
          {detail.pendingItems.length === 0 ? (
            <EmptyState message="No pending payments — all settled." />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted border-b">
                  <th className="py-2 font-medium">Revenue</th><th className="py-2 font-medium">Project</th>
                  <th className="py-2 font-medium text-right">Pending</th><th className="py-2 font-medium text-right">Expected</th>
                </tr>
              </thead>
              <tbody>
                {detail.pendingItems.map((p) => (
                  <tr key={p.revenueKey} className="border-b last:border-0">
                    <td className="py-2 font-mono text-xs">{p.revenueKey}</td>
                    <td className="py-2">{p.project ?? "—"}</td>
                    <td className="py-2 text-right tabular-nums" style={{ color: "var(--warning)" }}>{money(p.pending)}</td>
                    <td className="py-2 text-right text-muted">{formatDate(p.expectedDate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>

      <Card>
        <SectionTitle>Payment History</SectionTitle>
        {detail.payments.length === 0 ? (
          <EmptyState message="No payments recorded." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted border-b">
                  <th className="py-2 font-medium">Date</th><th className="py-2 font-medium">Method</th>
                  <th className="py-2 font-medium text-right">Amount</th><th className="py-2 font-medium text-right">In {detail.reportingCurrency}</th>
                </tr>
              </thead>
              <tbody>
                {detail.payments.map((p) => (
                  <tr key={p.id} className="border-b last:border-0">
                    <td className="py-2">{formatDate(p.date)}</td>
                    <td className="py-2">{p.method ?? "—"}</td>
                    <td className="py-2 text-right tabular-nums">{formatCurrency(p.amount, p.currency)}</td>
                    <td className="py-2 text-right tabular-nums" style={{ color: "var(--positive)" }}>{money(p.converted)}</td>
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
