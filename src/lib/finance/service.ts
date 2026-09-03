// Aggregation service: pulls normalized rows from the database for a period,
// applies the pure calculation functions, and returns dashboard-ready data.
//
// This is the single place the UI depends on for financial numbers, so the
// calculation rules stay consistent across every page.

import { prisma } from "@/lib/prisma";
import { loadRateTable } from "./rates";
import {
  calcRevenue,
  calcReceivedFromPayments,
  calcReceivedFromRevenue,
  calcPending,
  calcTeamCost,
  calcSubscriptionCost,
  calcOtherExpenses,
  calcTotalCost,
  calcNetProfit,
  calcProfitMargin,
  percentChange,
  tryConvertCurrency,
} from "./calculations";
import type {
  RevenueLine,
  PaymentLine,
  TeamCostLine,
  SubscriptionLine,
  ExpenseLine,
  RateTable,
  FinancialSummary,
  PaymentStatus,
} from "./types";
import {
  type Period,
  previousPeriod,
  monthsInPeriod,
  eachMonth,
  formatMonthLabel,
} from "./period";
import { collectionRate, averageDaysToPay, agingBuckets } from "./analytics";

const REPORTING = process.env.DEFAULT_REPORTING_CURRENCY || "USD";

export interface Filters {
  clientId?: string;
  source?: string;
}

interface PeriodData {
  revenue: RevenueLine[];
  payments: PaymentLine[];
  teamCosts: TeamCostLine[];
  subscriptions: SubscriptionLine[];
  expenses: ExpenseLine[];
  receivedByRevenueId: Map<string, number>;
  paidRevenueIds: Set<string>;
}

async function loadPeriodData(
  period: Period,
  filters: Filters,
  rates: RateTable,
): Promise<PeriodData> {
  const clientFilter = filters.clientId ? { clientId: filters.clientId } : {};

  const [revenueRows, paymentRows, teamCostRows, subs, expenseRows] =
    await Promise.all([
      prisma.revenue.findMany({
        where: {
          archived: false,
          month: { gte: period.start, lt: period.end },
          status: { not: "CANCELLED" },
          ...clientFilter,
          ...(filters.source ? { client: { source: filters.source } } : {}),
        },
        include: { client: true },
      }),
      prisma.payment.findMany({
        where: {
          archived: false,
          status: "CLEARED",
          date: { gte: period.start, lt: period.end },
          ...clientFilter,
          ...(filters.source ? { client: { source: filters.source } } : {}),
        },
      }),
      prisma.teamCost.findMany({
        where: { archived: false, month: { gte: period.start, lt: period.end } },
        include: { teamMember: true },
      }),
      prisma.subscription.findMany({ where: { archived: false } }),
      prisma.expense.findMany({
        where: { archived: false, month: { gte: period.start, lt: period.end } },
      }),
    ]);

  const revenue: RevenueLine[] = revenueRows.map((r) => ({
    id: r.id,
    clientId: r.clientId,
    clientName: r.client.name,
    month: r.month,
    amount: Number(r.amount),
    currency: r.currency,
    paymentStatus: r.paymentStatus as PaymentStatus,
    project: r.project,
    phase: r.phase,
  }));

  const payments: PaymentLine[] = paymentRows.map((p) => ({
    id: p.id,
    clientId: p.clientId,
    revenueId: p.revenueId,
    date: p.date,
    amount: Number(p.amount),
    currency: p.currency,
  }));

  const teamCosts: TeamCostLine[] = teamCostRows.map((t) => ({
    teamMemberId: t.teamMemberId,
    employeeName: t.teamMember.name,
    month: t.month,
    salary: Number(t.salary),
    overhead: Number(t.overhead),
    currency: t.currency,
  }));

  const subscriptions: SubscriptionLine[] = subs.map((s) => ({
    id: s.id,
    name: s.name,
    category: s.category,
    owner: s.owner,
    monthlyCost: Number(s.monthlyCost),
    currency: s.currency,
    active: s.active,
  }));

  const expenses: ExpenseLine[] = expenseRows.map((e) => ({
    id: e.id,
    category: e.category,
    month: e.month,
    amount: Number(e.amount),
    currency: e.currency,
  }));

  // Cash received per revenue id (converted), from linked payment rows.
  const receivedByRevenueId = new Map<string, number>();
  const paidRevenueIds = new Set<string>();
  for (const p of payments) {
    if (!p.revenueId) continue;
    paidRevenueIds.add(p.revenueId);
    const v = tryConvertCurrency(p.amount, p.currency, REPORTING, rates) ?? 0;
    receivedByRevenueId.set(p.revenueId, (receivedByRevenueId.get(p.revenueId) ?? 0) + v);
  }

  return { revenue, payments, teamCosts, subscriptions, expenses, receivedByRevenueId, paidRevenueIds };
}

