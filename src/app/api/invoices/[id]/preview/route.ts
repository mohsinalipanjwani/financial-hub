import { NextRequest, NextResponse } from "next/server";
import { getSession, canViewInvoices } from "@/lib/auth";
import { buildInvoiceHtml } from "@/lib/invoice/pdf";

// Returns the invoice's HTML (same markup used for the PDF) for the live
// preview iframe, so the preview matches the final document exactly.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!canViewInvoices(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const html = await buildInvoiceHtml(id, true);
  if (!html) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
