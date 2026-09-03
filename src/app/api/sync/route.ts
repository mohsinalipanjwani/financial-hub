import { NextResponse } from "next/server";
import { getSession, canManageConfig } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getSheetSource } from "@/lib/google/connection";
import { runSync } from "@/lib/sync/engine";

export async function POST() {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!canManageConfig(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const source = await getSheetSource();
    const result = await runSync(source);
    await prisma.auditLog.create({
      data: { action: "SYNC_RUN", entityType: "sync_run", entityId: result.syncRunId, userId: user.id, metadata: { status: result.status, rowsRead: result.rowsRead } },
    });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Sync failed" }, { status: 400 });
  }
}