function summarize(data: PeriodData, rates: RateTable, months: number): FinancialSummary {
  const revenue = calcRevenue(data.revenue, rates, REPORTING);

  // Received = actual payments + PAID revenue lines that have no payment rows.
  const receivedFromPayments = calcReceivedFromPayments(data.payments, rates, REPORTING);
  const receivedFromRevenue = calcReceivedFromRevenue(
    data.revenue,
    rates,
    REPORTING,
    data.paidRevenueIds,
  );
  const received = Math.round((receivedFromPayments + receivedFromRevenue) * 100) / 100;

  const pending = calcPending(data.revenue, data.receivedByRevenueId, rates, REPORTING);

  const teamCost = calcTeamCost(data.teamCosts, rates, REPORTING);
  const subscriptionCost = calcSubscriptionCost(data.subscriptions, rates, REPORTING, months);
  const otherExpenses = calcOtherExpenses(data.expenses, rates, REPORTING);
  const totalCost = calcTotalCost(teamCost, subscriptionCost, otherExpenses);
  const netProfit = calcNetProfit(revenue, totalCost);
  const profitMargin = calcProfitMargin(netProfit, revenue);

  return { revenue, received, pending, teamCost, subscriptionCost, otherExpenses, totalCost, netProfit, profitMargin };
}

export interface SummaryWithComparison extends FinancialSummary {
  reportingCurrency: string;
  previous: FinancialSummary;
  changes: Record<keyof FinancialSummary, number | null>;
}

export async function getSummary(
  period: Period,
  filters: Filters = {},
): Promise<SummaryWithComparison> {
  const rates = await loadRateTable(period.end);
  const months = monthsInPeriod(period) || 1;

  const [current, prev] = await Promise.all([
    loadPeriodData(period, filters, rates),
    loadPeriodData(previousPeriod(period), filters, rates),
  ]);

  const cur = summarize(current, rates, months);
  const previous = summarize(prev, rates, months);

  const changes = {} as Record<keyof FinancialSummary, number | null>;
  (Object.keys(cur) as (keyof FinancialSummary)[]).forEach((k) => {
    changes[k] = percentChange(cur[k], previous[k]);
  });

  return { ...cur, previous, changes, reportingCurrency: REPORTING };
}

export interface MonthlyPoint {
  month: string;
  revenue: number;
  totalCost: number;
  netProfit: number;
}

/** Monthly revenue / cost / profit series for charts. */
export async function getMonthlyTrend(
  period: Period,
  filters: Filters = {},
): Promise<MonthlyPoint[]> {
  const rates = await loadRateTable(period.end);
  const months = eachMonth(period);
  const points: MonthlyPoint[] = [];

  for (const m of months) {
    const mp: Period = {
      type: "month",
      start: m,
      end: new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 1)),
      label: formatMonthLabel(m),
    };
    const data = await loadPeriodData(mp, filters, rates);
    const s = summarize(data, rates, 1);
    points.push({
      month: formatMonthLabel(m),
      revenue: s.revenue,
      totalCost: s.totalCost,
      netProfit: s.netProfit,
    });
  }
  return points;
}

export interface ClientPerformanceRow {
  clientId: string;
  clientName: string;
  revenue: number;
  received: number;
  pending: number;
  contribution: number; // percentage of total revenue
}

