"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

interface UserOption {
  email: string;
  name: string;
  role: string;
}

export function LoginForm({ users }: { users: UserOption[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState(users[0]?.email ?? "");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    if (res.ok) {
      const next = params.get("next") || "/";
      router.push(next);
      router.refresh();
    } else {
      const body = await res.json().catch(() => ({}));
      setError(body.error || "Sign-in failed");
      setLoading(false);
    }
  }

  if (users.length === 0) {
    return (
      <p className="text-sm text-negative">
        No users found. Run <code>npm run db:seed</code> to create demo accounts.
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <label className="block">
        <span className="text-sm font-medium">Sign in as</span>
        <select
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1 w-full rounded-lg border px-3 py-2 bg-white text-sm"
        >
          {users.map((u) => (
            <option key={u.email} value={u.email}>
              {u.name} — {u.role}
            </option>
          ))}
        </select>
      </label>

      {error && <p className="text-sm text-negative">{error}</p>}

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        style={{ background: "var(--primary)" }}
      >
        {loading ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
