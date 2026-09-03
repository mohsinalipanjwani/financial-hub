import { getSession, canManageConfig } from "@/lib/auth";
import { PageHeader, Card, SectionTitle } from "@/components/ui";
import { NoAccess } from "@/components/no-access";
import { TAB_NAMES } from "@/lib/sync/mapping";
import { ImportForm } from "./import-form";

export const dynamic = "force-dynamic";

export default async function ImportPage() {
  const user = await getSession();
  if (!user || !canManageConfig(user.role)) return <NoAccess />;

  return (
    <div>
      <PageHeader
        title="Import / Migration"
        description="Import existing Excel/CSV exports. Preview first to see a validation report, then import. Imports are idempotent and never delete data."
      />

      <Card className="mb-6">
        <SectionTitle>Upload CSV files</SectionTitle>
        <p className="text-sm text-muted mb-4">
          Attach a CSV for any of the master tabs below. Column headers must match the master-sheet
          schema (see <code>docs/google-sheets-schema.md</code>). You can import one tab or several at once.
        </p>
        <ImportForm tabs={Object.values(TAB_NAMES)} />
      </Card>
    </div>
  );
}
