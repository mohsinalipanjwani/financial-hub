// Invoice service: drafts, issuing (with atomic numbering), voiding/reissuing,
// payment reconciliation, listing/filtering, and KPIs. Issued invoices are
// treated as historical records — their identity fields are frozen.

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { loadRateTable } from "@/lib/finance/rates";
import { tryConvertCurrency } from "@/lib/finance/calculations";
import {
  computeTotals,
  amountDue as calcAmountDue,
  deriveStatusFromPayments,
  displayStatus,
  formatInvoiceNumber,
  addDays,
  paymentTermsToDays,
  type InvoiceStatus,
  type DisplayStatus,
} from "./calc";

const COMPANY_ID = "primary";

export interface ItemInput {
  description: string;
  quantity: number;
  unitPrice: number;
  revenuePhase?: string | null;
}

export interface DraftInput {
  clientId: string;
  revenueId?: string | null;
  project?: string | null;
  invoiceDate?: string | Date;
  dueDate?: string | Date;
  currency?: string;
  discount?: number;
  tax?: number;
  notes?: string | null;
  paymentTerms?: string | null;
  items: ItemInput[];
}

// --- Company profile ---

export async function getCompanyProfile() {
  const existing = await prisma.companyProfile.findUnique({ where: { id: COMPANY_ID } });
  if (existing) return existing;
  return prisma.companyProfile.create({ data: { id: COMPANY_ID, displayName: "Your Company" } });
}

export async function updateCompanyProfile(data: Prisma.CompanyProfileUpdateInput) {
  await getCompanyProfile();
  return prisma.companyProfile.update({ where: { id: COMPANY_ID }, data });
}

// --- Draft creation ---

function toDate(v: string | Date | undefined, fallback: Date): Date {
  if (!v) return fallback;
  const d = typeof v === "string" ? new Date(v) : v;
  return isNaN(d.getTime()) ? fallback : d;
}

async function buildDraft(input: DraftInput, userId?: string) {
  const profile = await getCompanyProfile();
  const client = await prisma.client.findUnique({ where: { id: input.clientId } });
  if (!client) throw new Error("Client not found");

  const currency = input.currency || client.defaultCurrency || profile.defaultCurrency || "USD";
  const paymentTerms = input.paymentTerms ?? client.paymentTerms ?? profile.defaultPaymentTerms;
  const invoiceDate = toDate(input.invoiceDate, new Date());
  const dueDate = toDate(input.dueDate, addDays(invoiceDate, paymentTermsToDays(paymentTerms)));

  const items = input.items.length ? input.items : [{ description: "Services", quantity: 1, unitPrice: 0 }];
  const totals = computeTotals(items, input.discount ?? 0, input.tax ?? 0);

  return prisma.invoice.create({
    data: {
      clientId: input.clientId,
      revenueId: input.revenueId ?? null,
      project: input.project ?? null,
      invoiceDate,
      dueDate,
      currency,
      subtotal: totals.subtotal,
      discount: totals.discount,
      tax: totals.tax,
      total: totals.total,
      amountPaid: 0,
      amountDue: totals.total,
      status: "DRAFT",
      notes: input.notes ?? client.invoiceNotes ?? null,
      paymentTerms,
      createdById: userId ?? null,
      items: {
        create: items.map((it, i) => ({
          description: it.description,
          quantity: it.quantity,
          unitPrice: it.unitPrice,
          amount: Math.round(it.quantity * it.unitPrice * 100) / 100,
          revenuePhase: it.revenuePhase ?? null,
          sortOrder: i,
        })),
      },
    },
    include: { items: true },
  });
}

export async function createStandaloneDraft(input: DraftInput, userId?: string) {
  const inv = await buildDraft(input, userId);
  await audit("INVOICE_CREATED", inv.id, userId, { standalone: true });
  return inv;
}

/** Pre-fill a draft from a Revenue record + the client's billing profile. */
export async function createDraftFromRevenue(revenueId: string, userId?: string) {
  const revenue = await prisma.revenue.findUnique({ where: { id: revenueId }, include: { client: true } });
  if (!revenue) throw new Error("Revenue not found");

  const existing = await prisma.invoice.findUnique({ where: { revenueId } });
  if (existing) return existing; // 0/1 primary invoice per revenue

  const desc = [revenue.project, revenue.phase].filter(Boolean).join(" — ") || "Services rendered";
  const inv = await buildDraft(
    {
      clientId: revenue.clientId,
      revenueId,
      project: revenue.project,
      currency: revenue.currency,
      paymentTerms: revenue.client.paymentTerms ?? undefined,
      invoiceDate: revenue.date,
      dueDate: revenue.expectedDate ?? undefined,
      notes: revenue.notes ?? undefined,
      items: [
        { description: desc, quantity: 1, unitPrice: Number(revenue.amount), revenuePhase: revenue.phase },
      ],
    },
    userId,
  );
  await audit("INVOICE_CREATED", inv.id, userId, { fromRevenue: revenue.revenueKey });
  return inv;
}

