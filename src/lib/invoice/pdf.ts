// Server-side invoice PDF: renders the shared HTML template with headless
// Chromium (pre-installed) and stores the bytes on the invoice, so an issued
// invoice keeps its exact document even if the template later changes.

import fs from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { getCompanyProfile } from "./service";
import { renderInvoiceHtml, type TemplateInvoice, type TemplateClient, type TemplateCompany } from "./template";
import type { InvoiceStatus } from "./calc";

/** Build the template data for an invoice (also used by the live preview). */
export async function buildInvoiceHtml(invoiceId: string, showBank: boolean): Promise<string | null> {
  const [inv, company] = await Promise.all([
    prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: { items: { orderBy: { sortOrder: "asc" } }, client: true },
    }),
    getCompanyProfile(),
  ]);
  if (!inv) return null;

  const invoice: TemplateInvoice = {
    invoiceNumber: inv.invoiceNumber,
    status: inv.status as InvoiceStatus,
    invoiceDate: inv.invoiceDate,
    dueDate: inv.dueDate,
    currency: inv.currency,
    subtotal: Number(inv.subtotal),
    discount: Number(inv.discount),
    tax: Number(inv.tax),
    total: Number(inv.total),
    amountPaid: Number(inv.amountPaid),
    amountDue: Number(inv.amountDue),
    notes: inv.notes,
    paymentTerms: inv.paymentTerms,
    project: inv.project,
    items: inv.items.map((it) => ({
      description: it.description,
      quantity: Number(it.quantity),
      unitPrice: Number(it.unitPrice),
      amount: Number(it.amount),
      revenuePhase: it.revenuePhase,
    })),
  };

  const c = inv.client;
  const client: TemplateClient = {
    name: c.name,
    legalName: c.legalName,
    companyName: c.companyName,
    billingContact: c.billingContact,
    billingEmail: c.billingEmail,
    billingAddress: c.billingAddress,
    city: c.city,
    state: c.state,
    country: c.country,
    postalCode: c.postalCode,
    taxId: c.taxId,
    vatNumber: c.vatNumber,
  };

  const company_: TemplateCompany = {
    legalName: company.legalName,
    displayName: company.displayName,
    logoUrl: company.logoUrl,
    address: company.address,
    city: company.city,
    state: company.state,
    country: company.country,
    postalCode: company.postalCode,
    email: company.email,
    phone: company.phone,
    taxId: company.taxId,
    registrationNumber: company.registrationNumber,
    bankName: company.bankName,
    bankAccountName: company.bankAccountName,
    accountNumber: company.accountNumber,
    iban: company.iban,
    swift: company.swift,
    invoiceFooter: company.invoiceFooter,
  };

  return renderInvoiceHtml({ invoice, client, company: company_, showBank });
}

/** Locate the pre-installed Chromium; fall back to Playwright's own resolution. */
function resolveChromiumPath(): string | undefined {
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || "/opt/pw-browsers";
  try {
    const dir = fs.readdirSync(base).find((d) => d.startsWith("chromium-") && !d.includes("headless"));
    if (dir) {
      const exe = path.join(base, dir, "chrome-linux", "chrome");
      if (fs.existsSync(exe)) return exe;
    }
  } catch {
    // fall through
  }
  return undefined;
}

export async function renderPdfFromHtml(html: string): Promise<Buffer> {
  const { chromium } = await import("playwright-core");
  const executablePath = resolveChromiumPath();
  const browser = await chromium.launch({ executablePath, args: ["--no-sandbox"] });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle" });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "0", bottom: "0", left: "0", right: "0" },
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}

/** Render the invoice and store the PDF bytes (frozen document). */
export async function generateAndStorePdf(invoiceId: string): Promise<void> {
  const html = await buildInvoiceHtml(invoiceId, true);
  if (!html) throw new Error("Invoice not found");
  const buf = await renderPdfFromHtml(html);
  const bytes = new Uint8Array(buf);
  await prisma.invoicePdf.upsert({
    where: { invoiceId },
    create: { invoiceId, data: bytes, byteSize: bytes.length },
    update: { data: bytes, byteSize: bytes.length, createdAt: new Date() },
  });
  await prisma.invoice.update({ where: { id: invoiceId }, data: { updatedAt: new Date() } });
}
