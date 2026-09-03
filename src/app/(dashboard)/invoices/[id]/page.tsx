import Link from "next/link";
import { notFound } from "next/navigation";
import { getSession, canViewInvoices, canManageInvoices } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getInvoice } from "@/lib/invoice/service";
import { displayStatus, type InvoiceStatus } from "@/lib/invoice/calc";
import { PageHeader, Card, SectionTitle, EmptyState } from "@/components/ui";
import { NoAccess } from "@/components/no-access";
import { InvoiceStatusBadge } from "@/components/invoice-status";
import { formatCurrency, formatDate } from "@/lib/format";
import { InvoiceActions } from "./actions";

export const dynamic = "force-dynamic";

export default async function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getSession();
  if (!user || !canViewInvoices(user.role)) return <NoAccess />;

  const { id } = await params;
  const inv = await getInvoice(id);
  if (!inv) notFound();

  const canManage = canManageInvoices(user.role);
  const ds = displayStatus(inv.status as InvoiceStatus, inv.dueDate, Number(inv.amountDue));
  const money = (n: number) => formatCurrency(n, inv.currency);

  const logs = await prisma.auditLog.findMany({
    where: { entityType: "invoice", entityId: id },
    orderBy: { createdAt: "desc" },
    include: { user: true },
    take: 30,
  });

  return (
    <div>
      <div className="mb-4"><Link href="/invoices" className="text-sm text-muted hover:text-foreground">← Back to invoices</Link></div>
      <PageHeader
        title={inv.invoiceNumber || "Draft Invoice"}
        description={`${inv.client.name}${inv.revenue ? ` · from ${inv.revenue.revenueKey}` : ""}`}
        actions={<InvoiceStatusBadge status={ds} />}
      />

      {inv.replaces && (
        <div className="card p-3 mb-4 text-sm" style={{ background: "rgba(217,119,6,0.08)", color: "var(--warning)" }}>
          This invoice replaces voided <Link href={`/invoices/${inv.replaces.id}`} className="underline">{inv.replaces.invoiceNumber || "draft"}</Link>.
        </div>
      )}
      {inv.status === "VOID" && (
        <div className="card p-3 mb-4 text-sm" style={{ background: "rgba(220,38,38,0.08)", color: "var(--negative)" }}>
          Voided{inv.voidReason ? `: ${inv.voidReason}` : ""}.
          {inv.replacedBy.length > 0 && (
            <> Replaced by <Link href={`/invoices/${inv.replacedBy[0].id}`} className="underline">{inv.replacedBy[0].invoiceNumber || "draft"}</Link>.</>
          )}
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Preview — same HTML as the PDF */}
        <div className="lg:col-span-2">
          <Card className="!p-0 overflow-hidden">
            <iframe
              src={`/api/invoices/${id}/preview`}
              title="Invoice preview"
              className="w-full"
              style={{ height: "900px", border: "none", background: "#fff" }}
            />
          </Card>
        </div>

        {/* Sidebar: actions, totals, payments, audit */}
        <div className="space-y-6">
          <Card>
            <SectionTitle>Actions</SectionTitle>
            <InvoiceActions id={id} status={inv.status} canManage={canManage} />
          </Card>

          <Card>
            <SectionTitle>Summary</SectionTitle>
            <dl className="text-sm space-y-1.5">
              <Row label="Invoice Date" value={formatDate(inv.invoiceDate)} />
              <Row label="Due Date" value={formatDate(inv.dueDate)} />
              <Row label="Total" value={money(Number(inv.total))} strong />
              <Row label="Paid" value={money(Number(inv.amountPaid))} />
              <Row label="Amount Due" value={money(Number(inv.amountDue))} strong />
            </dl>
          </Card>

          <Card>
            <SectionTitle>Payments</SectionTitle>
            {inv.payments.length === 0 ? (
              <EmptyState message="No payments recorded yet." />
            ) : (
              <table className="w-full text-sm">
                <tbody>
                  {inv.payments.map((p) => (
                    <tr key={p.id} className="border-b last:border-0">
                      <td className="py-2">{formatDate(p.date)}</td>
                      <td className="py-2 text-muted">{p.method ?? "—"}</td>
                      <td className="py-2 text-right tabular-nums" style={{ color: "var(--positive)" }}>{formatCurrency(Number(p.amount), p.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {inv.revenue && (
              <p className="text-xs text-muted mt-3">
                Payments recorded against <Link href={`/clients/${inv.clientId}`} className="underline">{inv.revenue.revenueKey}</Link> in the sheet are applied automatically.
              </p>
            )}
          </Card>

          <Card>
            <SectionTitle>Audit Trail</SectionTitle>
            {logs.length === 0 ? (
              <EmptyState message="No events yet." />
            ) : (
              <ul className="text-xs space-y-2">
                {logs.map((l) => (
                  <li key={l.id} className="flex justify-between gap-2">
                    <span className="font-medium">{l.action.replace("INVOICE_", "").toLowerCase()}</span>
                    <span className="text-muted text-right">{l.user?.name ?? "system"} · {formatDate(l.createdAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between">
      <dt className="text-muted">{label}</dt>
      <dd className={strong ? "font-semibold tabular-nums" : "tabular-nums"}>{value}</dd>
    </div>
  );
}
