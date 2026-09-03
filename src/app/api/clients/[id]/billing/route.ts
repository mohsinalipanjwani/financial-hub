import { NextRequest, NextResponse } from "next/server";
import { getSession, canManageInvoices } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const FIELDS = [
  "legalName", "companyName", "billingEmail", "billingContact", "billingAddress", "city", "state",
  "country", "postalCode", "taxId", "vatNumber", "defaultCurrency", "paymentTerms", "invoiceNotes",
] as const;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!canManageInvoices(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  for (const f of FIELDS) if (f in body) data[f] = body[f] === "" ? null : body[f];

  try {
    await prisma.client.update({ where: { id }, data });
    await prisma.auditLog.create({ data: { action: "UPDATE_CLIENT_BILLING", entityType: "client", entityId: id, userId: user.id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 400 });
  }
}
