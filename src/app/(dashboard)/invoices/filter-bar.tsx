"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useCallback, useState, useEffect } from "react";

const STATUSES = ["", "DRAFT", "ISSUED", "SENT", "PARTIALLY_PAID", "PAID", "OVERDUE", "VOID"];

export function InvoiceFilterBar({ clients }: { clients: { id: string; name: string }[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");

  const update = useCallback(
    (patch: Record<string, string | undefined>) => {
      const sp = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (!v) sp.delete(k);
        else sp.set(k, v);
      }
      router.push(`${pathname}?${sp.toString()}`);
    },
    [params, pathname, router],
  );

  useEffect(() => {
    const id = setTimeout(() => {
      if ((params.get("q") ?? "") !== q) update({ q: q || undefined });
    }, 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const cls = "rounded-lg border px-3 py-1.5 bg-surface text-sm";

  return (
    <div className="flex flex-wrap items-center gap-2 mb-4">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search number, client, project…" className={`${cls} w-56`} />
      <select value={params.get("status") ?? ""} onChange={(e) => update({ status: e.target.value || undefined })} className={cls}>
        {STATUSES.map((s) => <option key={s} value={s}>{s ? s.replace("_", " ") : "All statuses"}</option>)}
      </select>
      <select value={params.get("clientId") ?? ""} onChange={(e) => update({ clientId: e.target.value || undefined })} className={cls}>
        <option value="">All clients</option>
        {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
      <input type="date" value={params.get("from") ?? ""} onChange={(e) => update({ from: e.target.value || undefined })} className={cls} aria-label="From date" />
      <input type="date" value={params.get("to") ?? ""} onChange={(e) => update({ to: e.target.value || undefined })} className={cls} aria-label="To date" />
      <div className="flex-1" />
      <select
        value={`${params.get("sort") ?? "invoiceDate"}:${params.get("dir") ?? "desc"}`}
        onChange={(e) => { const [sort, dir] = e.target.value.split(":"); update({ sort, dir }); }}
        className={cls}
      >
        <option value="invoiceDate:desc">Newest first</option>
        <option value="invoiceDate:asc">Oldest first</option>
        <option value="dueDate:asc">Due date ↑</option>
        <option value="dueDate:desc">Due date ↓</option>
        <option value="total:desc">Amount ↓</option>
        <option value="total:asc">Amount ↑</option>
        <option value="status:asc">Status</option>
      </select>
    </div>
  );
}
