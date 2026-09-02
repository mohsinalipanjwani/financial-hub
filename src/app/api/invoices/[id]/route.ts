import { NextRequest, NextResponse } from "next/server";
import { getSession, canManageInvoices } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { updateDraft } from "@/lib/invoice/service";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!canManageInvoices(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  try {
    const inv = await updateDraft(id, body, user.id);
    return NextResponse.json({ id: inv?.id });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 400 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!canManageInvoices(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const inv = await prisma.invoice.findUnique({ where: { id } });
  if (!inv) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (inv.status !== "DRAFT") {
    return NextResponse.json({ error: "Only draft invoices can be deleted. Void issued invoices instead." }, { status: 400 });
  }
  await prisma.invoice.delete({ where: { id } });
  await prisma.auditLog.create({ data: { action: "INVOICE_DELETED", entityType: "invoice", entityId: id, userId: user.id } });
  return NextResponse.json({ ok: true });
}
