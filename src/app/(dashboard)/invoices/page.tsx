import Link from "next/link";
import { getSession, canViewInvoices, canManageInvoices } from "@/lib/auth";
import { listInvoices, getInvoiceKpis, type InvoiceFilters } from "@/lib/invoice/service";
import { getFilterOptions } from "@/lib/layout-data";
import { PageHeader, Card, StatTile, SectionTitle, EmptyState } from "@/components/ui";
import { NoAccess } from "@/components/no-access";
import { InvoiceStatusBadge } from "@/components/invoice-status";
import { HorizontalBarChart, TrendChart } from "@/components/charts";
import { formatCurrency, formatDate } from "@/lib/format";
import { InvoiceFilterBar } from "./filter-bar";

export const dynamic = "force-dynamic";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const user = await getSession();
  if (!user || !canViewInvoices(user.role)) return <NoAccess />;

  const sp = await searchParams;
  const filters: InvoiceFilters = {
    clientId: sp.clientId, status: sp.status, currency: sp.currency, q: sp.q,
    from: sp.from, to: sp.to,
    sort: (sp.sort as InvoiceFilters["sort"]) || "invoiceDate",
    dir: (sp.dir as "asc" | "desc") || "desc",
  };

  const [kpis, invoices, { clients }] = await Promise.all([
    getInvoiceKpis(),
    listInvoices(filters),
    getFilterOptions(),
  ]);
  const cur = kpis.reportingCurrency;
  const money = (n: number) => formatCurrency(n, cur);
  const canManage = canManageInvoices(user.role);

  // Monthly invoiced trend (issued invoices) for the current year.
  const year = new Date().getUTCFullYear();
  const trendMap = new Map<number, number>();
  const outstandingByClient = new Map<string, number>();
  for (const inv of invoices) {
    if (inv.status !== "DRAFT" && inv.status !== "VOID" && inv.invoiceDate.getUTCFullYear() === year) {
      trendMap.set(inv.invoiceDate.getUTCMonth(), (trendMap.get(inv.invoiceDate.getUTCMonth()) ?? 0) + inv.total);
    }
    if (inv.amountDue > 0 && inv.status !== "DRAFT" && inv.status !== "VOID") {
      outstandingByClient.set(inv.clientName, (outstandingByClient.get(inv.clientName) ?? 0) + inv.amountDue);
    }
  }
  const trend = Array.from({ length: 12 }, (_, m) => ({ month: MONTHS[m], value: Math.round((trendMap.get(m) ?? 0) * 100) / 100 }));
  const byClient = [...outstandingByClient.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 8);
  const overdue = invoices.filter((i) => i.displayStatus === "OVERDUE");

  return (
    <div>
      <PageHeader
        title="Invoices"
        description="Issue, track, and collect on invoices."
        actions={canManage ? <Link href="/invoices/new" className="rounded-lg px-3 py-1.5 text-sm font-medium text-white" style={{ background: "var(--primary)" }}>+ New Invoice</Link> : undefined}
      />

      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4 mb-6">
        <StatTile label="Total Invoiced" value={money(kpis.totalInvoiced)} />
        <StatTile label="Paid" value={money(kpis.paid)} />
        <StatTile label="Outstanding" value={money(kpis.outstanding)} />
        <StatTile label="Overdue" value={money(kpis.overdue)} sub={`${kpis.counts.overdue} invoices`} />
        <StatTile label="Due This Week" value={money(kpis.dueThisWeek)} />
        <StatTile label="Draft" value={money(kpis.draft)} sub={`${kpis.counts.draft} drafts`} />
      </div>

      <div className="grid lg:grid-cols-2 gap-6 mb-6">
        <Card>
          <SectionTitle>Invoiced Trend — {year}</SectionTitle>
          <TrendChart data={trend} dataKey="value" name="Invoiced" />
        </Card>
        <Card>
          <SectionTitle>Outstanding by Client</SectionTitle>
          {byClient.length > 0 ? <HorizontalBarChart data={byClient} color="#d97706" /> : <EmptyState message="Nothing outstanding." />}
        </Card>
      </div>

      {overdue.length > 0 && (
        <Card className="mb-6">
          <SectionTitle>Overdue Invoices</SectionTitle>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-muted border-b">
                <th className="py-2 font-medium">Invoice</th><th className="py-2 font-medium">Client</th>
                <th className="py-2 font-medium">Due</th><th className="py-2 font-medium text-right">Amount Due</th>
              </tr></thead>
              <tbody>
                {overdue.map((i) => (
                  <tr key={i.id} className="border-b last:border-0 hover:bg-surface-2">
                    <td className="py-2"><Link href={`/invoices/${i.id}`} className="font-mono text-xs hover:underline" style={{ color: "var(--primary)" }}>{i.invoiceNumber}</Link></td>
                    <td className="py-2">{i.clientName}</td>
                    <td className="py-2 text-muted">{formatDate(i.dueDate)}</td>
                    <td className="py-2 text-right tabular-nums" style={{ color: "var(--negative)" }}>{formatCurrency(i.amountDue, i.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Card>
        <SectionTitle>All Invoices</SectionTitle>
        <InvoiceFilterBar clients={clients} />
        {invoices.length === 0 ? (
          <EmptyState message="No invoices match these filters." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-muted border-b">
                <th className="py-2 font-medium">Invoice</th>
                <th className="py-2 font-medium">Client</th>
                <th className="py-2 font-medium">Date</th>
                <th className="py-2 font-medium">Due</th>
                <th className="py-2 font-medium text-right">Total</th>
                <th className="py-2 font-medium text-right">Due</th>
                <th className="py-2 pl-6 font-medium">Status</th>
              </tr></thead>
              <tbody>
                {invoices.map((i) => (
                  <tr key={i.id} className="border-b last:border-0 hover:bg-surface-2">
                    <td className="py-2.5">
                      <Link href={`/invoices/${i.id}`} className="font-mono text-xs hover:underline" style={{ color: "var(--primary)" }}>
                        {i.invoiceNumber || "DRAFT"}
                      </Link>
                    </td>
                    <td className="py-2.5">{i.clientName}</td>
                    <td className="py-2.5 text-muted">{formatDate(i.invoiceDate)}</td>
                    <td className="py-2.5 text-muted">{formatDate(i.dueDate)}</td>
                    <td className="py-2.5 text-right tabular-nums">{formatCurrency(i.total, i.currency)}</td>
                    <td className="py-2.5 text-right tabular-nums" style={{ color: i.amountDue > 0 ? "var(--warning)" : "var(--muted)" }}>{formatCurrency(i.amountDue, i.currency)}</td>
                    <td className="py-2.5 pl-6"><InvoiceStatusBadge status={i.displayStatus} /></td>
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
