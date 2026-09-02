// Data-quality scanning. Because multiple people edit the Google Sheet, we
// scan the normalized records for problems and surface them on the dashboard.
//
// This runs read-only over the DB and returns issues; it can also persist them
// to the data_quality_issues table (used after a sync).

import { prisma } from "@/lib/prisma";
import { loadRateTable } from "./rates";
import {
  validateRevenueRow,
  validateSubscriptionRow,
  validateTeamCostRow,
  findDuplicates,
} from "./data-quality-rules";

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
    const base = { entityType: "revenue", sourceSheet: r.sourceSheet, sourceRow: r.sourceRow, entityKey: r.revenueKey };
    for (const issue of validateRevenueRow(
      {
        revenueKey: r.revenueKey,
        clientId: r.clientId,
        amount: r.amount == null ? null : Number(r.amount),
        hasDate: !!r.date,
        currency: r.currency,
        paymentStatus: r.paymentStatus,
        hasReceivedDate: !!r.receivedDate,
      },
      knownCurrencies,
    )) {
      issues.push({ ...base, ...issue });
    }
  }

  // --- Duplicate Revenue IDs (defensive; DB enforces unique, sync may collide) ---
  findDuplicates(revenue.map((r) => r.revenueKey)).forEach((key) =>
    issues.push({ entityType: "revenue", code: "DUPLICATE_REVENUE_ID", severity: "ERROR", message: `Duplicate Revenue ID: ${key}`, entityKey: key, sourceSheet: "Revenue", sourceRow: null }),
  );

  // --- Client checks ---
  for (const c of clients) {
    if (!c.name) {
      issues.push({ entityType: "client", code: "MISSING_CLIENT_NAME", severity: "ERROR", message: `Client ${c.clientKey} has no name`, entityKey: c.clientKey, sourceSheet: c.sourceSheet, sourceRow: c.sourceRow });
    }
  }
  findDuplicates(clients.map((c) => c.clientKey)).forEach((key) =>
    issues.push({ entityType: "client", code: "DUPLICATE_CLIENT_ID", severity: "ERROR", message: `Duplicate Client ID: ${key}`, entityKey: key, sourceSheet: "Clients", sourceRow: null }),
  );

  // --- Subscription checks ---
  for (const s of subscriptions) {
    const base = { entityType: "subscription", entityKey: s.subscriptionKey, sourceSheet: s.sourceSheet, sourceRow: s.sourceRow };
    for (const issue of validateSubscriptionRow(
      { name: s.name, monthlyCost: s.monthlyCost == null ? null : Number(s.monthlyCost), currency: s.currency },
      knownCurrencies,
    )) {
      issues.push({ ...base, ...issue });
    }
  }

  // --- Team cost checks ---
  for (const t of teamCosts) {
    const base = { entityType: "team_cost", entityKey: t.costKey, sourceSheet: t.sourceSheet, sourceRow: t.sourceRow };
    for (const issue of validateTeamCostRow(
      {
        costKey: t.costKey,
        salary: t.salary == null ? null : Number(t.salary),
        overhead: t.overhead == null ? null : Number(t.overhead),
        currency: t.currency,
      },
      knownCurrencies,
    )) {
      issues.push({ ...base, ...issue });
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
