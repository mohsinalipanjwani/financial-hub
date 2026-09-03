// Pure invoice math + status derivation. No Prisma, no I/O — unit-tested.

import { round2 } from "@/lib/finance/calculations";

export type InvoiceStatus = "DRAFT" | "ISSUED" | "SENT" | "PARTIALLY_PAID" | "PAID" | "VOID";
/** Status as shown to users — adds the derived OVERDUE overlay. */
export type DisplayStatus = InvoiceStatus | "OVERDUE";

export interface LineItemInput {
  quantity: number;
  unitPrice: number;
}

/** Line amount = quantity × unit price, rounded. */
export function lineAmount(item: LineItemInput): number {
  return round2(item.quantity * item.unitPrice);
}

export interface Totals {
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
}

/**
 * Compute invoice totals. `discount` and `tax` are absolute amounts in the
 * invoice currency (not percentages). Total is floored at 0.
 */
export function computeTotals(
  items: LineItemInput[],
  discount = 0,
  tax = 0,
): Totals {
  const subtotal = round2(items.reduce((s, it) => s + lineAmount(it), 0));
  const d = round2(Math.max(0, discount));
  const t = round2(Math.max(0, tax));
  const total = round2(Math.max(0, subtotal - d + t));
  return { subtotal, discount: d, tax: t, total };
}

/** Amount still owed = total − amount paid, floored at 0. */
export function amountDue(total: number, amountPaid: number): number {
  return round2(Math.max(0, total - amountPaid));
}

/**
 * Derive the stored lifecycle status from payment progress. Used when payments
 * change: a non-void, issued invoice becomes PAID / PARTIALLY_PAID / (back to)
 * its issued state. DRAFT and VOID are never changed by payments.
 */
export function deriveStatusFromPayments(
  current: InvoiceStatus,
  total: number,
  amountPaid: number,
): InvoiceStatus {
  if (current === "DRAFT" || current === "VOID") return current;
  if (total > 0 && amountPaid >= total) return "PAID";
  if (amountPaid > 0) return "PARTIALLY_PAID";
  // No payments: keep whichever issued state it was (ISSUED or SENT).
  return current === "PAID" || current === "PARTIALLY_PAID" ? "ISSUED" : current;
}

/**
 * The status to display, applying the OVERDUE overlay: an unpaid, non-void,
 * issued invoice whose due date has passed reads as OVERDUE.
 */
export function displayStatus(
  status: InvoiceStatus,
  dueDate: Date,
  amountDueValue: number,
  now: Date = new Date(),
): DisplayStatus {
  if (status === "DRAFT" || status === "VOID" || status === "PAID") return status;
  if (amountDueValue > 0 && dueDate.getTime() < now.getTime()) return "OVERDUE";
  return status;
}

export function isOverdue(
  status: InvoiceStatus,
  dueDate: Date,
  amountDueValue: number,
  now: Date = new Date(),
): boolean {
  return displayStatus(status, dueDate, amountDueValue, now) === "OVERDUE";
}

/** Format an invoice number, e.g. ("INV", 2026, 42) -> "INV-2026-0042". */
export function formatInvoiceNumber(prefix: string, year: number, seq: number, pad = 4): string {
  return `${prefix}-${year}-${String(seq).padStart(pad, "0")}`;
}

/** Add days to a date (UTC), for computing due dates from payment terms. */
export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

/** Parse "Net 30" / "30" / "Due on receipt" into a day count (default 30). */
export function paymentTermsToDays(terms: string | null | undefined): number {
  if (!terms) return 30;
  if (/receipt/i.test(terms)) return 0;
  const m = terms.match(/(\d+)/);
  return m ? parseInt(m[1], 10) : 30;
}