// --- Draft editing ---

export async function updateDraft(id: string, input: DraftInput, userId?: string) {
  const inv = await prisma.invoice.findUnique({ where: { id } });
  if (!inv) throw new Error("Invoice not found");
  if (inv.status !== "DRAFT") throw new Error("Only draft invoices can be edited");

  const totals = computeTotals(input.items, input.discount ?? 0, input.tax ?? 0);
  const invoiceDate = toDate(input.invoiceDate, inv.invoiceDate);
  const dueDate = toDate(input.dueDate, inv.dueDate);

  await prisma.$transaction([
    prisma.invoiceItem.deleteMany({ where: { invoiceId: id } }),
    prisma.invoice.update({
      where: { id },
      data: {
        clientId: input.clientId,
        revenueId: input.revenueId ?? null,
        project: input.project ?? null,
        invoiceDate,
        dueDate,
        currency: input.currency || inv.currency,
        subtotal: totals.subtotal,
        discount: totals.discount,
        tax: totals.tax,
        total: totals.total,
        amountDue: totals.total,
        notes: input.notes ?? null,
        paymentTerms: input.paymentTerms ?? inv.paymentTerms,
        items: {
          create: input.items.map((it, i) => ({
            description: it.description,
            quantity: it.quantity,
            unitPrice: it.unitPrice,
            amount: Math.round(it.quantity * it.unitPrice * 100) / 100,
            revenuePhase: it.revenuePhase ?? null,
            sortOrder: i,
          })),
        },
      },
    }),
  ]);
  await audit("INVOICE_EDITED", id, userId);
  return prisma.invoice.findUnique({ where: { id }, include: { items: true } });
}

// --- Issue (atomic numbering) ---

export async function issueInvoice(id: string, userId?: string) {
  const inv = await prisma.invoice.findUnique({ where: { id } });
  if (!inv) throw new Error("Invoice not found");
  if (inv.status !== "DRAFT") throw new Error("Only draft invoices can be issued");
  if (inv.invoiceNumber) throw new Error("Invoice already has a number");

  const year = inv.invoiceDate.getUTCFullYear();

  // Allocate the next number atomically so concurrent issues never collide.
  const invoiceNumber = await prisma.$transaction(async (tx) => {
    const profile = await tx.companyProfile.upsert({
      where: { id: COMPANY_ID },
      create: { id: COMPANY_ID },
      update: {},
    });
    const seq = profile.invoiceNextNumber;
    const number = formatInvoiceNumber(profile.invoicePrefix, year, seq);
    await tx.companyProfile.update({ where: { id: COMPANY_ID }, data: { invoiceNextNumber: seq + 1 } });
    await tx.invoice.update({ where: { id }, data: { invoiceNumber: number, status: "ISSUED", issuedAt: new Date() } });
    return number;
  });

  await recalcInvoicePayments(id); // pick up any pre-existing payments
  await audit("INVOICE_ISSUED", id, userId, { invoiceNumber });

  // Freeze the PDF. Non-fatal if generation fails — it can be regenerated.
  // Skipped under test to keep the suite hermetic (no headless browser launch).
  if (process.env.NODE_ENV !== "test" && process.env.INVOICE_PDF_DISABLED !== "1") {
    try {
      const { generateAndStorePdf } = await import("./pdf");
      await generateAndStorePdf(id);
    } catch (e) {
      console.error("PDF generation failed for", id, e);
    }
  }

  return prisma.invoice.findUnique({ where: { id }, include: { items: true } });
}

export async function markSent(id: string, userId?: string) {
  const inv = await prisma.invoice.findUnique({ where: { id } });
  if (!inv) throw new Error("Invoice not found");
  if (inv.status === "DRAFT" || inv.status === "VOID") throw new Error("Only issued invoices can be marked sent");
  await prisma.invoice.update({ where: { id }, data: { status: inv.status === "ISSUED" ? "SENT" : inv.status, sentAt: new Date() } });
  await audit("INVOICE_SENT", id, userId);
  return prisma.invoice.findUnique({ where: { id } });
}

// --- Void / reissue ---

