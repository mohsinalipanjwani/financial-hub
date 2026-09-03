import { NextRequest, NextResponse } from "next/server";
import { getSession, canManageInvoices } from "@/lib/auth";
import { voidInvoice } from "@/lib/invoice/service";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!canManageInvoices(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const reason = String(body.reason || "").trim();
  if (!reason) return NextResponse.json({ error: "A reason is required to void an invoice" }, { status: 400 });

  try {
    const result = await voidInvoice(id, user.id, reason, Boolean(body.reissue));
    return NextResponse.json({ ok: true, replacementId: result.replacement?.id ?? null });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 400 });
  }
}
