import { NextRequest, NextResponse } from "next/server";
import { getSession, canManageInvoices } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { updateCompanyProfile } from "@/lib/invoice/service";

const FIELDS = [
  "legalName", "displayName", "logoUrl", "address", "city", "state", "country", "postalCode",
  "email", "phone", "taxId", "registrationNumber", "bankName", "bankAccountName", "accountNumber",
  "iban", "swift", "defaultCurrency", "defaultPaymentTerms", "invoicePrefix", "invoiceFooter",
] as const;

export async function POST(req: NextRequest) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!canManageInvoices(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  for (const f of FIELDS) if (f in body) data[f] = body[f] === "" ? null : body[f];

  // invoiceNextNumber can only be set forward, and only while no invoice has
  // been issued at or above the requested number (never reuse issued numbers).
  if (body.invoiceNextNumber != null && body.invoiceNextNumber !== "") {
    const n = parseInt(String(body.invoiceNextNumber), 10);
    if (Number.isFinite(n) && n > 0) {
      const issuedCount = await prisma.invoice.count({ where: { invoiceNumber: { not: null } } });
      if (issuedCount === 0) data.invoiceNextNumber = n;
      else return NextResponse.json({ error: "Cannot change the starting number after invoices have been issued" }, { status: 400 });
    }
  }

  try {
    await updateCompanyProfile(data);
    await prisma.auditLog.create({ data: { action: "UPDATE_COMPANY_PROFILE", entityType: "company_profile", userId: user.id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 400 });
  }
}