export async function voidInvoice(id: string, userId: string, reason: string, reissue = false) {
  const inv = await prisma.invoice.findUnique({ where: { id }, include: { items: true } });
  if (!inv) throw new Error("Invoice not found");
  if (inv.status === "DRAFT") throw new Error("Delete drafts instead of voiding them");
  if (inv.status === "VOID") throw new Error("Invoice is already void");

  await prisma.invoice.update({ where: { id }, data: { status: "VOID", voidedAt: new Date(), voidReason: reason } });
  await audit("INVOICE_VOIDED", id, userId, { reason });

  let replacement = null;
  if (reissue) {
    replacement = await prisma.invoice.create({
      data: {
        clientId: inv.clientId,
        revenueId: null, // avoid unique clash; can be relinked in the draft
        project: inv.project,
        invoiceDate: new Date(),
        dueDate: addDays(new Date(), paymentTermsToDays(inv.paymentTerms)),
        currency: inv.currency,
        subtotal: inv.subtotal,
        discount: inv.discount,
        tax: inv.tax,
        total: inv.total,
        amountDue: inv.total,
        status: "DRAFT",
        notes: inv.notes,
        paymentTerms: inv.paymentTerms,
        replacesInvoiceId: inv.id,
        createdById: userId,
        items: {
          create: inv.items.map((it) => ({
            description: it.description,
            quantity: it.quantity,
            unitPrice: it.unitPrice,
            amount: it.amount,
            revenuePhase: it.revenuePhase,
            sortOrder: it.sortOrder,
          })),
        },
      },
      include: { items: true },
    });
    await audit("INVOICE_CREATED", replacement.id, userId, { replaces: inv.invoiceNumber });
  }
  return { voided: inv.id, replacement };
}

// --- Payment reconciliation ---

/**
 * Recompute amountPaid/amountDue/status for one invoice from its linked
 * payments — those applied directly (invoiceId) OR via the invoice's revenue
 * record (revenueId). Cleared, non-archived payments only; converted to the
 * invoice currency.
 */
export async function recalcInvoicePayments(id: string): Promise<void> {
  const inv = await prisma.invoice.findUnique({ where: { id } });
  if (!inv || inv.status === "VOID") return;

  const or: Prisma.PaymentWhereInput[] = [{ invoiceId: id }];
  if (inv.revenueId) or.push({ revenueId: inv.revenueId, invoiceId: null });

  const payments = await prisma.payment.findMany({
    where: { archived: false, status: "CLEARED", OR: or },
  });

  const rates = await loadRateTable(new Date());
  let paid = 0;
  for (const p of payments) {
    paid += tryConvertCurrency(Number(p.amount), p.currency, inv.currency, rates) ?? 0;
  }
  paid = Math.round(paid * 100) / 100;

  const total = Number(inv.total);
  const due = calcAmountDue(total, paid);
  const status = deriveStatusFromPayments(inv.status as InvoiceStatus, total, paid);

  await prisma.invoice.update({ where: { id }, data: { amountPaid: paid, amountDue: due, status } });
}

/** Refresh all non-draft, non-void invoices — called after a sheet sync. */
export async function recalcAllInvoices(): Promise<void> {
  const invoices = await prisma.invoice.findMany({
    where: { status: { notIn: ["DRAFT", "VOID"] } },
    select: { id: true },
  });
  for (const { id } of invoices) await recalcInvoicePayments(id);
}

// --- Reads ---

export interface InvoiceFilters {
  clientId?: string;
  status?: string; // lifecycle status or "OVERDUE"
  currency?: string;
  project?: string;
  q?: string;
  from?: string;
  to?: string;
  sort?: "invoiceDate" | "dueDate" | "total" | "status";
  dir?: "asc" | "desc";
}

export interface InvoiceRow {
  id: string;
  invoiceNumber: string | null;
  clientId: string;
  clientName: string;
  invoiceDate: Date;
  dueDate: Date;
  currency: string;
  total: number;
  amountPaid: number;
  amountDue: number;
  status: InvoiceStatus;
  displayStatus: DisplayStatus;
  project: string | null;
}

export async function listInvoices(filters: InvoiceFilters = {}): Promise<InvoiceRow[]> {
  const now = new Date();
  const where: Prisma.InvoiceWhereInput = {};
  if (filters.clientId) where.clientId = filters.clientId;
  if (filters.currency) where.currency = filters.currency;
  if (filters.project) where.project = { contains: filters.project, mode: "insensitive" };
  if (filters.from || filters.to) {
    where.invoiceDate = {};
    if (filters.from) (where.invoiceDate as Prisma.DateTimeFilter).gte = new Date(filters.from);
    if (filters.to) (where.invoiceDate as Prisma.DateTimeFilter).lte = new Date(filters.to);
  }
  if (filters.q) {
    where.OR = [
      { invoiceNumber: { contains: filters.q, mode: "insensitive" } },
      { client: { name: { contains: filters.q, mode: "insensitive" } } },
      { project: { contains: filters.q, mode: "insensitive" } },
    ];
  }
  if (filters.status && filters.status !== "OVERDUE") {
    where.status = filters.status as InvoiceStatus;
  } else if (filters.status === "OVERDUE") {
    where.status = { in: ["ISSUED", "SENT", "PARTIALLY_PAID"] };
    where.dueDate = { lt: now };
    where.amountDue = { gt: 0 };
  }

  const sortField = filters.sort ?? "invoiceDate";
  const dir = filters.dir ?? "desc";

  const rows = await prisma.invoice.findMany({
    where,
    include: { client: true },
    orderBy: { [sortField]: dir },
  });

  return rows.map((r) => ({
    id: r.id,
    invoiceNumber: r.invoiceNumber,
    clientId: r.clientId,
    clientName: r.client.name,
    invoiceDate: r.invoiceDate,
    dueDate: r.dueDate,
    currency: r.currency,
    total: Number(r.total),
    amountPaid: Number(r.amountPaid),
    amountDue: Number(r.amountDue),
    status: r.status as InvoiceStatus,
    displayStatus: displayStatus(r.status as InvoiceStatus, r.dueDate, Number(r.amountDue), now),
    project: r.project,
  }));
}

