"use client";

import { useSearchParams } from "next/navigation";

/** Links to the CSV export endpoint, carrying the current period/filters. */
export function ExportButton({ type }: { type: "revenue" | "payments" | "clients" | "pnl" }) {
  const params = useSearchParams();
  const sp = new URLSearchParams(params.toString());
  sp.set("type", type);
  const href = `/api/export?${sp.toString()}`;

  return (
    <a
      href={href}
      className="inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium bg-surface hover:bg-surface-2"
    >
      <span aria-hidden>↓</span> Export CSV
    </a>
  );
}
