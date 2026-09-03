import { NextRequest, NextResponse } from "next/server";
import { getSession, canManageInvoices } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCompanyProfile, updateCompanyProfile } from "@/lib/invoice/service";

const FIELDS = [
  "legalName", "displayName", "logoUrl", "address", "city", "state", "country", "postalCode",
  "email", "phone", "taxId", "registrationNumber", "bankName", "bankAccountName", "accountNumber",
  "routingNumber", "iban", "swift", "defaultCurrency", "defaultPaymentTerms", "invoicePrefix", "invoiceFooter",
] as const;

export async function POST(req: NextRequest) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!canManageInvoices(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  for (const f of FIELDS) if (f in body) data[f] = body[f] === "" ? null : body[f];

  // invoiceNextNumber may only be changed while no invoice has been issued, so
  // issued numbers are never reused. Only reject an *actual* change: the client
  // always re-sends the current value, so an unchanged value must save fine.
  if (body.invoiceNextNumber != null && body.invoiceNextNumber !== "") {
    const n = parseInt(String(body.invoiceNextNumber), 10);
    if (Number.isFinite(n) && n > 0) {
      const current = await getCompanyProfile();
      if (n !== current.invoiceNextNumber) {
        const issuedCount = await prisma.invoice.count({ where: { invoiceNumber: { not: null } } });
        if (issuedCount > 0) return NextResponse.json({ error: "Cannot change the starting number after invoices have been issued" }, { status: 400 });
        data.invoiceNextNumber = n;
      }
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