export async function getInvoice(id: string) {
  return prisma.invoice.findUnique({
    where: { id },
    include: {
      items: { orderBy: { sortOrder: "asc" } },
      client: true,
      revenue: true,
      payments: { where: { archived: false }, orderBy: { date: "asc" } },
      replaces: true,
      replacedBy: true,
    },
  });
}

export interface InvoiceKpis {
  reportingCurrency: string;
  totalInvoiced: number;
  paid: number;
  outstanding: number;
  overdue: number;
  dueThisWeek: number;
  draft: number;
  counts: { draft: number; issued: number; overdue: number; paid: number };
}

const REPORTING = process.env.DEFAULT_REPORTING_CURRENCY || "USD";

export async function getInvoiceKpis(): Promise<InvoiceKpis> {
  const now = new Date();
  const weekAhead = addDays(now, 7);
  const rates = await loadRateTable(now);
  const invoices = await prisma.invoice.findMany({ where: { status: { not: "VOID" } } });
  const conv = (n: number, c: string) => tryConvertCurrency(n, c, REPORTING, rates) ?? 0;

  let totalInvoiced = 0, paid = 0, outstanding = 0, overdue = 0, dueThisWeek = 0, draft = 0;
  const counts = { draft: 0, issued: 0, overdue: 0, paid: 0 };

  for (const inv of invoices) {
    const total = conv(Number(inv.total), inv.currency);
    const due = conv(Number(inv.amountDue), inv.currency);
    const paidAmt = conv(Number(inv.amountPaid), inv.currency);
    const ds = displayStatus(inv.status as InvoiceStatus, inv.dueDate, Number(inv.amountDue), now);

    if (inv.status === "DRAFT") { draft += total; counts.draft++; continue; }

    totalInvoiced += total;
    paid += paidAmt;
    outstanding += due;
    if (ds === "OVERDUE") { overdue += due; counts.overdue++; }
    else if (ds === "PAID") counts.paid++;
    else counts.issued++;
    if (due > 0 && inv.dueDate >= now && inv.dueDate <= weekAhead) dueThisWeek += due;
  }

  const r2 = (n: number) => Math.round(n * 100) / 100;
  return {
    reportingCurrency: REPORTING,
    totalInvoiced: r2(totalInvoiced),
    paid: r2(paid),
    outstanding: r2(outstanding),
    overdue: r2(overdue),
    dueThisWeek: r2(dueThisWeek),
    draft: r2(draft),
    counts,
  };
}

export async function getClientInvoiceSummary(clientId: string) {
  const now = new Date();
  const rates = await loadRateTable(now);
  const invoices = await prisma.invoice.findMany({ where: { clientId, status: { not: "VOID" } } });
  const conv = (n: number, c: string) => tryConvertCurrency(n, c, REPORTING, rates) ?? 0;

  let invoiced = 0, paid = 0, outstanding = 0, overdue = 0;
  for (const inv of invoices) {
    if (inv.status === "DRAFT") continue;
    invoiced += conv(Number(inv.total), inv.currency);
    paid += conv(Number(inv.amountPaid), inv.currency);
    outstanding += conv(Number(inv.amountDue), inv.currency);
    if (displayStatus(inv.status as InvoiceStatus, inv.dueDate, Number(inv.amountDue), now) === "OVERDUE") {
      overdue += conv(Number(inv.amountDue), inv.currency);
    }
  }
  const r2 = (n: number) => Math.round(n * 100) / 100;
  return { reportingCurrency: REPORTING, totalInvoiced: r2(invoiced), totalPaid: r2(paid), totalOutstanding: r2(outstanding), overdue: r2(overdue) };
}

// --- audit helper ---

async function audit(action: string, invoiceId: string, userId?: string, metadata?: Prisma.InputJsonValue) {
  await prisma.auditLog.create({
    data: { action, entityType: "invoice", entityId: invoiceId, userId: userId ?? null, metadata: metadata ?? undefined },
  });
}
