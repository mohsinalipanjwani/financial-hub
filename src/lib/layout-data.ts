import { prisma } from "@/lib/prisma";
import { scanDataQuality } from "@/lib/finance/data-quality";

/** Data needed by the app shell (sidebar badge, topbar last-synced). */
export async function getShellData() {
  const [lastSync, issues, clients] = await Promise.all([
    prisma.syncRun.findFirst({ orderBy: { startedAt: "desc" } }),
    scanDataQuality().catch(() => []),
    prisma.client.findMany({ where: { archived: false }, orderBy: { name: "asc" }, select: { id: true, name: true, source: true } }),
  ]);

  const sources = [...new Set(clients.map((c) => c.source).filter(Boolean))] as string[];

  return {
    lastSynced: lastSync?.finishedAt ?? lastSync?.startedAt ?? null,
    issueCount: issues.length,
    clients: clients.map((c) => ({ id: c.id, name: c.name })),
    sources,
  };
}

/** Lightweight filter options (clients + sources) for page filter bars. */
export async function getFilterOptions() {
  const clients = await prisma.client.findMany({
    where: { archived: false },
    orderBy: { name: "asc" },
    select: { id: true, name: true, source: true },
  });
  const sources = [...new Set(clients.map((c) => c.source).filter(Boolean))] as string[];
  return { clients: clients.map((c) => ({ id: c.id, name: c.name })), sources };
}
