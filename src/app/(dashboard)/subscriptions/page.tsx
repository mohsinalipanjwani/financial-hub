import { requireFinancialAccess } from "@/lib/auth";
import { loadRateTable } from "@/lib/finance/rates";
import { tryConvertCurrency } from "@/lib/finance/calculations";
import { prisma } from "@/lib/prisma";
import { PageHeader, Card, StatTile, SectionTitle, EmptyState, Badge } from "@/components/ui";
import { HorizontalBarChart, DonutChart } from "@/components/charts";
import { formatCurrency, formatDate } from "@/lib/format";
import { NoAccess } from "@/components/no-access";

export const dynamic = "force-dynamic";

export default async function SubscriptionsPage() {
  try {
    await requireFinancialAccess();
  } catch {
    return <NoAccess />;
  }

  const reporting = process.env.DEFAULT_REPORTING_CURRENCY || "USD";
  const rates = await loadRateTable(new Date());
  const subs = await prisma.subscription.findMany({ where: { archived: false }, orderBy: { monthlyCost: "desc" } });

  const active = subs.filter((s) => s.active);
  const convert = (s: (typeof subs)[number]) => tryConvertCurrency(Number(s.monthlyCost), s.currency, reporting, rates) ?? 0;
  const monthlyTotal = Math.round(active.reduce((sum, s) => sum + convert(s), 0) * 100) / 100;

  const bySoftware = active.map((s) => ({ name: s.name, value: Math.round(convert(s) * 100) / 100 })).sort((a, b) => b.value - a.value);

  const catMap = new Map<string, number>();
  const ownerMap = new Map<string, number>();
  for (const s of active) {
    catMap.set(s.category || "Other", (catMap.get(s.category || "Other") ?? 0) + convert(s));
    ownerMap.set(s.owner || "Unassigned", (ownerMap.get(s.owner || "Unassigned") ?? 0) + convert(s));
  }
  const byCategory = [...catMap.entries()].map(([name, value]) => ({ name, value: Math.round(value * 100) / 100 }));
  const byOwner = [...ownerMap.entries()].map(([name, value]) => ({ name, value: Math.round(value * 100) / 100 })).sort((a, b) => b.value - a.value);

  const now = new Date();
  const upcoming = subs
    .filter((s) => s.active && s.renewalDate)
    .map((s) => ({ ...s, renewalDate: s.renewalDate! }))
    .sort((a, b) => a.renewalDate.getTime() - b.renewalDate.getTime())
    .slice(0, 8);

  return (
    <div>
      <PageHeader title="Subscriptions" description="Software & tooling costs" />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <StatTile label="Monthly Subscription Cost" value={formatCurrency(monthlyTotal, reporting)} />
        <StatTile label="Annualized Cost" value={formatCurrency(Math.round(monthlyTotal * 12 * 100) / 100, reporting)} />
        <StatTile label="Active Subscriptions" value={String(active.length)} sub={`${subs.length} total`} />
      </div>

      <div className="grid lg:grid-cols-2 gap-6 mb-6">
        <Card>
          <SectionTitle>Cost by Software</SectionTitle>
          {bySoftware.length > 0 ? <HorizontalBarChart data={bySoftware} /> : <EmptyState message="No active subscriptions." />}
        </Card>
        <Card>
          <SectionTitle>Cost by Category</SectionTitle>
          {byCategory.length > 0 ? <DonutChart data={byCategory} /> : <EmptyState message="No data." />}
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-6 mb-6">
        <Card>
          <SectionTitle>Cost by Owner</SectionTitle>
          {byOwner.length > 0 ? <HorizontalBarChart data={byOwner} color="#0ea5e9" /> : <EmptyState message="No data." />}
        </Card>
        <Card>
          <SectionTitle>Upcoming Renewals</SectionTitle>
          {upcoming.length === 0 ? (
            <EmptyState message="No upcoming renewals." />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted border-b">
                  <th className="py-2 font-medium">Subscription</th>
                  <th className="py-2 font-medium">Renewal</th>
                  <th className="py-2 font-medium text-right">Monthly</th>
                </tr>
              </thead>
              <tbody>
                {upcoming.map((s) => {
                  const soon = s.renewalDate.getTime() - now.getTime() < 30 * 86400000;
                  return (
                    <tr key={s.id} className="border-b last:border-0">
                      <td className="py-2 font-medium">{s.name}</td>
                      <td className="py-2">{formatDate(s.renewalDate)} {soon && <Badge tone="warning">soon</Badge>}</td>
                      <td className="py-2 text-right tabular-nums">{formatCurrency(convert(s), reporting)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Card>
      </div>

      <Card>
        <SectionTitle>All Subscriptions</SectionTitle>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted border-b">
                <th className="py-2 font-medium">Subscription</th>
                <th className="py-2 font-medium">Category</th>
                <th className="py-2 font-medium">Owner</th>
                <th className="py-2 font-medium text-right">Monthly Cost</th>
                <th className="py-2 font-medium text-right">In {reporting}</th>
                <th className="py-2 pl-6 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {subs.map((s) => (
                <tr key={s.id} className="border-b last:border-0 hover:bg-surface-2">
                  <td className="py-2.5 font-medium">{s.name}</td>
                  <td className="py-2.5 text-muted">{s.category ?? "—"}</td>
                  <td className="py-2.5 text-muted">{s.owner ?? "—"}</td>
                  <td className="py-2.5 text-right tabular-nums">{formatCurrency(Number(s.monthlyCost), s.currency)}</td>
                  <td className="py-2.5 text-right tabular-nums">{formatCurrency(convert(s), reporting)}</td>
                  <td className="py-2.5 pl-6"><Badge tone={s.active ? "positive" : "neutral"}>{s.active ? "Active" : "Inactive"}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
