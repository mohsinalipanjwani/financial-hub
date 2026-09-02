import { requireFinancialAccess } from "@/lib/auth";
import { resolvePeriod } from "@/lib/finance/period";
import { loadRateTable } from "@/lib/finance/rates";
import { tryConvertCurrency } from "@/lib/finance/calculations";
import { prisma } from "@/lib/prisma";
import { Filters } from "@/components/filters";
import { PageHeader, Card, StatTile, SectionTitle, EmptyState, Badge } from "@/components/ui";
import { DonutChart } from "@/components/charts";
import { formatCurrency, formatDate } from "@/lib/format";
import { NoAccess } from "@/components/no-access";

export const dynamic = "force-dynamic";

export default async function ExpensesPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  try {
    await requireFinancialAccess();
  } catch {
    return <NoAccess />;
  }

  const sp = await searchParams;
  const period = resolvePeriod(sp);
  const reporting = process.env.DEFAULT_REPORTING_CURRENCY || "USD";
  const rates = await loadRateTable(period.end);

  const rows = await prisma.expense.findMany({
    where: { archived: false, month: { gte: period.start, lt: period.end } },
    orderBy: { date: "desc" },
  });

  const converted = rows.map((r) => tryConvertCurrency(Number(r.amount), r.currency, reporting, rates) ?? 0);
  const total = Math.round(converted.reduce((a, b) => a + b, 0) * 100) / 100;
  const unpaid = rows.filter((r) => !r.paid).length;

  const catMap = new Map<string, number>();
  rows.forEach((r, i) => catMap.set(r.category || "Other", (catMap.get(r.category || "Other") ?? 0) + converted[i]));
  const byCategory = [...catMap.entries()].map(([name, value]) => ({ name, value: Math.round(value * 100) / 100 }));

  return (
    <div>
      <PageHeader title="Other Expenses" description={`Non-salary, non-subscription costs — ${period.label}`} />
      <Filters clients={[]} sources={[]} showClient={false} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatTile label="Total Expenses" value={formatCurrency(total, reporting)} />
        <StatTile label="Records" value={String(rows.length)} />
        <StatTile label="Categories" value={String(byCategory.length)} />
        <StatTile label="Unpaid" value={String(unpaid)} />
      </div>

      <div className="grid lg:grid-cols-2 gap-6 mb-6">
        <Card>
          <SectionTitle>Expenses by Category</SectionTitle>
          {byCategory.length > 0 ? <DonutChart data={byCategory} /> : <EmptyState message="No expenses this period." />}
        </Card>
        <Card>
          <SectionTitle>Summary</SectionTitle>
          <table className="w-full text-sm">
            <tbody>
              {byCategory.sort((a, b) => b.value - a.value).map((c) => (
                <tr key={c.name} className="border-b last:border-0">
                  <td className="py-2">{c.name}</td>
                  <td className="py-2 text-right tabular-nums">{formatCurrency(c.value, reporting)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>

      <Card>
        <SectionTitle>All Expenses</SectionTitle>
        {rows.length === 0 ? (
          <EmptyState message="No expenses for this period." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted border-b">
                  <th className="py-2 font-medium">ID</th>
                  <th className="py-2 font-medium">Date</th>
                  <th className="py-2 font-medium">Category</th>
                  <th className="py-2 font-medium">Description</th>
                  <th className="py-2 font-medium text-right">Amount</th>
                  <th className="py-2 font-medium text-right">In {reporting}</th>
                  <th className="py-2 font-medium">Paid</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.id} className="border-b last:border-0 hover:bg-surface-2">
                    <td className="py-2.5 font-mono text-xs">{r.expenseKey}</td>
                    <td className="py-2.5 text-muted">{formatDate(r.date)}</td>
                    <td className="py-2.5">{r.category ?? "—"}</td>
                    <td className="py-2.5 text-muted">{r.description ?? "—"}</td>
                    <td className="py-2.5 text-right tabular-nums">{formatCurrency(Number(r.amount), r.currency)}</td>
                    <td className="py-2.5 text-right tabular-nums">{formatCurrency(converted[i], reporting)}</td>
                    <td className="py-2.5"><Badge tone={r.paid ? "positive" : "warning"}>{r.paid ? "Paid" : "Unpaid"}</Badge></td>
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
