// Pure row parsers/normalizers. Each converts a MappedRow (canonical field ->
// raw string) into a validated, normalized payload for the database, or returns
// structured errors. No Prisma, no I/O — fully unit-testable.

import type { MappedRow } from "./mapping";

export interface ParseResult<T> {
  ok: boolean;
  value?: T;
  errors: string[];
}

// --- primitive parsers ---

export function parseDecimal(raw: string): number | null {
  if (raw == null) return null;
  const cleaned = raw.replace(/[,$\s]/g, "").replace(/[^0-9.\-]/g, "");
  if (cleaned === "" || cleaned === "-" || cleaned === ".") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export function parseDate(raw: string): Date | null {
  if (!raw || !raw.trim()) return null;
  const s = raw.trim();
  // ISO or common YYYY-MM-DD / YYYY/MM/DD
  let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (m) return utcDate(+m[1], +m[2] - 1, +m[3]);
  // MM/DD/YYYY or DD/MM/YYYY — assume MM/DD/YYYY (US), fall back if invalid
  m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (m) {
    const a = +m[1], b = +m[2], y = +m[3];
    if (a > 12 && b <= 12) return utcDate(y, b - 1, a); // clearly DD/MM
    return utcDate(y, a - 1, b);
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** First day of the month (UTC) for a date or a "YYYY-MM" string. */
export function parseMonth(raw: string): Date | null {
  if (!raw || !raw.trim()) return null;
  const s = raw.trim();
  const ym = s.match(/^(\d{4})[-/](\d{1,2})$/);
  if (ym) return utcDate(+ym[1], +ym[2] - 1, 1);
  const d = parseDate(s);
  if (!d) return null;
  return utcDate(d.getUTCFullYear(), d.getUTCMonth(), 1);
}

export function parseBool(raw: string, defaultValue = true): boolean {
  if (raw == null || raw.trim() === "") return defaultValue;
  return /^(true|yes|y|1|active|paid)$/i.test(raw.trim());
}

export function parseString(raw: string): string | null {
  const v = (raw ?? "").trim();
  return v === "" ? null : v;
}

function utcDate(y: number, m0: number, d: number): Date {
  return new Date(Date.UTC(y, m0, d));
}

export function normalizeCurrency(raw: string): string {
  const v = (raw || "USD").trim().toUpperCase();
  return v === "" ? "USD" : v;
}

const PAYMENT_STATUS = new Map<string, "PENDING" | "PAID" | "PARTIAL">([
  ["pending", "PENDING"],
  ["paid", "PAID"],
  ["partial", "PARTIAL"],
  ["partially paid", "PARTIAL"],
]);

export function parsePaymentStatus(raw: string): "PENDING" | "PAID" | "PARTIAL" | null {
  const key = (raw || "").trim().toLowerCase();
  if (key === "") return "PENDING";
  return PAYMENT_STATUS.get(key) ?? null;
}

const REVENUE_STATUS = new Map<string, "DRAFT" | "CONFIRMED" | "INVOICED" | "CANCELLED">([
  ["draft", "DRAFT"],
  ["confirmed", "CONFIRMED"],
  ["invoiced", "INVOICED"],
  ["cancelled", "CANCELLED"],
  ["canceled", "CANCELLED"],
]);

export function parseRevenueStatus(raw: string): "DRAFT" | "CONFIRMED" | "INVOICED" | "CANCELLED" {
  return REVENUE_STATUS.get((raw || "").trim().toLowerCase()) ?? "CONFIRMED";
}

const PAYMENT_RECORD_STATUS = new Map<string, "PENDING" | "CLEARED" | "FAILED">([
  ["pending", "PENDING"],
  ["cleared", "CLEARED"],
  ["paid", "CLEARED"],
  ["failed", "FAILED"],
]);

export function parsePaymentRecordStatus(raw: string): "PENDING" | "CLEARED" | "FAILED" {
  return PAYMENT_RECORD_STATUS.get((raw || "").trim().toLowerCase()) ?? "CLEARED";
}

// --- entity parsers ---

export interface ClientPayload {
  clientKey: string;
  name: string;
  source: string | null;
  lead: string | null;
  accountManager: string | null;
  active: boolean;
  startDate: Date | null;
  notes: string | null;
}

export function parseClient(row: MappedRow): ParseResult<ClientPayload> {
  const v = row.values;
  const errors: string[] = [];
  const clientKey = parseString(v.clientKey);
  const name = parseString(v.name);
  if (!clientKey) errors.push("Missing Client ID");
  if (!name) errors.push("Missing Client Name");
  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    errors: [],
    value: {
      clientKey: clientKey!,
      name: name!,
      source: parseString(v.source),
      lead: parseString(v.lead),
      accountManager: parseString(v.accountManager),
      active: parseBool(v.active),
      startDate: parseDate(v.startDate),
      notes: parseString(v.notes),
    },
  };
}

export interface RevenuePayload {
  revenueKey: string;
  clientKey: string;
  date: Date;
  month: Date;
  project: string | null;
  phase: string | null;
  amount: number;
  currency: string;
  status: "DRAFT" | "CONFIRMED" | "INVOICED" | "CANCELLED";
  paymentStatus: "PENDING" | "PAID" | "PARTIAL";
  receivedDate: Date | null;
  expectedDate: Date | null;
  paymentMethod: string | null;
  lead: string | null;
  developer: string | null;
  notes: string | null;
}

export function parseRevenue(row: MappedRow): ParseResult<RevenuePayload> {
  const v = row.values;
  const errors: string[] = [];
  const revenueKey = parseString(v.revenueKey);
  const clientKey = parseString(v.clientKey);
  const amount = parseDecimal(v.amount);
  const date = parseDate(v.date);
  // Month falls back to the record date when not supplied.
  const month = parseMonth(v.month) ?? (date ? new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)) : null);
  const paymentStatus = parsePaymentStatus(v.paymentStatus);

  if (!revenueKey) errors.push("Missing Revenue ID");
  if (!clientKey) errors.push("Missing Client");
  if (amount == null) errors.push("Missing or invalid Amount");
  if (!date) errors.push("Missing or invalid Date");
  if (!month) errors.push("Missing or invalid Month");
  if (paymentStatus == null) errors.push(`Invalid Payment Status: "${v.paymentStatus}"`);
  if (errors.length) return { ok: false, errors };

  return {
    ok: true,
    errors: [],
    value: {
      revenueKey: revenueKey!,
      clientKey: clientKey!,
      date: date!,
      month: month!,
      project: parseString(v.project),
      phase: parseString(v.phase),
      amount: amount!,
      currency: normalizeCurrency(v.currency),
      status: parseRevenueStatus(v.status),
      paymentStatus: paymentStatus!,
      receivedDate: parseDate(v.receivedDate),
      expectedDate: parseDate(v.expectedDate),
      paymentMethod: parseString(v.paymentMethod),
      lead: parseString(v.lead),
      developer: parseString(v.developer),
      notes: parseString(v.notes),
    },
  };
}

