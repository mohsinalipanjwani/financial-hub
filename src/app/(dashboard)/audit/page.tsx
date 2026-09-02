import { getSession, canManageConfig } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader, Card, EmptyState, Badge } from "@/components/ui";
import { NoAccess } from "@/components/no-access";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

function tone(action: string): "positive" | "warning" | "neutral" | "negative" {
  if (action.includes("LOGIN")) return "neutral";
  if (action.includes("SYNC") || action.includes("IMPORT")) return "positive";
  if (action.includes("DISCONNECT")) return "warning";
  if (action.includes("ROLE") || action.includes("USER")) return "warning";
  return "neutral";
}

export default async function AuditPage() {
  const user = await getSession();
  if (!user || !canManageConfig(user.role)) return <NoAccess />;

  const logs = await prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { user: true },
  });

  return (
    <div>
      <PageHeader title="Audit Log" description="Sign-ins, syncs, imports, and configuration changes (most recent 200)." />

      <Card>
        {logs.length === 0 ? (
          <EmptyState message="No audit events recorded yet." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted border-b">
                  <th className="py-2 font-medium">When</th>
                  <th className="py-2 font-medium">Action</th>
                  <th className="py-2 font-medium">User</th>
                  <th className="py-2 font-medium">Entity</th>
                  <th className="py-2 font-medium">Details</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((l) => (
                  <tr key={l.id} className="border-b last:border-0 hover:bg-surface-2">
                    <td className="py-2.5 text-muted whitespace-nowrap">{formatDate(l.createdAt)} {l.createdAt.toISOString().slice(11, 16)}</td>
                    <td className="py-2.5"><Badge tone={tone(l.action)}>{l.action}</Badge></td>
                    <td className="py-2.5">{l.user?.name ?? "—"}</td>
                    <td className="py-2.5 text-muted">{l.entityType ?? "—"}</td>
                    <td className="py-2.5 text-muted text-xs font-mono">
                      {l.metadata ? JSON.stringify(l.metadata) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
