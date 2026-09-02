import { requireFinancialAccess } from "@/lib/auth";
import { scanDataQuality } from "@/lib/finance/data-quality";
import { PageHeader, Card, StatTile, EmptyState, Badge } from "@/components/ui";
import { NoAccess } from "@/components/no-access";

export const dynamic = "force-dynamic";

const SEVERITY_TONE = { ERROR: "negative", WARNING: "warning", INFO: "neutral" } as const;

export default async function DataQualityPage() {
  try {
    await requireFinancialAccess();
  } catch {
    return <NoAccess />;
  }

  const issues = await scanDataQuality();
  const errors = issues.filter((i) => i.severity === "ERROR").length;
  const warnings = issues.filter((i) => i.severity === "WARNING").length;

  // Group by code for a summary.
  const byCode = new Map<string, number>();
  for (const i of issues) byCode.set(i.code, (byCode.get(i.code) ?? 0) + 1);

  return (
    <div>
      <PageHeader
        title="Data Quality"
        description="Records requiring attention. Fix these in the Google Sheet, then re-sync."
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatTile label="Total Issues" value={String(issues.length)} />
        <StatTile label="Errors" value={String(errors)} />
        <StatTile label="Warnings" value={String(warnings)} />
        <StatTile label="Issue Types" value={String(byCode.size)} />
      </div>

      {issues.length === 0 ? (
        <Card>
          <EmptyState message="No data quality issues detected. Everything looks clean. ✓" />
        </Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted border-b">
                  <th className="py-2 font-medium">Severity</th>
                  <th className="py-2 font-medium">Entity</th>
                  <th className="py-2 font-medium">Key</th>
                  <th className="py-2 font-medium">Issue</th>
                  <th className="py-2 font-medium">Source</th>
                </tr>
              </thead>
              <tbody>
                {issues.map((i, idx) => (
                  <tr key={idx} className="border-b last:border-0 hover:bg-surface-2">
                    <td className="py-2.5"><Badge tone={SEVERITY_TONE[i.severity]}>{i.severity}</Badge></td>
                    <td className="py-2.5">{i.entityType}</td>
                    <td className="py-2.5 font-mono text-xs">{i.entityKey ?? "—"}</td>
                    <td className="py-2.5">{i.message}</td>
                    <td className="py-2.5 text-muted text-xs">
                      {i.sourceSheet ? `${i.sourceSheet}${i.sourceRow ? ` · row ${i.sourceRow}` : ""}` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
