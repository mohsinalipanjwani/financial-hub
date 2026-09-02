import { requireFinancialAccess } from "@/lib/auth";
import { resolvePeriod } from "@/lib/finance/period";
import { loadRateTable } from "@/lib/finance/rates";
import { tryConvertCurrency } from "@/lib/finance/calculations";
import { prisma } from "@/lib/prisma";
import { getFilterOptions } from "@/lib/layout-data";
import { Filters } from "@/components/filters";
import { SearchBox } from "@/components/search-box";
import { ExportButton } from "@/components/export-button";
import { PageHeader, Card, StatTile, EmptyState, Badge } from "@/components/ui";
import { formatCurrency, formatDate } from "@/lib/format";
import { NoAccess } from "@/components/no-access";

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, "positive" | "warning" | "negative" | "neutral"> = {
  PAID: "positive",
  PARTIAL: "warning",
  PENDING: "negative",
};

export default async function RevenuePage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  try {
    await requireFinancialAccess();
  } catch {
    return <NoAccess />;
  }

  const sp = await searchParams;
  const period = resolvePeriod(sp);
  const { clients, sources } = await getFilterOptions();
  const rates = await loadRateTable(period.end);
  const reporting = process.env.DEFAULT_REPORTING_CURRENCY || "USD";

  const q = sp.q?.trim();
  const rows = await prisma.revenue.findMany({
    where: {
      archived: false,
      month: { gte: period.start, lt: period.end },
      ...(sp.clientId ? { clientId: sp.clientId } : {}),
      ...(sp.source ? { client: { source: sp.source } } : {}),
      ...(q
        ? {
            OR: [
              { revenueKey: { contains: q, mode: "insensitive" } },
              { project: { contains: q, mode: "insensitive" } },
              { phase: { contains: q, mode: "insensitive" } },
              { client: { name: { contains: q, mode: "insensitive" } } },
            ],
          }
        : {}),
    },
    include: { client: true },
    orderBy: { date: "desc" },
  });

  const converted = rows.map((r) => tryConvertCurrency(Number(r.amount), r.currency, reporting, rates) ?? 0);
  const total = Math.round(converted.reduce((a, b) => a + b, 0) * 100) / 100;
  const paidCount = rows.filter((r) => r.paymentStatus === "PAID").length;
  const pendingCount = rows.filter((r) => r.paymentStatus !== "PAID").length;

  return (
    <div>
      <PageHeader
        title="Revenue"
        description={`Revenue records — ${period.label}`}
        actions={<div className="flex gap-2"><SearchBox placeholder="Search client, project, ID…" /><ExportButton type="revenue" /></div>}
      />
      <Filters clients={clients} sources={sources} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatTile label="Total Revenue" value={formatCurrency(total, reporting)} />
        <StatTile label="Records" value={String(rows.length)} />
        <StatTile label="Paid" value={String(paidCount)} />
        <StatTile label="Outstanding" value={String(pendingCount)} />
      </div>

      <Card>
        {rows.length === 0 ? (
          <EmptyState message="No revenue records for this period." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted border-b">
                  <th className="py-2 font-medium">ID</th>
                  <th className="py-2 font-medium">Client</th>
                  <th className="py-2 font-medium">Project</th>
                  <th className="py-2 font-medium">Phase</th>
                  <th className="py-2 font-medium">Date</th>
                  <th className="py-2 font-medium text-right">Amount</th>
                  <th className="py-2 font-medium text-right">In {reporting}</th>
                  <th className="py-2 pl-6 font-medium">Payment</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.id} className="border-b last:border-0 hover:bg-surface-2">
                    <td className="py-2.5 font-mono text-xs">{r.revenueKey}</td>
                    <td className="py-2.5">{r.client.name}</td>
                    <td className="py-2.5">{r.project ?? "—"}</td>
                    <td className="py-2.5 text-muted">{r.phase ?? "—"}</td>
                    <td className="py-2.5 text-muted">{formatDate(r.date)}</td>
                    <td className="py-2.5 text-right tabular-nums">{formatCurrency(Number(r.amount), r.currency)}</td>
                    <td className="py-2.5 text-right tabular-nums">{formatCurrency(converted[i], reporting)}</td>
                    <td className="py-2.5 pl-6"><Badge tone={STATUS_TONE[r.paymentStatus] ?? "neutral"}>{r.paymentStatus}</Badge></td>
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
