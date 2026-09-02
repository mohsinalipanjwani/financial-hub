import { NextRequest, NextResponse } from "next/server";
import { getSession, canViewInvoices } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildInvoiceHtml, renderPdfFromHtml } from "@/lib/invoice/pdf";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!canViewInvoices(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const inv = await prisma.invoice.findUnique({ where: { id }, include: { pdf: true } });
  if (!inv) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let bytes: Buffer | null = inv.pdf ? Buffer.from(inv.pdf.data) : null;

  // Drafts (or issued invoices missing a stored PDF) are rendered on demand.
  if (!bytes) {
    const html = await buildInvoiceHtml(id, true);
    if (!html) return NextResponse.json({ error: "Not found" }, { status: 404 });
    try {
      bytes = await renderPdfFromHtml(html);
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : "PDF render failed" }, { status: 500 });
    }
  }

  if (inv.status !== "DRAFT") {
    await prisma.auditLog.create({ data: { action: "INVOICE_DOWNLOADED", entityType: "invoice", entityId: id, userId: user.id } });
  }

  const filename = `${inv.invoiceNumber || "draft-invoice"}.pdf`;
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
    },
  });
}
