"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function SyncButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  async function syncNow() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/sync", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Sync failed");
      setMessage({
        tone: data.status === "SUCCESS" ? "ok" : "err",
        text: `Sync ${data.status}: ${data.rowsRead} read, ${data.rowsCreated} created, ${data.rowsUpdated} updated, ${data.rowsRejected} rejected.`,
      });
      router.refresh();
    } catch (e) {
      setMessage({ tone: "err", text: e instanceof Error ? e.message : "Sync failed" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative">
      <button
        onClick={syncNow}
        disabled={busy}
        className="flex items-center gap-2 text-sm rounded-lg px-3 py-1.5 font-medium disabled:opacity-60"
        style={{ background: "var(--primary)", color: "#fff" }}
      >
        <span className={busy ? "inline-block animate-spin" : ""}>⟳</span>
        {busy ? "Syncing…" : "Sync"}
      </button>

      {message && (
        <div
          className="absolute right-0 top-full mt-2 w-72 text-xs rounded-lg p-3 shadow-lg border z-10"
          style={{
            background: "var(--surface)",
            color: message.tone === "ok" ? "var(--positive)" : "var(--negative)",
          }}
          role="status"
        >
          <div className="flex items-start justify-between gap-2">
            <span>{message.text}</span>
            <button onClick={() => setMessage(null)} className="text-muted shrink-0" aria-label="Dismiss">
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