export interface TeamRowPayload {
  employeeKey: string;
  employee: string;
  month: Date;
  salary: number;
  overhead: number;
  currency: string;
  active: boolean;
  notes: string | null;
}

export function parseTeamRow(row: MappedRow): ParseResult<TeamRowPayload> {
  const v = row.values;
  const errors: string[] = [];
  const employeeKey = parseString(v.employeeKey);
  const employee = parseString(v.employee);
  const month = parseMonth(v.month);
  const salary = parseDecimal(v.salary) ?? 0;
  const overhead = parseDecimal(v.overhead) ?? 0;

  if (!employeeKey) errors.push("Missing Employee ID");
  if (!employee) errors.push("Missing Employee");
  if (!month) errors.push("Missing or invalid Month");
  if (salary <= 0 && overhead <= 0) errors.push("Employee has no salary or overhead");
  if (errors.length) return { ok: false, errors };

  return {
    ok: true,
    errors: [],
    value: {
      employeeKey: employeeKey!,
      employee: employee!,
      month: month!,
      salary,
      overhead,
      currency: normalizeCurrency(v.currency),
      active: parseBool(v.active),
      notes: parseString(v.notes),
    },
  };
}

export interface SubscriptionPayload {
  subscriptionKey: string;
  name: string;
  owner: string | null;
  category: string | null;
  monthlyCost: number;
  currency: string;
  startDate: Date | null;
  renewalDate: Date | null;
  active: boolean;
  notes: string | null;
}