export async function getClientPerformance(
  period: Period,
  filters: Filters = {},
): Promise<ClientPerformanceRow[]> {
  const rates = await loadRateTable(period.end);
  const data = await loadPeriodData(period, filters, rates);

  const byClient = new Map<string, { name: string; lines: RevenueLine[] }>();
  for (const l of data.revenue) {
    if (!byClient.has(l.clientId)) byClient.set(l.clientId, { name: l.clientName, lines: [] });
    byClient.get(l.clientId)!.lines.push(l);
  }

  const totalRevenue = calcRevenue(data.revenue, rates, REPORTING);

  const rows: ClientPerformanceRow[] = [];
  for (const [clientId, { name, lines }] of byClient) {
    const revenue = calcRevenue(lines, rates, REPORTING);
    const clientPayments = data.payments.filter((p) => p.clientId === clientId);
    const receivedFromPayments = calcReceivedFromPayments(clientPayments, rates, REPORTING);
    const receivedFromRevenue = calcReceivedFromRevenue(lines, rates, REPORTING, data.paidRevenueIds);
    const received = Math.round((receivedFromPayments + receivedFromRevenue) * 100) / 100;
    const pending = calcPending(lines, data.receivedByRevenueId, rates, REPORTING);
    const contribution = totalRevenue === 0 ? 0 : Math.round((revenue / totalRevenue) * 1000) / 10;
    rows.push({ clientId, clientName: name, revenue, received, pending, contribution });
  }

  return rows.sort((a, b) => b.revenue - a.revenue);
}

export interface ClientDetail {
  reportingCurrency: string;
  client: { id: string; name: string; source: string | null; lead: string | null; accountManager: string | null; active: boolean };
  totalRevenue: number;
  received: number;
  pending: number;
  projectCount: number;
  contribution: number;
  collectionRate: number;
  avgDaysToPay: number | null;
  aging: import("./analytics").AgingBuckets;
  monthlyTrend: { month: string; revenue: number }[];
  revenueByPhase: { name: string; value: number }[];
  projects: { name: string; revenue: number }[];
  payments: { id: string; date: Date; amount: number; currency: string; method: string | null; converted: number }[];
  pendingItems: { revenueKey: string; project: string | null; expected: number; pending: number; expectedDate: Date | null }[];
}

