import Link from "next/link";
import { requireFinancialAccess } from "@/lib/auth";
import { resolvePeriod } from "@/lib/finance/period";
import { getClientPerformance } from "@/lib/finance/service";
import { getFilterOptions } from "@/lib/layout-data";
import { Filters } from "@/components/filters";
import { SearchBox } from "@/components/search-box";
import { PageHeader, Card, EmptyState, Badge } from "@/components/ui";
import { formatCurrency, formatPercent } from "@/lib/format";
import { NoAccess } from "@/components/no-access";

export const dynamic = "force-dynamic";

export default async function ClientsPage({
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
  const filters = { source: sp.source };
  const { sources } = await getFilterOptions();
  const allRows = await getClientPerformance(period, filters);
  const q = sp.q?.trim().toLowerCase();
  const rows = q ? allRows.filter((r) => r.clientName.toLowerCase().includes(q)) : allRows;
  const money = (n: number) => formatCurrency(n);

  return (
    <div>
      <PageHeader
        title="Clients"
        description={`Client performance — ${period.label}`}
        actions={<SearchBox placeholder="Search clients…" />}
      />
      <Filters clients={[]} sources={sources} showClient={false} />

      <Card>
        {rows.length === 0 ? (
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
                  <th className="py-2 font-medium text-right"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.clientId} className="border-b last:border-0 hover:bg-surface-2">
                    <td className="py-2.5 font-medium">{c.clientName}</td>
                    <td className="py-2.5 text-right tabular-nums">{money(c.revenue)}</td>
                    <td className="py-2.5 text-right tabular-nums" style={{ color: "var(--positive)" }}>{money(c.received)}</td>
                    <td className="py-2.5 text-right tabular-nums" style={{ color: c.pending > 0 ? "var(--warning)" : "var(--muted)" }}>{money(c.pending)}</td>
                    <td className="py-2.5 text-right"><Badge>{formatPercent(c.contribution)}</Badge></td>
                    <td className="py-2.5 text-right">
                      <Link href={`/clients/${c.clientId}`} className="text-xs font-medium hover:underline" style={{ color: "var(--primary)" }}>
                        View →
                      </Link>
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