export function parseSubscription(row: MappedRow): ParseResult<SubscriptionPayload> {
  const v = row.values;
  const errors: string[] = [];
  const subscriptionKey = parseString(v.subscriptionKey);
  const name = parseString(v.name);
  const monthlyCost = parseDecimal(v.monthlyCost);

  if (!subscriptionKey) errors.push("Missing Subscription ID");
  if (!name) errors.push("Missing Subscription");
  if (monthlyCost == null) errors.push("Missing or invalid Monthly Cost");
  if (errors.length) return { ok: false, errors };

  return {
    ok: true,
    errors: [],
    value: {
      subscriptionKey: subscriptionKey!,
      name: name!,
      owner: parseString(v.owner),
      category: parseString(v.category),
      monthlyCost: monthlyCost!,
      currency: normalizeCurrency(v.currency),
      startDate: parseDate(v.startDate),
      renewalDate: parseDate(v.renewalDate),
      active: parseBool(v.active),
      notes: parseString(v.notes),
    },
  };
}

export interface ExpensePayload {
  expenseKey: string;
  date: Date;
  month: Date;
  category: string | null;
  description: string | null;
  amount: number;
  currency: string;
  paid: boolean;
  notes: string | null;
}

export function parseExpense(row: MappedRow): ParseResult<ExpensePayload> {
  const v = row.values;
  const errors: string[] = [];
  const expenseKey = parseString(v.expenseKey);
  const amount = parseDecimal(v.amount);
  const date = parseDate(v.date);
  const month = date ? new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)) : null;

  if (!expenseKey) errors.push("Missing Expense ID");
  if (amount == null) errors.push("Missing or invalid Amount");
  if (!date) errors.push("Missing or invalid Date");
  if (errors.length) return { ok: false, errors };

  return {
    ok: true,
    errors: [],
    value: {
      expenseKey: expenseKey!,
      date: date!,
      month: month!,
      category: parseString(v.category),
      description: parseString(v.description),
      amount: amount!,
      currency: normalizeCurrency(v.currency),
      paid: parseBool(v.paid),
      notes: parseString(v.notes),
    },
  };
}

export interface PaymentPayload {
  paymentKey: string;
  clientKey: string;
  revenueKey: string | null;
  date: Date;
  amount: number;
  currency: string;
  method: string | null;
  status: "PENDING" | "CLEARED" | "FAILED";
  notes: string | null;
}

export function parsePayment(row: MappedRow): ParseResult<PaymentPayload> {
  const v = row.values;
  const errors: string[] = [];
  const paymentKey = parseString(v.paymentKey);
  const clientKey = parseString(v.clientKey);
  const amount = parseDecimal(v.amount);
  const date = parseDate(v.date);

  if (!paymentKey) errors.push("Missing Payment ID");
  if (!clientKey) errors.push("Missing Client");
  if (amount == null) errors.push("Missing or invalid Amount");
  if (!date) errors.push("Missing or invalid Date");
  if (errors.length) return { ok: false, errors };

  return {
    ok: true,
    errors: [],
    value: {
      paymentKey: paymentKey!,
      clientKey: clientKey!,
      revenueKey: parseString(v.revenueKey),
      date: date!,
      amount: amount!,
      currency: normalizeCurrency(v.currency),
      method: parseString(v.method),
      status: parsePaymentRecordStatus(v.status),
      notes: parseString(v.notes),
    },
  };
}

export interface ExchangeRatePayload {
  date: Date;
  currency: string;
  rateToUsd: number;
  notes: string | null;
}

export function parseExchangeRate(row: MappedRow): ParseResult<ExchangeRatePayload> {
  const v = row.values;
  const errors: string[] = [];
  const date = parseDate(v.date);
  const currency = normalizeCurrency(v.currency);
  const rateToUsd = parseDecimal(v.rateToUsd);

  if (!date) errors.push("Missing or invalid Date");
  if (rateToUsd == null || rateToUsd <= 0) errors.push("Missing or invalid Rate to USD");
  if (errors.length) return { ok: false, errors };

  return {
    ok: true,
    errors: [],
    value: { date: date!, currency, rateToUsd: rateToUsd!, notes: parseString(v.notes) },
  };
}