export async function getClientDetail(clientId: string): Promise<ClientDetail | null> {
  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client) return null;

  const rates = await loadRateTable(new Date());

  const [revenueRows, paymentRows, allRevenue] = await Promise.all([
    prisma.revenue.findMany({ where: { clientId, archived: false, status: { not: "CANCELLED" } }, orderBy: { month: "asc" } }),
    prisma.payment.findMany({ where: { clientId, archived: false, status: "CLEARED" }, orderBy: { date: "desc" } }),
    prisma.revenue.findMany({ where: { archived: false, status: { not: "CANCELLED" } } }),
  ]);

  const lines: RevenueLine[] = revenueRows.map((r) => ({
    id: r.id,
    clientId: r.clientId,
    clientName: client.name,
    month: r.month,
    amount: Number(r.amount),
    currency: r.currency,
    paymentStatus: r.paymentStatus as PaymentStatus,
    project: r.project,
    phase: r.phase,
  }));

  const receivedByRevenueId = new Map<string, number>();
  const paidRevenueIds = new Set<string>();
  for (const p of paymentRows) {
    if (!p.revenueId) continue;
    paidRevenueIds.add(p.revenueId);
    const v = tryConvertCurrency(Number(p.amount), p.currency, REPORTING, rates) ?? 0;
    receivedByRevenueId.set(p.revenueId, (receivedByRevenueId.get(p.revenueId) ?? 0) + v);
  }

  const totalRevenue = calcRevenue(lines, rates, REPORTING);
  const paymentsConverted = paymentRows.map((p) => tryConvertCurrency(Number(p.amount), p.currency, REPORTING, rates) ?? 0);
  const receivedFromPayments = Math.round(paymentsConverted.reduce((a, b) => a + b, 0) * 100) / 100;
  const receivedFromRevenue = calcReceivedFromRevenue(lines, rates, REPORTING, paidRevenueIds);
  const received = Math.round((receivedFromPayments + receivedFromRevenue) * 100) / 100;
  const pending = calcPending(lines, receivedByRevenueId, rates, REPORTING);

  const grandTotal = calcRevenue(
    allRevenue.map((r) => ({ id: r.id, clientId: r.clientId, clientName: "", month: r.month, amount: Number(r.amount), currency: r.currency, paymentStatus: r.paymentStatus as PaymentStatus })),
    rates,
    REPORTING,
  );
  const contribution = grandTotal === 0 ? 0 : Math.round((totalRevenue / grandTotal) * 1000) / 10;

  // Monthly trend
  const monthMap = new Map<string, number>();
  for (const r of revenueRows) {
    const key = formatMonthLabel(r.month);
    const v = tryConvertCurrency(Number(r.amount), r.currency, REPORTING, rates) ?? 0;
    monthMap.set(key, (monthMap.get(key) ?? 0) + v);
  }
  const monthlyTrend = [...monthMap.entries()].map(([month, revenue]) => ({ month, revenue: Math.round(revenue * 100) / 100 }));

  // Revenue by phase & project
  const phaseMap = new Map<string, number>();
  const projectMap = new Map<string, number>();
  for (const r of revenueRows) {
    const v = tryConvertCurrency(Number(r.amount), r.currency, REPORTING, rates) ?? 0;
    const phase = r.phase || "Unspecified";
    const project = r.project || "Unspecified";
    phaseMap.set(phase, (phaseMap.get(phase) ?? 0) + v);
    projectMap.set(project, (projectMap.get(project) ?? 0) + v);
  }
  const revenueByPhase = [...phaseMap.entries()].map(([name, value]) => ({ name, value: Math.round(value * 100) / 100 }));
  const projects = [...projectMap.entries()].map(([name, revenue]) => ({ name, revenue: Math.round(revenue * 100) / 100 })).sort((a, b) => b.revenue - a.revenue);

  const payments = paymentRows.map((p, i) => ({
    id: p.id,
    date: p.date,
    amount: Number(p.amount),
    currency: p.currency,
    method: p.method,
    converted: paymentsConverted[i],
  }));

  const pendingItems = revenueRows
    .map((r) => {
      const expected = tryConvertCurrency(Number(r.amount), r.currency, REPORTING, rates) ?? 0;
      let recvd = receivedByRevenueId.get(r.id) ?? 0;
      if (recvd === 0 && r.paymentStatus === "PAID") recvd = expected;
      const pend = Math.max(0, expected - recvd);
      return { revenueKey: r.revenueKey, project: r.project, expected, pending: pend, expectedDate: r.expectedDate };
    })
    .filter((x) => x.pending > 0);

  const aging = agingBuckets(
    pendingItems.map((p) => ({ pending: p.pending, expectedDate: p.expectedDate })),
  );
  const avgDaysToPay = averageDaysToPay(
    revenueRows
      .filter((r) => r.paymentStatus === "PAID")
      .map((r) => ({ expectedDate: r.expectedDate, receivedDate: r.receivedDate })),
  );

  return {
    reportingCurrency: REPORTING,
    client: { id: client.id, name: client.name, source: client.source, lead: client.lead, accountManager: client.accountManager, active: client.active },
    totalRevenue,
    received,
    pending,
    projectCount: projects.length,
    contribution,
    collectionRate: collectionRate(received, totalRevenue),
    avgDaysToPay,
    aging,
    monthlyTrend,
    revenueByPhase,
    projects,
    payments,
    pendingItems,
  };
}

export interface ExpenseBreakdown {
  team: number;
  subscriptions: number;
  otherExpenses: number;
}

export async function getExpenseBreakdown(
  period: Period,
  filters: Filters = {},
): Promise<ExpenseBreakdown> {
  const s = await getSummary(period, filters);
  return { team: s.teamCost, subscriptions: s.subscriptionCost, otherExpenses: s.otherExpenses };
}
