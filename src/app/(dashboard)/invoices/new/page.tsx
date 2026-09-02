import Link from "next/link";
import { getSession, canManageInvoices } from "@/lib/auth";
import { getFilterOptions } from "@/lib/layout-data";
import { PageHeader } from "@/components/ui";
import { NoAccess } from "@/components/no-access";
import { InvoiceForm } from "../invoice-form";

export const dynamic = "force-dynamic";

export default async function NewInvoicePage() {
  const user = await getSession();
  if (!user || !canManageInvoices(user.role)) return <NoAccess />;
  const { clients } = await getFilterOptions();

  return (
    <div>
      <div className="mb-4"><Link href="/invoices" className="text-sm text-muted hover:text-foreground">← Back to invoices</Link></div>
      <PageHeader title="New Invoice" description="Create a standalone invoice (retainer, one-off, adjustment, or custom)." />
      {clients.length === 0 ? (
        <p className="text-sm text-muted">Add a client first.</p>
      ) : (
        <InvoiceForm clients={clients} />
      )}
    </div>
  );
}
