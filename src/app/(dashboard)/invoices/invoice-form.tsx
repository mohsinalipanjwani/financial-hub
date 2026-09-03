"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { computeTotals } from "@/lib/invoice/calc";
import { formatCurrency } from "@/lib/format";

interface Item { description: string; quantity: number; unitPrice: number; revenuePhase?: string | null }
export interface InvoiceFormInitial {
  id?: string;
  clientId: string;
  revenueId?: string | null;
  project?: string | null;
  invoiceDate: string; // yyyy-mm-dd
  dueDate: string;
  currency: string;
  discount: number;
  tax: number;
  notes?: string | null;
  paymentTerms?: string | null;
  billToOverride?: string | null;
  items: Item[];
}

const emptyItem = (): Item => ({ description: "", quantity: 1, unitPrice: 0, revenuePhase: "" });

export function InvoiceForm({ clients, initial }: { clients: { id: string; name: string }[]; initial?: InvoiceFormInitial }) {
  const router = useRouter();
  const today = new Date().toISOString().slice(0, 10);
  const [clientId, setClientId] = useState(initial?.clientId ?? clients[0]?.id ?? "");
  const [project, setProject] = useState(initial?.project ?? "");
  const [currency, setCurrency] = useState(initial?.currency ?? "USD");
  const [invoiceDate, setInvoiceDate] = useState(initial?.invoiceDate ?? today);
  const [dueDate, setDueDate] = useState(initial?.dueDate ?? today);
  const [paymentTerms, setPaymentTerms] = useState(initial?.paymentTerms ?? "Net 30");
  const [discount, setDiscount] = useState(initial?.discount ?? 0);
  const [tax, setTax] = useState(initial?.tax ?? 0);
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [billToOverride, setBillToOverride] = useState(initial?.billToOverride ?? "");
  const [items, setItems] = useState<Item[]>(initial?.items?.length ? initial.items : [emptyItem()]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const totals = useMemo(() => computeTotals(items.map((i) => ({ quantity: Number(i.quantity) || 0, unitPrice: Number(i.unitPrice) || 0 })), Number(discount) || 0, Number(tax) || 0), [items, discount, tax]);

  function setItem(idx: number, patch: Partial<Item>) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }

  async function save(then: "detail" | "issue") {
    setBusy(then); setError(null);
    const payload = {
      clientId,
      revenueId: initial?.revenueId ?? null,
      project: project || null,
      invoiceDate, dueDate, currency,
      discount: Number(discount) || 0,
      tax: Number(tax) || 0,
      notes: notes || null,
      paymentTerms: paymentTerms || null,
      billToOverride: billToOverride.trim() || null,
      items: items
        .filter((i) => i.description.trim())
        .map((i) => ({ description: i.description, quantity: Number(i.quantity) || 0, unitPrice: Number(i.unitPrice) || 0, revenuePhase: i.revenuePhase || null })),
    };
    if (payload.items.length === 0) { setError("Add at least one line item with a description."); setBusy(null); return; }

    try {
      let id = initial?.id;
      if (id) {
        const res = await fetch(`/api/invoices/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed");
      } else {
        const res = await fetch(`/api/invoices`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed");
        id = data.id;
      }
      if (then === "issue" && id) {
        const res = await fetch(`/api/invoices/${id}/issue`, { method: "POST" });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Issue failed");
      }
      router.push(`/invoices/${id}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
      setBusy(null);
    }
  }

  const inp = "rounded-lg border px-3 py-1.5 bg-surface text-sm";
  const money = (n: number) => formatCurrency(n, currency);

  return (
    <div className="grid lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-6">
        <div className="card p-5 space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <label className="block"><span className="text-sm font-medium">Client</span>
              <select value={clientId} onChange={(e) => setClientId(e.target.value)} className={`${inp} w-full mt-1`}>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <label className="block"><span className="text-sm font-medium">Project</span>
              <input value={project} onChange={(e) => setProject(e.target.value)} className={`${inp} w-full mt-1`} placeholder="Optional" />
            </label>
            <label className="block"><span className="text-sm font-medium">Invoice Date</span>
              <input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} className={`${inp} w-full mt-1`} />
            </label>
            <label className="block"><span className="text-sm font-medium">Due Date</span>
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={`${inp} w-full mt-1`} />
            </label>
            <label className="block"><span className="text-sm font-medium">Currency</span>
              <input value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} className={`${inp} w-full mt-1`} />
            </label>
            <label className="block"><span className="text-sm font-medium">Payment Terms</span>
              <input value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} className={`${inp} w-full mt-1`} placeholder="Net 30" />
            </label>
          </div>
          <label className="block">
            <span className="text-sm font-medium">Bill To <span className="font-normal text-muted">(override)</span></span>
            <textarea value={billToOverride} onChange={(e) => setBillToOverride(e.target.value)} rows={3} className={`${inp} w-full mt-1`} placeholder={`Leave blank to bill ${clients.find((c) => c.id === clientId)?.name ?? "the client"} directly.\nAcme Holdings Ltd.\n123 Market St, Suite 400\nAustin, TX 78701`} />
            <span className="mt-1 block text-xs text-muted">Replaces the client&apos;s details in the invoice&apos;s “Bill To” block. First line shows as the billed entity; each line appears exactly as typed. The client stays linked for reporting.</span>
          </label>
        </div>

        <div className="card p-5">
          <div className="text-sm font-medium mb-3">Line Items</div>
          <div className="space-y-2">
            {items.map((it, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                <input value={it.description} onChange={(e) => setItem(idx, { description: e.target.value })} placeholder="Description" className={`${inp} col-span-5`} />
                <input value={it.revenuePhase ?? ""} onChange={(e) => setItem(idx, { revenuePhase: e.target.value })} placeholder="Phase" className={`${inp} col-span-2`} />
                <input type="number" step="0.01" value={it.quantity} onChange={(e) => setItem(idx, { quantity: Number(e.target.value) })} className={`${inp} col-span-1 text-right`} />
                <input type="number" step="0.01" value={it.unitPrice} onChange={(e) => setItem(idx, { unitPrice: Number(e.target.value) })} className={`${inp} col-span-2 text-right`} />
                <div className="col-span-1 text-right tabular-nums text-sm">{money(Math.round((Number(it.quantity) || 0) * (Number(it.unitPrice) || 0) * 100) / 100)}</div>
                <button onClick={() => setItems((p) => p.filter((_, i) => i !== idx))} className="col-span-1 text-muted hover:text-negative text-sm" aria-label="Remove">✕</button>
              </div>
            ))}
          </div>
          <button onClick={() => setItems((p) => [...p, emptyItem()])} className="mt-3 text-sm font-medium" style={{ color: "var(--primary)" }}>+ Add line item</button>
        </div>

        <div className="card p-5">
          <label className="block"><span className="text-sm font-medium">Notes</span>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className={`${inp} w-full mt-1`} placeholder="Visible on the invoice" />
          </label>
        </div>
      </div>

      <div className="space-y-6">
        <div className="card p-5">
          <div className="text-sm font-medium mb-3">Totals</div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted">Subtotal</span><span className="tabular-nums">{money(totals.subtotal)}</span></div>
            <label className="flex justify-between items-center"><span className="text-muted">Discount</span>
              <input type="number" step="0.01" value={discount} onChange={(e) => setDiscount(Number(e.target.value))} className={`${inp} w-28 text-right`} />
            </label>
            <label className="flex justify-between items-center"><span className="text-muted">Tax</span>
              <input type="number" step="0.01" value={tax} onChange={(e) => setTax(Number(e.target.value))} className={`${inp} w-28 text-right`} />
            </label>
            <div className="flex justify-between border-t pt-2 mt-2 font-semibold"><span>Total</span><span className="tabular-nums">{money(totals.total)}</span></div>
          </div>
        </div>

        {error && <div className="text-sm rounded-lg p-3" style={{ background: "rgba(220,38,38,0.1)", color: "var(--negative)" }}>{error}</div>}

        <div className="flex flex-col gap-2">
          <button onClick={() => save("detail")} disabled={!!busy} className="rounded-lg px-4 py-2 text-sm font-medium border disabled:opacity-60">
            {busy === "detail" ? "Saving…" : "Save Draft"}
          </button>
          <button onClick={() => save("issue")} disabled={!!busy} className="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-60" style={{ background: "var(--primary)" }}>
            {busy === "issue" ? "Issuing…" : "Save & Issue"}
          </button>
        </div>
      </div>
    </div>
  );
}
