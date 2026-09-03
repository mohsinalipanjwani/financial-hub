// Server-side report builders that produce downloadable CSV. All amounts are
// converted to the reporting currency via the same rate table the dashboard uses.

import { prisma } from "@/lib/prisma";
import { loadRateTable } from "@/lib/finance/rates";
import { tryConvertCurrency } from "@/lib/finance/calculations";
import { getClientPerformance, getSummary, type Filters } from "@/lib/finance/service";
import type { Period } from "@/lib/finance/period";
import { toCsv } from "./csv";

const REPORTING = process.env.DEFAULT_REPORTING_CURRENCY || "USD";
const iso = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : "");

export async function revenueCsv(period: Period, filters: Filters): Promise<string> {
  const rates = await loadRateTable(period.end);
  const rows = await prisma.revenue.findMany({
    where: {
      archived: false,
      month: { gte: period.start, lt: period.end },
      ...(filters.clientId ? { clientId: filters.clientId } : {}),
      ...(filters.source ? { client: { source: filters.source } } : {}),
    },
    include: { client: true },
    orderBy: { date: "desc" },
  });
  return toCsv(rows, [
    { key: "revenueKey", label: "Revenue ID" },
    { key: "client", label: "Client", format: (r) => r.client.name },
    { key: "project", label: "Project" },
    { key: "phase", label: "Phase" },
    { key: "date", label: "Date", format: (r) => iso(r.date) },
    { key: "amount", label: "Amount", format: (r) => Number(r.amount) },
    { key: "currency", label: "Currency" },
    { key: "converted", label: `Amount (${REPORTING})`, format: (r) => tryConvertCurrency(Number(r.amount), r.currency, REPORTING, rates) ?? "" },
    { key: "paymentStatus", label: "Payment Status" },
    { key: "receivedDate", label: "Received Date", format: (r) => iso(r.receivedDate) },
    { key: "expectedDate", label: "Expected Date", format: (r) => iso(r.expectedDate) },
  ]);
}

export async function paymentsCsv(period: Period, filters: Filters): Promise<string> {
  const rates = await loadRateTable(period.end);
  const rows = await prisma.payment.findMany({
    where: {
      archived: false,
      date: { gte: period.start, lt: period.end },
      ...(filters.clientId ? { clientId: filters.clientId } : {}),
    },
    include: { client: true, revenue: true },
    orderBy: { date: "desc" },
  });
  return toCsv(rows, [
    { key: "paymentKey", label: "Payment ID" },
    { key: "date", label: "Date", format: (r) => iso(r.date) },
    { key: "client", label: "Client", format: (r) => r.client.name },
    { key: "revenue", label: "Revenue ID", format: (r) => r.revenue?.revenueKey ?? "" },
    { key: "amount", label: "Amount", format: (r) => Number(r.amount) },
    { key: "currency", label: "Currency" },
    { key: "converted", label: `Amount (${REPORTING})`, format: (r) => tryConvertCurrency(Number(r.amount), r.currency, REPORTING, rates) ?? "" },
    { key: "method", label: "Method" },
    { key: "status", label: "Status" },
  ]);
}

export async function clientsCsv(period: Period, filters: Filters): Promise<string> {
  const rows = await getClientPerformance(period, filters);
  return toCsv(rows, [
    { key: "clientName", label: "Client" },
    { key: "revenue", label: `Revenue (${REPORTING})` },
    { key: "received", label: `Received (${REPORTING})` },
    { key: "pending", label: `Pending (${REPORTING})` },
    { key: "contribution", label: "Contribution %" },
  ]);
}

export async function pnlCsv(period: Period, filters: Filters): Promise<string> {
  const s = await getSummary(period, filters);
  const lines = [
    { line: "Revenue", amount: s.revenue },
    { line: "Team Costs", amount: -s.teamCost },
    { line: "Subscriptions", amount: -s.subscriptionCost },
    { line: "Other Expenses", amount: -s.otherExpenses },
    { line: "Total Cost", amount: -s.totalCost },
    { line: "Net Profit", amount: s.netProfit },
    { line: "Profit Margin %", amount: s.profitMargin },
    { line: "Revenue Received", amount: s.received },
    { line: "Revenue Pending", amount: s.pending },
  ];
  return toCsv(lines, [
    { key: "line", label: `P&L — ${period.label}` },
    { key: "amount", label: REPORTING },
  ]);
}

export type ReportType = "revenue" | "payments" | "clients" | "pnl";

export function reportFilename(type: ReportType, period: Period): string {
  const label = period.label.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  return `${type}-${label}.csv`;
}
