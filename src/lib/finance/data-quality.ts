// Data-quality scanning. Because multiple people edit the Google Sheet, we
// scan the normalized records for problems and surface them on the dashboard.
//
// This runs read-only over the DB and returns issues; it can also persist them
// to the data_quality_issues table (used after a sync).

import { prisma } from "@/lib/prisma";
import { loadRateTable } from "./rates";

export interface QualityIssue {
  entityType: string;
  entityKey: string | null;
  code: string;
  severity: "INFO" | "WARNING" | "ERROR";
  message: string;
  sourceSheet: string | null;
  sourceRow: number | null;
}

export async function scanDataQuality(): Promise<QualityIssue[]> {
  const issues: QualityIssue[] = [];
  const rates = await loadRateTable(new Date());
  const knownCurrencies = new Set(Object.keys(rates)); // includes USD

  const [revenue, clients, subscriptions, teamCosts, payments] = await Promise.all([
    prisma.revenue.findMany({ where: { archived: false }, include: { client: true } }),
    prisma.client.findMany({ where: { archived: false } }),
    prisma.subscription.findMany({ where: { archived: false } }),
    prisma.teamCost.findMany({ where: { archived: false } }),
    prisma.payment.findMany({ where: { archived: false } }),
  ]);

  // --- Revenue checks ---
  for (const r of revenue) {
    const base = { sourceSheet: r.sourceSheet, sourceRow: r.sourceRow, entityKey: r.revenueKey };
    if (!r.clientId) {
      issues.push({ entityType: "revenue", code: "MISSING_CLIENT", severity: "ERROR", message: `Revenue ${r.revenueKey} has no client`, ...base });
    }
    if (r.amount == null || Number(r.amount) <= 0) {
      issues.push({ entityType: "revenue", code: "MISSING_AMOUNT", severity: "ERROR", message: `Revenue ${r.revenueKey} has a missing or non-positive amount`, ...base });
    }
    if (!r.date) {
      issues.push({ entityType: "revenue", code: "MISSING_DATE", severity: "ERROR", message: `Revenue ${r.revenueKey} has no date`, ...base });
    }
    if (!knownCurrencies.has(r.currency)) {
      issues.push({ entityType: "revenue", code: "UNKNOWN_CURRENCY", severity: "ERROR", message: `Revenue ${r.revenueKey} uses currency ${r.currency} with no exchange rate`, ...base });
    }
    if (r.paymentStatus === "PAID" && !r.receivedDate) {
      issues.push({ entityType: "revenue", code: "PAID_NO_RECEIVED_DATE", severity: "WARNING", message: `Revenue ${r.revenueKey} is marked Paid but has no received date`, ...base });
    }
    if (!["PENDING", "PAID", "PARTIAL"].includes(r.paymentStatus)) {
      issues.push({ entityType: "revenue", code: "INVALID_PAYMENT_STATUS", severity: "ERROR", message: `Revenue ${r.revenueKey} has an invalid payment status`, ...base });
    }
  }

  // --- Duplicate Revenue IDs (defensive; DB enforces unique, sync may collide) ---
  countDuplicates(revenue.map((r) => r.revenueKey)).forEach((key) =>
    issues.push({ entityType: "revenue", code: "DUPLICATE_REVENUE_ID", severity: "ERROR", message: `Duplicate Revenue ID: ${key}`, entityKey: key, sourceSheet: "Revenue", sourceRow: null }),
  );

  // --- Client checks ---
  for (const c of clients) {
    if (!c.name) {
      issues.push({ entityType: "client", code: "MISSING_CLIENT_NAME", severity: "ERROR", message: `Client ${c.clientKey} has no name`, entityKey: c.clientKey, sourceSheet: c.sourceSheet, sourceRow: c.sourceRow });
    }
  }
  countDuplicates(clients.map((c) => c.clientKey)).forEach((key) =>
    issues.push({ entityType: "client", code: "DUPLICATE_CLIENT_ID", severity: "ERROR", message: `Duplicate Client ID: ${key}`, entityKey: key, sourceSheet: "Clients", sourceRow: null }),
  );

  // --- Subscription checks ---
  for (const s of subscriptions) {
    if (s.monthlyCost == null || Number(s.monthlyCost) <= 0) {
      issues.push({ entityType: "subscription", code: "SUBSCRIPTION_MISSING_COST", severity: "WARNING", message: `Subscription ${s.name} has no monthly cost`, entityKey: s.subscriptionKey, sourceSheet: s.sourceSheet, sourceRow: s.sourceRow });
    }
    if (!knownCurrencies.has(s.currency)) {
      issues.push({ entityType: "subscription", code: "UNKNOWN_CURRENCY", severity: "ERROR", message: `Subscription ${s.name} uses currency ${s.currency} with no exchange rate`, entityKey: s.subscriptionKey, sourceSheet: s.sourceSheet, sourceRow: s.sourceRow });
    }
  }

  // --- Team cost checks ---
  for (const t of teamCosts) {
    if ((t.salary == null || Number(t.salary) <= 0) && (t.overhead == null || Number(t.overhead) <= 0)) {
      issues.push({ entityType: "team_cost", code: "EMPLOYEE_MISSING_COST", severity: "WARNING", message: `Team cost ${t.costKey} has no salary or overhead`, entityKey: t.costKey, sourceSheet: t.sourceSheet, sourceRow: t.sourceRow });
    }
    if (!knownCurrencies.has(t.currency)) {
      issues.push({ entityType: "team_cost", code: "UNKNOWN_CURRENCY", severity: "ERROR", message: `Team cost ${t.costKey} uses currency ${t.currency} with no exchange rate`, entityKey: t.costKey, sourceSheet: t.sourceSheet, sourceRow: t.sourceRow });
    }
  }

  // --- Payment checks ---
  for (const p of payments) {
    if (!knownCurrencies.has(p.currency)) {
      issues.push({ entityType: "payment", code: "UNKNOWN_CURRENCY", severity: "ERROR", message: `Payment ${p.paymentKey} uses currency ${p.currency} with no exchange rate`, entityKey: p.paymentKey, sourceSheet: p.sourceSheet, sourceRow: p.sourceRow });
    }
  }

  return issues;
}

function countDuplicates(keys: (string | null)[]): string[] {
  const counts = new Map<string, number>();
  for (const k of keys) {
    if (!k) continue;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return [...counts.entries()].filter(([, n]) => n > 1).map(([k]) => k);
}

/** Persist the current scan results (replaces the open set). */
export async function persistDataQuality(): Promise<number> {
  const issues = await scanDataQuality();
  await prisma.dataQualityIssue.deleteMany({ where: { status: "OPEN" } });
  if (issues.length > 0) {
    await prisma.dataQualityIssue.createMany({
      data: issues.map((i) => ({
        entityType: i.entityType,
        entityKey: i.entityKey,
        code: i.code,
        severity: i.severity,
        message: i.message,
        sourceSheet: i.sourceSheet,
        sourceRow: i.sourceRow,
      })),
    });
  }
  return issues.length;
}
