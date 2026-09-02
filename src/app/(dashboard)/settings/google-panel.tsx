"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  googleEnabled: boolean;
  connected: boolean;
  email?: string;
  spreadsheetId?: string | null;
}

export function GooglePanel({ googleEnabled, connected, email, spreadsheetId }: Props) {
  const router = useRouter();
  const [sheetId, setSheetId] = useState(spreadsheetId ?? "");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  async function post(url: string, body?: unknown) {
    const res = await fetch(url, {
      method: "POST",
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Request failed");
    return data;
  }

  async function saveSheet() {
    setBusy("save"); setMessage(null);
    try {
      await post("/api/google", { action: "setSpreadsheet", spreadsheetId: sheetId.trim() });
      setMessage({ tone: "ok", text: "Spreadsheet saved." });
      router.refresh();
    } catch (e) {
      setMessage({ tone: "err", text: e instanceof Error ? e.message : "Failed" });
    } finally { setBusy(null); }
  }

  async function syncNow() {
    setBusy("sync"); setMessage(null);
    try {
      const r = await post("/api/sync");
      setMessage({ tone: r.status === "SUCCESS" ? "ok" : "err", text: `Sync ${r.status}: ${r.rowsRead} read, ${r.rowsCreated} created, ${r.rowsUpdated} updated, ${r.rowsRejected} rejected.` });
      router.refresh();
    } catch (e) {
      setMessage({ tone: "err", text: e instanceof Error ? e.message : "Sync failed" });
    } finally { setBusy(null); }
  }

  async function disconnect() {
    setBusy("disc"); setMessage(null);
    try {
      await post("/api/google", { action: "disconnect" });
      setMessage({ tone: "ok", text: "Disconnected." });
      router.refresh();
    } catch (e) {
      setMessage({ tone: "err", text: e instanceof Error ? e.message : "Failed" });
    } finally { setBusy(null); }
  }

  const btn = "rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-60";

  if (!googleEnabled) {
    return (
      <p className="text-sm text-muted">
        Google integration is not configured on the server. Set <code>GOOGLE_CLIENT_ID</code>,{" "}
        <code>GOOGLE_CLIENT_SECRET</code>, and <code>TOKEN_ENCRYPTION_KEY</code>, then restart to enable
        Google sign-in and Sheets sync.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-medium">Connection</div>
          <div className="text-sm text-muted">
            {connected ? `Connected as ${email}` : "Not connected"}
          </div>
        </div>
        {connected ? (
          <button onClick={disconnect} disabled={!!busy} className={`${btn} border`}>
            {busy === "disc" ? "…" : "Disconnect"}
          </button>
        ) : (
          <a href="/api/auth/google/start" className={btn} style={{ background: "var(--primary)", color: "#fff" }}>
            Connect Google Account
          </a>
        )}
      </div>

      {connected && (
        <>
          <div>
            <label className="text-sm font-medium">Master Spreadsheet ID</label>
            <div className="flex gap-2 mt-1">
              <input
                value={sheetId}
                onChange={(e) => setSheetId(e.target.value)}
                placeholder="1AbC…the long ID from the sheet URL"
                className="flex-1 rounded-lg border px-3 py-1.5 bg-surface text-sm"
              />
              <button onClick={saveSheet} disabled={!!busy} className={`${btn} border`}>
                {busy === "save" ? "…" : "Save"}
              </button>
            </div>
          </div>

          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={syncNow}
              disabled={!!busy || !sheetId.trim()}
              className={btn}
              style={{ background: "var(--primary)", color: "#fff" }}
            >
              {busy === "sync" ? "Syncing…" : "Sync now"}
            </button>
            <span className="text-xs text-muted">Reads the sheet and updates the database (idempotent).</span>
          </div>
        </>
      )}

      {message && (
        <div
          className="text-sm rounded-lg p-3"
          style={{
            background: message.tone === "ok" ? "rgba(22,163,74,0.1)" : "rgba(220,38,38,0.1)",
            color: message.tone === "ok" ? "var(--positive)" : "var(--negative)",
          }}
        >
          {message.text}
        </div>
      )}
    </div>
  );
}
