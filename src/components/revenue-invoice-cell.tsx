"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { InvoiceStatusBadge } from "@/components/invoice-status";
import type { DisplayStatus } from "@/lib/invoice/calc";

export function RevenueInvoiceCell({
  revenueId,
  invoice,
  canManage,
}: {
  revenueId: string;
  invoice: { id: string; invoiceNumber: string | null; displayStatus: DisplayStatus } | null;
  canManage: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  if (invoice) {
    return (
      <div className="flex items-center gap-2">
        <Link href={`/invoices/${invoice.id}`} className="font-mono text-xs hover:underline" style={{ color: "var(--primary)" }}>
          {invoice.invoiceNumber || "DRAFT"}
        </Link>
        <InvoiceStatusBadge status={invoice.displayStatus} />
      </div>
    );
  }

  if (!canManage) return <span className="text-xs text-muted">—</span>;

  async function generate() {
    setBusy(true);
    try {
      const res = await fetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromRevenueId: revenueId }),
      });
      const data = await res.json();
      if (res.ok && data.id) router.push(`/invoices/${data.id}/edit`);
      else { alert(data.error || "Failed"); setBusy(false); }
    } catch {
      setBusy(false);
    }
  }

  return (
    <button onClick={generate} disabled={busy} className="text-xs font-medium rounded-lg border px-2 py-1 hover:bg-surface-2 disabled:opacity-60">
      {busy ? "…" : "Generate Invoice"}
    </button>
  );
}
