import { getSession, canManageConfig } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader, Card, SectionTitle, StatTile, EmptyState, Badge } from "@/components/ui";
import { formatDate, relativeTime } from "@/lib/format";
import { NoAccess } from "@/components/no-access";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await getSession();
  if (!user) return <NoAccess />;

  const reporting = process.env.DEFAULT_REPORTING_CURRENCY || "USD";
  const manages = canManageConfig(user.role);

  const [rates, syncs, users, sheetSync] = await Promise.all([
    prisma.exchangeRate.findMany({ orderBy: [{ currency: "asc" }, { date: "desc" }] }),
    prisma.syncRun.findMany({ orderBy: { startedAt: "desc" }, take: 5 }),
    manages ? prisma.user.findMany({ orderBy: { role: "asc" } }) : Promise.resolve([]),
    prisma.syncRun.findFirst({ orderBy: { startedAt: "desc" } }),
  ]);

  return (
    <div>
      <PageHeader title="Settings" description="Configuration, exchange rates, and sync history" />

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        <StatTile label="Reporting Currency" value={reporting} />
        <StatTile label="Last Sync" value={relativeTime(sheetSync?.finishedAt ?? sheetSync?.startedAt ?? null)} />
        <StatTile label="Sheets Integration" value="Phase 2" sub="Configured via master sheet" />
      </div>

      <div className="grid lg:grid-cols-2 gap-6 mb-6">
        <Card>
          <SectionTitle>Exchange Rates (to USD)</SectionTitle>
          {rates.length === 0 ? (
            <EmptyState message="No exchange rates configured." />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted border-b">
                  <th className="py-2 font-medium">Currency</th>
                  <th className="py-2 font-medium">Effective</th>
                  <th className="py-2 font-medium text-right">Rate to USD</th>
                </tr>
              </thead>
              <tbody>
                {rates.map((r) => (
                  <tr key={r.id} className="border-b last:border-0">
                    <td className="py-2 font-medium">{r.currency}</td>
                    <td className="py-2 text-muted">{formatDate(r.date)}</td>
                    <td className="py-2 text-right tabular-nums">{Number(r.rateToUsd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card>
          <SectionTitle>Sync History</SectionTitle>
          {syncs.length === 0 ? (
            <EmptyState message="No sync runs yet." />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted border-b">
                  <th className="py-2 font-medium">Started</th>
                  <th className="py-2 font-medium">Status</th>
                  <th className="py-2 font-medium text-right">Read</th>
                  <th className="py-2 font-medium text-right">Rejected</th>
                </tr>
              </thead>
              <tbody>
                {syncs.map((s) => (
                  <tr key={s.id} className="border-b last:border-0">
                    <td className="py-2">{formatDate(s.startedAt)}</td>
                    <td className="py-2"><Badge tone={s.status === "SUCCESS" ? "positive" : s.status === "FAILED" ? "negative" : "warning"}>{s.status}</Badge></td>
                    <td className="py-2 text-right tabular-nums">{s.rowsRead}</td>
                    <td className="py-2 text-right tabular-nums">{s.rowsRejected}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>

      {manages && (
        <Card>
          <SectionTitle>Users & Roles</SectionTitle>
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
                  <td className="py-2 font-medium">{u.name}</td>
                  <td className="py-2 text-muted">{u.email}</td>
                  <td className="py-2"><Badge>{u.role}</Badge></td>
                  <td className="py-2"><Badge tone={u.active ? "positive" : "neutral"}>{u.active ? "Active" : "Inactive"}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {!manages && (
        <Card>
          <p className="text-sm text-muted">Configuration management is restricted to Finance and Admin roles.</p>
        </Card>
      )}
    </div>
  );
}
