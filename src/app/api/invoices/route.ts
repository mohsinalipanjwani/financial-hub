import { NextRequest, NextResponse } from "next/server";
import { getSession, canManageInvoices } from "@/lib/auth";
import { createDraftFromRevenue, createStandaloneDraft } from "@/lib/invoice/service";

export async function POST(req: NextRequest) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!canManageInvoices(user.role)) return NextResponse.json({ error: "Not allowed to create invoices" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  try {
    if (body.fromRevenueId) {
      const inv = await createDraftFromRevenue(String(body.fromRevenueId), user.id);
      return NextResponse.json({ id: inv.id });
    }
    if (!body.clientId || !Array.isArray(body.items)) {
      return NextResponse.json({ error: "clientId and items are required" }, { status: 400 });
    }
    const inv = await createStandaloneDraft(body, user.id);
    return NextResponse.json({ id: inv.id });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 400 });
  }
}
