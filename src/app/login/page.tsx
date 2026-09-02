import { prisma } from "@/lib/prisma";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  // Dev login: offer the seeded accounts. Phase 2 replaces this with Google OAuth.
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

        <LoginForm users={users.map((u) => ({ email: u.email, name: u.name, role: u.role }))} />

        <p className="mt-6 text-xs text-muted">
          Development sign-in. Google OAuth is planned for Phase 2. Select a role
          to explore the dashboard&apos;s role-based access.
        </p>
      </div>
    </div>
  );
}
