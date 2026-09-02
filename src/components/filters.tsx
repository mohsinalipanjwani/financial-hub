"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useCallback } from "react";

interface ClientOpt {
  id: string;
  name: string;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function Filters({
  clients,
  sources,
  showClient = true,
}: {
  clients: ClientOpt[];
  sources: string[];
  showClient?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const type = params.get("type") || "month";
  const now = new Date();
  const year = params.get("year") || String(now.getUTCFullYear());
  const month = params.get("month") ?? String(now.getUTCMonth());
  const quarter = params.get("quarter") || String(Math.floor(now.getUTCMonth() / 3) + 1);

  const update = useCallback(
    (patch: Record<string, string | undefined>) => {
      const sp = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined || v === "") sp.delete(k);
        else sp.set(k, v);
      }
      router.push(`${pathname}?${sp.toString()}`);
    },
    [params, pathname, router],
  );

  const selectCls = "rounded-lg border px-3 py-1.5 bg-surface text-sm";

  return (
    <div className="flex flex-wrap items-center gap-2 mb-6">
      <select value={type} onChange={(e) => update({ type: e.target.value })} className={selectCls}>
        <option value="month">Monthly</option>
        <option value="quarter">Quarterly</option>
        <option value="year">Yearly</option>
      </select>

      {type === "month" && (
        <select value={month} onChange={(e) => update({ month: e.target.value })} className={selectCls}>
          {MONTHS.map((m, i) => (
            <option key={i} value={i}>{m}</option>
          ))}
        </select>
      )}

      {type === "quarter" && (
        <select value={quarter} onChange={(e) => update({ quarter: e.target.value })} className={selectCls}>
          {[1, 2, 3, 4].map((q) => (
            <option key={q} value={q}>Q{q}</option>
          ))}
        </select>
      )}

      <select value={year} onChange={(e) => update({ year: e.target.value })} className={selectCls}>
        {[now.getUTCFullYear(), now.getUTCFullYear() - 1, now.getUTCFullYear() - 2].map((y) => (
          <option key={y} value={y}>{y}</option>
        ))}
      </select>

      <div className="flex-1" />

      {showClient && clients.length > 0 && (
        <select
          value={params.get("clientId") || ""}
          onChange={(e) => update({ clientId: e.target.value || undefined })}
          className={selectCls}
        >
          <option value="">All clients</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      )}

      {sources.length > 0 && (
        <select
          value={params.get("source") || ""}
          onChange={(e) => update({ source: e.target.value || undefined })}
          className={selectCls}
        >
          <option value="">All sources</option>
          {sources.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      )}
    </div>
  );
}
