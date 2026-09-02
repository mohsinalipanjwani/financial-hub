import { requireFinancialAccess } from "@/lib/auth";
import { resolvePeriod } from "@/lib/finance/period";
import { getSummary } from "@/lib/finance/service";
import { Filters } from "@/components/filters";
import { PageHeader, Card, SectionTitle } from "@/components/ui";
import { formatCurrency, formatPercent } from "@/lib/format";
import { NoAccess } from "@/components/no-access";

export const dynamic = "force-dynamic";

function PnlRow({ label, value, currency, negative = false }: { label: string; value: number; currency: string; negative?: boolean }) {
  const text = formatCurrency(value, currency);
  return (
    <div className="flex items-center justify-between py-2.5">
      <span>{label}</span>
      <span className="tabular-nums font-medium" style={{ color: negative && value !== 0 ? "var(--negative)" : undefined }}>
        {negative ? `-${text}` : text}
      </span>
    </div>
  );
}

export default async function PnlPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  try {
    await requireFinancialAccess();
  } catch {
    return <NoAccess />;
  }

  const sp = await searchParams;
  const period = resolvePeriod(sp);
  const summary = await getSummary(period, {});
  const cur = summary.reportingCurrency;
  const money = (n: number) => formatCurrency(n, cur);

  return (
    <div>
      <PageHeader title="Profit & Loss" description={`Company-level P&L — ${period.label}`} />
      <Filters clients={[]} sources={[]} showClient={false} />

      <div className="max-w-2xl">
        <Card>
          <SectionTitle>{period.label}</SectionTitle>
          <div className="divide-y">
            <div className="pb-1">
              <PnlRow label="Revenue" value={summary.revenue} currency={cur} />
            </div>

            <div className="py-1">
              <div className="text-xs uppercase tracking-wide text-muted pt-3 pb-1">Costs</div>
              <PnlRow label="Team Costs" value={summary.teamCost} currency={cur} negative />
              <PnlRow label="Subscriptions" value={summary.subscriptionCost} currency={cur} negative />
              <PnlRow label="Other Expenses" value={summary.otherExpenses} currency={cur} negative />
              <PnlRow label="Total Cost" value={summary.totalCost} currency={cur} negative />
            </div>

            <div className="pt-3">
              <div className="flex items-center justify-between py-2">
                <span className="text-lg font-semibold">Net Profit</span>
                <span className="text-lg font-semibold tabular-nums" style={{ color: summary.netProfit >= 0 ? "var(--positive)" : "var(--negative)" }}>
                  {money(summary.netProfit)}
                </span>
              </div>
              <div className="flex items-center justify-between py-1">
                <span className="text-muted">Profit Margin</span>
                <span className="font-medium tabular-nums" style={{ color: summary.profitMargin >= 0 ? "var(--positive)" : "var(--negative)" }}>
                  {formatPercent(summary.profitMargin)}
                </span>
              </div>
            </div>
          </div>
        </Card>

        <div className="grid grid-cols-2 gap-4 mt-6">
          <Card>
            <div className="text-sm text-muted">Revenue Received</div>
            <div className="text-xl font-semibold mt-1 tabular-nums">{money(summary.received)}</div>
          </Card>
          <Card>
            <div className="text-sm text-muted">Revenue Pending</div>
            <div className="text-xl font-semibold mt-1 tabular-nums" style={{ color: summary.pending > 0 ? "var(--warning)" : undefined }}>{money(summary.pending)}</div>
          </Card>
        </div>
      </div>
    </div>
  );
}
