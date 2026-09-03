import { requireFinancialAccess, canViewSalaries } from "@/lib/auth";
import { resolvePeriod, monthsInPeriod } from "@/lib/finance/period";
import { loadRateTable } from "@/lib/finance/rates";
import { tryConvertCurrency } from "@/lib/finance/calculations";
import { prisma } from "@/lib/prisma";
import { Filters } from "@/components/filters";
import { PageHeader, Card, StatTile, SectionTitle, EmptyState } from "@/components/ui";
import { VerticalBarChart, TrendChart, DonutChart } from "@/components/charts";
import { formatCurrency } from "@/lib/format";
import { formatMonthLabel } from "@/lib/finance/period";
import { NoAccess } from "@/components/no-access";

export const dynamic = "force-dynamic";

export default async function TeamPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  let user;
  try {
    user = await requireFinancialAccess();
  } catch {
    return <NoAccess />;
  }
  const showSalaries = canViewSalaries(user.role);

  const sp = await searchParams;
  const period = resolvePeriod(sp);
  const reporting = process.env.DEFAULT_REPORTING_CURRENCY || "USD";
  const rates = await loadRateTable(period.end);

  const costs = await prisma.teamCost.findMany({
    where: { archived: false, month: { gte: period.start, lt: period.end } },
    include: { teamMember: true },
  });

  let salaryTotal = 0;
  let overheadTotal = 0;
  const byEmployee = new Map<string, number>();
  // Keyed by the month's UTC timestamp so the series can be sorted
  // chronologically — the query returns rows in no guaranteed order.
  const byMonth = new Map<number, number>();
  const employees = new Set<string>();

  for (const c of costs) {
    const salary = tryConvertCurrency(Number(c.salary), c.currency, reporting, rates) ?? 0;
    const overhead = tryConvertCurrency(Number(c.overhead), c.currency, reporting, rates) ?? 0;
    salaryTotal += salary;
    overheadTotal += overhead;
    employees.add(c.teamMemberId);
    byEmployee.set(c.teamMember.name, (byEmployee.get(c.teamMember.name) ?? 0) + salary + overhead);
    const mk = c.month.getTime();
    byMonth.set(mk, (byMonth.get(mk) ?? 0) + salary + overhead);
  }

  const totalCost = Math.round((salaryTotal + overheadTotal) * 100) / 100;
  const employeeCount = employees.size;
  const months = monthsInPeriod(period) || 1;
  const avgCost = employeeCount === 0 ? 0 : Math.round((totalCost / employeeCount / months) * 100) / 100;

  const costByEmployee = [...byEmployee.entries()].map(([name, value]) => ({ name, value: Math.round(value * 100) / 100 })).sort((a, b) => b.value - a.value);
  const monthlyCost = [...byMonth.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([ms, value]) => ({ month: formatMonthLabel(new Date(ms)), value: Math.round(value * 100) / 100 }));
  const salaryVsOverhead = [
    { name: "Salary", value: Math.round(salaryTotal * 100) / 100 },
    { name: "Overhead", value: Math.round(overheadTotal * 100) / 100 },
  ].filter((d) => d.value > 0);

  return (
    <div>
      <PageHeader title="Team" description={`Team costs — ${period.label}`} />
      <Filters clients={[]} sources={[]} showClient={false} />

      {!showSalaries && (
        <div className="card p-3 mb-4 text-sm" style={{ background: "rgba(217,119,6,0.08)", color: "var(--warning)" }}>
          You can see aggregate team costs. Individual salary detail is restricted to Finance and Admin roles.
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        <StatTile label="Total Team Cost" value={formatCurrency(totalCost, reporting)} />
        <StatTile label="Salary Cost" value={formatCurrency(Math.round(salaryTotal * 100) / 100, reporting)} />
        <StatTile label="Overhead" value={formatCurrency(Math.round(overheadTotal * 100) / 100, reporting)} />
        <StatTile label="Employees" value={String(employeeCount)} />
        <StatTile label="Avg / Employee / Mo" value={formatCurrency(avgCost, reporting)} />
      </div>

      <div className="grid lg:grid-cols-2 gap-6 mb-6">
        <Card>
          <SectionTitle>Monthly Team Cost</SectionTitle>
          {monthlyCost.length > 0 ? <TrendChart data={monthlyCost} dataKey="value" name="Team Cost" /> : <EmptyState message="No data." />}
        </Card>
        <Card>
          <SectionTitle>Salary vs Overhead</SectionTitle>
          {salaryVsOverhead.length > 0 ? <DonutChart data={salaryVsOverhead} /> : <EmptyState message="No data." />}
        </Card>
      </div>

      {showSalaries && (
        <Card>
          <SectionTitle>Cost by Employee</SectionTitle>
          {costByEmployee.length > 0 ? <VerticalBarChart data={costByEmployee} /> : <EmptyState message="No team costs this period." />}
        </Card>
      )}
    </div>
  );
}
