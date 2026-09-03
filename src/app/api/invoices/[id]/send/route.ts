import { NextRequest, NextResponse } from "next/server";
import { getSession, canManageInvoices } from "@/lib/auth";
import { markSent } from "@/lib/invoice/service";

// Marks an issued invoice as Sent. Email delivery is intentionally not wired in
// for the MVP — this records the state and audit trail so a provider can be
// added later (Send / Resend / email history).
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!canManageInvoices(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  try {
    const inv = await markSent(id, user.id);
    return NextResponse.json({ id: inv?.id, status: inv?.status });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 400 });
  }
}
