"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";

interface EntityPreview {
  entity: string;
  toCreate: number;
  toUpdate: number;
  rejected: { sourceRow: number; errors: string[] }[];
}
interface PreviewResp {
  entities: EntityPreview[];
  totals: { rows: number; toCreate: number; toUpdate: number; rejected: number };
}

export function ImportForm({ tabs }: { tabs: string[] }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [busy, setBusy] = useState<null | "preview" | "commit">(null);
  const [preview, setPreview] = useState<PreviewResp | null>(null);
  const [committed, setCommitted] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(mode: "preview" | "commit") {
    if (!formRef.current) return;
    setBusy(mode); setError(null); setCommitted(null);
    if (mode === "preview") setPreview(null);
    const fd = new FormData(formRef.current);
    fd.set("mode", mode);
    try {
      const res = await fetch("/api/import", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      if (mode === "preview") {
        setPreview(data.preview);
      } else {
        const r = data.result;
        setCommitted(`Imported: ${r.rowsCreated} created, ${r.rowsUpdated} updated, ${r.rowsRejected} rejected (${r.status}).`);
        setPreview(null);
        router.refresh();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(null);
    }
  }

  const btn = "rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-60";

  return (
    <div>
      <form ref={formRef} className="space-y-3">
        {tabs.map((tab) => (
          <div key={tab} className="flex items-center gap-3">
            <label className="w-40 text-sm font-medium">{tab}</label>
            <input type="file" name={tab} accept=".csv,text/csv" className="text-sm" />
          </div>
        ))}
      </form>

      <div className="flex items-center gap-3 mt-5">
        <button onClick={() => submit("preview")} disabled={!!busy} className={`${btn} border`}>
          {busy === "preview" ? "Analyzing…" : "Preview"}
        </button>
        <button
          onClick={() => submit("commit")}
          disabled={!!busy || !preview || preview.totals.toCreate + preview.totals.toUpdate === 0}
          className={btn}
          style={{ background: "var(--primary)", color: "#fff" }}
        >
          {busy === "commit" ? "Importing…" : "Import"}
        </button>
        <span className="text-xs text-muted">Preview to validate, then Import to commit.</span>
      </div>

      {error && <div className="mt-4 text-sm rounded-lg p-3" style={{ background: "rgba(220,38,38,0.1)", color: "var(--negative)" }}>{error}</div>}
      {committed && <div className="mt-4 text-sm rounded-lg p-3" style={{ background: "rgba(22,163,74,0.1)", color: "var(--positive)" }}>{committed}</div>}

      {preview && (
        <div className="mt-6">
          <div className="text-sm mb-2">
            <span className="font-medium">Report:</span> {preview.totals.toCreate} to create, {preview.totals.toUpdate} to update, {preview.totals.rejected} rejected of {preview.totals.rows} rows.
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted border-b">
                  <th className="py-2 font-medium">Entity</th>
                  <th className="py-2 font-medium text-right">Create</th>
                  <th className="py-2 font-medium text-right">Update</th>
                  <th className="py-2 font-medium text-right">Rejected</th>
                </tr>
              </thead>
              <tbody>
                {preview.entities.filter((e) => e.toCreate + e.toUpdate + e.rejected.length > 0).map((e) => (
                  <tr key={e.entity} className="border-b last:border-0">
                    <td className="py-2">{e.entity}</td>
                    <td className="py-2 text-right tabular-nums">{e.toCreate}</td>
                    <td className="py-2 text-right tabular-nums">{e.toUpdate}</td>
                    <td className="py-2 text-right tabular-nums" style={{ color: e.rejected.length ? "var(--negative)" : undefined }}>{e.rejected.length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {preview.entities.some((e) => e.rejected.length > 0) && (
            <div className="mt-4">
              <div className="text-sm font-medium mb-1">Rejected rows</div>
              <ul className="text-xs text-muted space-y-1 max-h-48 overflow-y-auto">
                {preview.entities.flatMap((e) =>
                  e.rejected.map((r, i) => (
                    <li key={`${e.entity}-${i}`}>
                      <span className="font-mono">{e.entity} row {r.sourceRow}</span>: {r.errors.join("; ")}
                    </li>
                  )),
                )}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
