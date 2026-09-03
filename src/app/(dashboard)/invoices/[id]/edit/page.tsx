import Link from "next/link";
import { notFound } from "next/navigation";
import { getSession, canManageInvoices } from "@/lib/auth";
import { getInvoice } from "@/lib/invoice/service";
import { getFilterOptions } from "@/lib/layout-data";
import { PageHeader } from "@/components/ui";
import { NoAccess } from "@/components/no-access";
import { InvoiceForm, type InvoiceFormInitial } from "../../invoice-form";

export const dynamic = "force-dynamic";
const iso = (d: Date) => d.toISOString().slice(0, 10);

export default async function EditInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getSession();
  if (!user || !canManageInvoices(user.role)) return <NoAccess />;

  const { id } = await params;
  const inv = await getInvoice(id);
  if (!inv) notFound();
  if (inv.status !== "DRAFT") {
    return (
      <div>
        <div className="mb-4"><Link href={`/invoices/${id}`} className="text-sm text-muted hover:text-foreground">← Back</Link></div>
        <div className="card p-5 text-sm">
          This invoice has been issued and is a historical record — it can&apos;t be edited. Void it and create a replacement if a correction is needed.
        </div>
      </div>
    );
  }

  const { clients } = await getFilterOptions();
  const initial: InvoiceFormInitial = {
    id: inv.id,
    clientId: inv.clientId,
    revenueId: inv.revenueId,
    project: inv.project,
    invoiceDate: iso(inv.invoiceDate),
    dueDate: iso(inv.dueDate),
    currency: inv.currency,
    discount: Number(inv.discount),
    tax: Number(inv.tax),
    notes: inv.notes,
    paymentTerms: inv.paymentTerms,
    billToOverride: inv.billToOverride,
    items: inv.items.map((it) => ({ description: it.description, quantity: Number(it.quantity), unitPrice: Number(it.unitPrice), revenuePhase: it.revenuePhase })),
  };

  return (
    <div>
      <div className="mb-4"><Link href={`/invoices/${id}`} className="text-sm text-muted hover:text-foreground">← Back to invoice</Link></div>
      <PageHeader title="Edit Draft Invoice" description={inv.client.name} />
      <InvoiceForm clients={clients} initial={initial} />
    </div>
  );
}
