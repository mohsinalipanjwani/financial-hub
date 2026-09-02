import { NextRequest, NextResponse } from "next/server";
import { getSession, canManageConfig } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { InMemorySheetSource } from "@/lib/google/sheets";
import { TAB_NAMES } from "@/lib/sync/mapping";
import { parseCsv } from "@/lib/export/csv";
import { previewSync } from "@/lib/sync/preview";
import { runSync } from "@/lib/sync/engine";

// Accepts multipart/form-data: one CSV file per tab, the form field named after
// the tab (e.g. "Clients", "Revenue"). `mode` = "preview" (dry-run report) or
// "commit" (import). Partial uploads are fine — only the provided tabs are
// touched, and manual imports never archive rows from tabs that weren't sent.
export async function POST(req: NextRequest) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!canManageConfig(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Expected multipart form data" }, { status: 400 });

  const mode = (form.get("mode") as string) || "preview";
  const tabNames = Object.values(TAB_NAMES);
  const tabs: Record<string, string[][]> = {};
  let anyFile = false;

  for (const tab of tabNames) {
    const file = form.get(tab);
    if (file && typeof file !== "string") {
      const text = await file.text();
      const grid = parseCsv(text);
      if (grid.length > 0) {
        tabs[tab] = grid;
        anyFile = true;
      }
    }
  }

  if (!anyFile) {
    return NextResponse.json({ error: "No CSV files provided. Attach at least one tab." }, { status: 400 });
  }

  const source = new InMemorySheetSource(tabs);

  try {
    if (mode === "commit") {
      const result = await runSync(source, { source: "import", archiveMissing: false });
      await prisma.auditLog.create({
        data: { action: "IMPORT_CSV", entityType: "sync_run", entityId: result.syncRunId, userId: user.id, metadata: { rowsRead: result.rowsRead, rowsCreated: result.rowsCreated, rowsRejected: result.rowsRejected } },
      });
      return NextResponse.json({ mode, result });
    }
    const preview = await previewSync(source);
    return NextResponse.json({ mode, preview });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Import failed" }, { status: 400 });
  }
}
