"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface U {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
}

const ROLES = ["ADMIN", "FINANCE", "MANAGEMENT", "EMPLOYEE"];

export function UsersManager({ users, canEdit, selfId }: { users: U[]; canEdit: boolean; selfId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function update(userId: string, patch: { role?: string; active?: boolean }) {
    setBusy(userId); setError(null);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, ...patch }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      {error && <div className="mb-3 text-sm rounded-lg p-2" style={{ background: "rgba(220,38,38,0.1)", color: "var(--negative)" }}>{error}</div>}
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-muted border-b">
            <th className="py-2 font-medium">Name</th>
            <th className="py-2 font-medium">Email</th>
            <th className="py-2 font-medium">Role</th>
            <th className="py-2 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} className="border-b last:border-0">
              <td className="py-2 font-medium">{u.name}{u.id === selfId && <span className="text-xs text-muted"> (you)</span>}</td>
              <td className="py-2 text-muted">{u.email}</td>
              <td className="py-2">
                {canEdit ? (
                  <select
                    value={u.role}
                    disabled={busy === u.id}
                    onChange={(e) => update(u.id, { role: e.target.value })}
                    className="rounded-lg border px-2 py-1 bg-surface text-sm"
                  >
                    {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                ) : (
                  <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium" style={{ background: "rgba(100,116,139,0.12)", color: "#475569" }}>{u.role}</span>
                )}
              </td>
              <td className="py-2">
                {canEdit ? (
                  <button
                    onClick={() => update(u.id, { active: !u.active })}
                    disabled={busy === u.id}
                    className="text-xs rounded-full px-2.5 py-1 font-medium"
                    style={{ background: u.active ? "rgba(22,163,74,0.12)" : "rgba(100,116,139,0.12)", color: u.active ? "#15803d" : "#475569" }}
                  >
                    {u.active ? "Active" : "Inactive"}
                  </button>
                ) : (
                  <span className="text-xs">{u.active ? "Active" : "Inactive"}</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
