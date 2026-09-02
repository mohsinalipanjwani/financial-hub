"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Profile = Record<string, string | number | null>;

const GENERAL: { key: string; label: string; wide?: boolean }[] = [
  { key: "displayName", label: "Display Name" },
  { key: "legalName", label: "Legal Name" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "address", label: "Address", wide: true },
  { key: "city", label: "City" },
  { key: "state", label: "State" },
  { key: "postalCode", label: "Postal Code" },
  { key: "country", label: "Country" },
  { key: "taxId", label: "Tax ID" },
  { key: "registrationNumber", label: "Registration #" },
  { key: "logoUrl", label: "Logo URL or data: URI", wide: true },
];

const BANK: { key: string; label: string }[] = [
  { key: "bankName", label: "Bank Name" },
  { key: "bankAccountName", label: "Account Name" },
  { key: "accountNumber", label: "Account Number" },
  { key: "iban", label: "IBAN" },
  { key: "swift", label: "SWIFT" },
];

export function CompanyProfileForm({
  profile,
  canEditBank,
  hasIssuedInvoices,
}: {
  profile: Profile;
  canEditBank: boolean;
  hasIssuedInvoices: boolean;
}) {
  const router = useRouter();
  const [form, setForm] = useState<Profile>(profile);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const val = (k: string) => (form[k] == null ? "" : String(form[k]));
  const inp = "rounded-lg border px-3 py-1.5 bg-surface text-sm w-full mt-1";

  async function save() {
    setBusy(true); setMsg(null);
    try {
      const res = await fetch("/api/company", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setMsg({ ok: true, text: "Saved." });
      router.refresh();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Failed" });
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-5">
      <div className="grid sm:grid-cols-2 gap-3">
        {GENERAL.map((f) => (
          <label key={f.key} className={f.wide ? "sm:col-span-2" : ""}>
            <span className="text-sm font-medium">{f.label}</span>
            <input value={val(f.key)} onChange={(e) => set(f.key, e.target.value)} className={inp} />
          </label>
        ))}
      </div>

      <div>
        <div className="text-sm font-semibold mb-1">Invoice Numbering</div>
        <div className="grid sm:grid-cols-3 gap-3">
          <label><span className="text-sm font-medium">Prefix</span>
            <input value={val("invoicePrefix")} onChange={(e) => set("invoicePrefix", e.target.value)} className={inp} placeholder="INV" />
          </label>
          <label><span className="text-sm font-medium">Next Number</span>
            <input type="number" value={val("invoiceNextNumber")} onChange={(e) => set("invoiceNextNumber", e.target.value)} className={inp} disabled={hasIssuedInvoices} />
          </label>
          <label><span className="text-sm font-medium">Default Terms</span>
            <input value={val("defaultPaymentTerms")} onChange={(e) => set("defaultPaymentTerms", e.target.value)} className={inp} placeholder="Net 30" />
          </label>
        </div>
        {hasIssuedInvoices && <p className="text-xs text-muted mt-1">The starting number is locked because invoices have already been issued (numbers are never reused).</p>}
      </div>

      <label className="block"><span className="text-sm font-medium">Invoice Footer</span>
        <textarea value={val("invoiceFooter")} onChange={(e) => set("invoiceFooter", e.target.value)} rows={2} className={inp} placeholder="Thank you for your business." />
      </label>

      <div>
        <div className="text-sm font-semibold mb-1">Bank / Payment Details</div>
        {canEditBank ? (
          <div className="grid sm:grid-cols-2 gap-3">
            {BANK.map((f) => (
              <label key={f.key}>
                <span className="text-sm font-medium">{f.label}</span>
                <input value={val(f.key)} onChange={(e) => set(f.key, e.target.value)} className={inp} />
              </label>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted">Bank details are restricted to Finance and Admin.</p>
        )}
      </div>

      {msg && <div className="text-sm rounded-lg p-2" style={{ background: msg.ok ? "rgba(22,163,74,0.1)" : "rgba(220,38,38,0.1)", color: msg.ok ? "var(--positive)" : "var(--negative)" }}>{msg.text}</div>}

      <button onClick={save} disabled={busy} className="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-60" style={{ background: "var(--primary)" }}>
        {busy ? "Saving…" : "Save Company Profile"}
      </button>
    </div>
  );
}
