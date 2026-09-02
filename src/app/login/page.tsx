import { prisma } from "@/lib/prisma";
import { isGoogleConfigured } from "@/lib/google/oauth";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const googleEnabled = isGoogleConfigured();
  // Dev login offers the seeded accounts; Google OAuth is used in production.
  const users = await prisma.user
    .findMany({ where: { active: true }, orderBy: { role: "asc" } })
    .catch(() => []);

  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: "var(--sidebar)" }}>
      <div className="card w-full max-w-md p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="h-10 w-10 rounded-lg flex items-center justify-center text-white font-bold" style={{ background: "var(--primary)" }}>
            FH
          </div>
          <div>
            <h1 className="text-lg font-semibold">Financial Hub</h1>
            <p className="text-sm text-muted">Internal financial dashboard</p>
          </div>
        </div>

        {sp.error && (
          <div className="mb-4 text-sm rounded-lg p-3" style={{ background: "rgba(220,38,38,0.1)", color: "var(--negative)" }}>
            {sp.error}
          </div>
        )}

        {googleEnabled && (
          <>
            <a
              href="/api/auth/google/start"
              className="w-full flex items-center justify-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium bg-white hover:bg-surface-2"
            >
              <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden>
                <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.6 2.4 30.1 0 24 0 14.6 0 6.4 5.4 2.6 13.2l7.9 6.1C12.3 13.2 17.7 9.5 24 9.5z" />
                <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.1 5.3-4.6 6.9l7.1 5.5c4.1-3.8 6.5-9.4 6.5-16.9z" />
                <path fill="#FBBC05" d="M10.5 28.3c-.5-1.4-.7-2.9-.7-4.3s.3-3 .7-4.3l-7.9-6.1C1 16.9 0 20.3 0 24s1 7.1 2.6 10.4l7.9-6.1z" />
                <path fill="#34A853" d="M24 48c6.1 0 11.3-2 15-5.5l-7.1-5.5c-2 1.4-4.6 2.2-7.9 2.2-6.3 0-11.7-3.7-13.5-9.2l-7.9 6.1C6.4 42.6 14.6 48 24 48z" />
              </svg>
              Sign in with Google
            </a>
            <div className="flex items-center gap-3 my-5">
              <div className="flex-1 h-px bg-border" />
              <span className="text-xs text-muted">or dev sign-in</span>
              <div className="flex-1 h-px bg-border" />
            </div>
          </>
        )}

        <LoginForm users={users.map((u) => ({ email: u.email, name: u.name, role: u.role }))} />

        <p className="mt-6 text-xs text-muted">
          {googleEnabled
            ? "Google sign-in requests read-only access to your master spreadsheet so the hub can sync it."
            : "Development sign-in. Configure Google OAuth to enable Google sign-in and Sheets sync. Select a role to explore role-based access."}
        </p>
      </div>
    </div>
  );
}
