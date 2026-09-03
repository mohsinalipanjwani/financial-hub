import { NextRequest, NextResponse } from "next/server";
import { getSession, canManageConfig } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { setSpreadsheetId, disconnect } from "@/lib/google/connection";

export async function POST(req: NextRequest) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!canManageConfig(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const action = body.action as string | undefined;

  try {
    if (action === "setSpreadsheet") {
      const id = String(body.spreadsheetId || "").trim();
      if (!id) return NextResponse.json({ error: "spreadsheetId required" }, { status: 400 });
      await setSpreadsheetId(id);
      await prisma.auditLog.create({ data: { action: "SET_SPREADSHEET", entityType: "google_connection", userId: user.id, metadata: { spreadsheetId: id } } });
      return NextResponse.json({ ok: true });
    }
    if (action === "disconnect") {
      await disconnect();
      await prisma.auditLog.create({ data: { action: "DISCONNECT_GOOGLE", entityType: "google_connection", userId: user.id } });
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 400 });
  }
}
