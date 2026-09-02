"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function InvoiceActions({ id, status, canManage }: { id: string; status: string; canManage: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [voiding, setVoiding] = useState(false);
  const [reason, setReason] = useState("");
  const [reissue, setReissue] = useState(true);

  async function call(url: string, body?: unknown) {
    setError(null);
    const res = await fetch(url, {
      method: body === "DELETE" ? "DELETE" : "POST",
      headers: body && body !== "DELETE" ? { "Content-Type": "application/json" } : {},
      body: body && body !== "DELETE" ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Failed");
    return data;
  }

  async function run(name: string, fn: () => Promise<void>) {
    setBusy(name);
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : "Failed"); } finally { setBusy(null); }
  }

  const btn = "rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-60";
  const primary = { background: "var(--primary)", color: "#fff" };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <a href={`/api/invoices/${id}/pdf`} target="_blank" rel="noreferrer" className={`${btn} border`}>Download PDF</a>

        {canManage && status === "DRAFT" && (
          <>
            <a href={`/invoices/${id}/edit`} className={`${btn} border`}>Edit</a>
            <button onClick={() => run("issue", async () => { const r = await call(`/api/invoices/${id}/issue`); router.refresh(); alert(`Issued as ${r.invoiceNumber}`); })} disabled={!!busy} className={btn} style={primary}>
              {busy === "issue" ? "Issuing…" : "Issue Invoice"}
            </button>
            <button onClick={() => run("del", async () => { if (!confirm("Delete this draft?")) return; await call(`/api/invoices/${id}`, "DELETE"); router.push("/invoices"); })} disabled={!!busy} className={`${btn} border`} style={{ color: "var(--negative)" }}>
              Delete
            </button>
          </>
        )}

        {canManage && (status === "ISSUED") && (
          <button onClick={() => run("send", async () => { await call(`/api/invoices/${id}/send`); router.refresh(); })} disabled={!!busy} className={btn} style={primary}>
            {busy === "send" ? "…" : "Mark as Sent"}
          </button>
        )}

        {canManage && status !== "DRAFT" && status !== "VOID" && (
          <button onClick={() => setVoiding((v) => !v)} className={`${btn} border`} style={{ color: "var(--negative)" }}>Void</button>
        )}
      </div>

      {voiding && (
        <div className="card p-3 space-y-2" style={{ background: "var(--surface-2)" }}>
          <div className="text-sm font-medium">Void this invoice</div>
          <p className="text-xs text-muted">Issued invoices are historical records and are never edited. Voiding preserves the original; optionally create a replacement draft.</p>
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (required)" className="w-full rounded-lg border px-3 py-1.5 bg-surface text-sm" />
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={reissue} onChange={(e) => setReissue(e.target.checked)} /> Create a replacement draft</label>
          <button
            onClick={() => run("void", async () => { const r = await call(`/api/invoices/${id}/void`, { reason, reissue }); if (r.replacementId) router.push(`/invoices/${r.replacementId}/edit`); else router.refresh(); })}
            disabled={!!busy || !reason.trim()}
            className={btn}
            style={{ background: "var(--negative)", color: "#fff" }}
          >
            {busy === "void" ? "Voiding…" : "Confirm Void"}
          </button>
        </div>
      )}

      {error && <div className="text-sm rounded-lg p-2" style={{ background: "rgba(220,38,38,0.1)", color: "var(--negative)" }}>{error}</div>}
    </div>
  );
}
