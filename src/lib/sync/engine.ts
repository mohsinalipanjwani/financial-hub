// Sync engine: SheetSource -> validate -> normalize -> database.
//
// Idempotent: every record is keyed by a stable business key and UPSERTED, so
// syncing the same sheet twice never creates duplicates. Records previously
// synced from Google that disappear from the sheet are soft-archived, never
// hard-deleted. Each run is recorded in sync_runs, and data-quality is refreshed.

import { prisma } from "@/lib/prisma";
import type { SheetSource } from "@/lib/google/sheets";
import { DEFAULT_MAPPINGS, TAB_NAMES, mapTable, type FieldMap } from "./mapping";
import {
  parseClient,
  parseRevenue,
  parseTeamRow,
  parseSubscription,
  parseExpense,
  parsePayment,
  parseExchangeRate,
} from "./parsers";
import { persistDataQuality } from "@/lib/finance/data-quality";

export interface SyncResult {
  syncRunId: string;
  status: "SUCCESS" | "PARTIAL" | "FAILED";
  rowsRead: number;
  rowsCreated: number;
  rowsUpdated: number;
  rowsRejected: number;
  errorCount: number;
  rejects: { entity: string; sourceRow: number; errors: string[] }[];
}

interface Stats {
  read: number;
  created: number;
  updated: number;
  rejected: number;
  rejects: { entity: string; sourceRow: number; errors: string[] }[];
}

export async function runSync(
  source: SheetSource,
  opts: {
    spreadsheetId?: string;
    mappings?: Record<string, FieldMap>;
    /** Tag written to source_system (default "google"). Use "import" for manual CSV imports. */
    source?: string;
    /** Archive records of this source that vanish from the sheet (default true). Off for partial imports. */
    archiveMissing?: boolean;
  } = {},
): Promise<SyncResult> {
  const mappings = opts.mappings ?? DEFAULT_MAPPINGS;
  const SOURCE = opts.source ?? "google";
  const doArchive = opts.archiveMissing ?? true;
  const run = await prisma.syncRun.create({ data: { status: "RUNNING" } });
  const stats: Stats = { read: 0, created: 0, updated: 0, rejected: 0, rejects: [] };

  try {
    const tabs = await source.readTabs(Object.values(TAB_NAMES));
    const now = new Date();

    // --- Exchange rates (no FK deps) ---
    for (const row of mapTable(tabs[TAB_NAMES.exchangeRates], mappings.exchangeRates)) {
      stats.read++;
      const res = parseExchangeRate(row);
      if (!res.ok) { reject(stats, "exchange_rate", row.sourceRow, res.errors); continue; }
      const r = res.value!;
      const existing = await prisma.exchangeRate.findUnique({
        where: { currency_date: { currency: r.currency, date: r.date } },
      });
      await prisma.exchangeRate.upsert({
        where: { currency_date: { currency: r.currency, date: r.date } },
        create: { currency: r.currency, date: r.date, rateToUsd: r.rateToUsd, notes: r.notes },
        update: { rateToUsd: r.rateToUsd, notes: r.notes },
      });
      existing ? stats.updated++ : stats.created++;
    }

    // --- Clients ---
    const clientKeys = new Set<string>();
    for (const row of mapTable(tabs[TAB_NAMES.clients], mappings.clients)) {
      stats.read++;
      const res = parseClient(row);
      if (!res.ok) { reject(stats, "client", row.sourceRow, res.errors); continue; }
      const c = res.value!;
      clientKeys.add(c.clientKey);
      await upsertCounting(stats, prisma.client.findUnique({ where: { clientKey: c.clientKey } }), () =>
        prisma.client.upsert({
          where: { clientKey: c.clientKey },
          create: { ...c, source_system: SOURCE, sourceSheet: TAB_NAMES.clients, sourceRow: row.sourceRow, lastSyncedAt: now, archived: false },
          update: { ...c, source_system: SOURCE, sourceSheet: TAB_NAMES.clients, sourceRow: row.sourceRow, lastSyncedAt: now, archived: false },
        }),
      );
    }
    await archiveMissing("client", clientKeys, (keys) =>
      prisma.client.updateMany({ where: { source_system: SOURCE, archived: false, clientKey: { notIn: keys } }, data: { archived: true } }),
      doArchive && clientKeys.size > 0,
    );

    const clientIdByKey = await keyMap(prisma.client.findMany({ select: { id: true, clientKey: true } }), "clientKey");

    // --- Team (members + monthly costs) ---
    const employeeKeys = new Set<string>();
    const costKeys = new Set<string>();
    for (const row of mapTable(tabs[TAB_NAMES.team], mappings.team)) {
      stats.read++;
      const res = parseTeamRow(row);
      if (!res.ok) { reject(stats, "team", row.sourceRow, res.errors); continue; }
      const t = res.value!;
      employeeKeys.add(t.employeeKey);
      await prisma.teamMember.upsert({
        where: { employeeKey: t.employeeKey },
        create: { employeeKey: t.employeeKey, name: t.employee, active: t.active, notes: t.notes, source_system: SOURCE, sourceSheet: TAB_NAMES.team, sourceRow: row.sourceRow, lastSyncedAt: now, archived: false },
        update: { name: t.employee, active: t.active, notes: t.notes, source_system: SOURCE, sourceSheet: TAB_NAMES.team, sourceRow: row.sourceRow, lastSyncedAt: now, archived: false },
      });
      const member = await prisma.teamMember.findUnique({ where: { employeeKey: t.employeeKey }, select: { id: true } });
      const costKey = `${t.employeeKey}-${monthKey(t.month)}`;
      costKeys.add(costKey);
      await upsertCounting(stats, prisma.teamCost.findUnique({ where: { costKey } }), () =>
        prisma.teamCost.upsert({
          where: { costKey },
          create: { costKey, month: t.month, salary: t.salary, overhead: t.overhead, currency: t.currency, teamMemberId: member!.id, source_system: SOURCE, sourceSheet: TAB_NAMES.team, sourceRow: row.sourceRow, lastSyncedAt: now, archived: false },
          update: { month: t.month, salary: t.salary, overhead: t.overhead, currency: t.currency, source_system: SOURCE, lastSyncedAt: now, archived: false },
        }),
      );
    }
    await archiveMissing("team_cost", costKeys, (keys) =>
      prisma.teamCost.updateMany({ where: { source_system: SOURCE, archived: false, costKey: { notIn: keys } }, data: { archived: true } }),
      doArchive && costKeys.size > 0,
    );

    // --- Subscriptions ---
    const subKeys = new Set<string>();
    for (const row of mapTable(tabs[TAB_NAMES.subscriptions], mappings.subscriptions)) {
      stats.read++;
      const res = parseSubscription(row);
      if (!res.ok) { reject(stats, "subscription", row.sourceRow, res.errors); continue; }
      const s = res.value!;
      subKeys.add(s.subscriptionKey);
      await upsertCounting(stats, prisma.subscription.findUnique({ where: { subscriptionKey: s.subscriptionKey } }), () =>
        prisma.subscription.upsert({
          where: { subscriptionKey: s.subscriptionKey },
          create: { ...s, source_system: SOURCE, sourceSheet: TAB_NAMES.subscriptions, sourceRow: row.sourceRow, lastSyncedAt: now, archived: false },
          update: { ...s, source_system: SOURCE, sourceSheet: TAB_NAMES.subscriptions, sourceRow: row.sourceRow, lastSyncedAt: now, archived: false },
        }),
      );
    }
    await archiveMissing("subscription", subKeys, (keys) =>
      prisma.subscription.updateMany({ where: { source_system: SOURCE, archived: false, subscriptionKey: { notIn: keys } }, data: { archived: true } }),
      doArchive && subKeys.size > 0,
    );

    // --- Expenses ---
    const expenseKeys = new Set<string>();
    for (const row of mapTable(tabs[TAB_NAMES.expenses], mappings.expenses)) {
      stats.read++;
      const res = parseExpense(row);
      if (!res.ok) { reject(stats, "expense", row.sourceRow, res.errors); continue; }
      const e = res.value!;
      expenseKeys.add(e.expenseKey);
      await upsertCounting(stats, prisma.expense.findUnique({ where: { expenseKey: e.expenseKey } }), () =>
        prisma.expense.upsert({
          where: { expenseKey: e.expenseKey },
          create: { ...e, source_system: SOURCE, sourceSheet: TAB_NAMES.expenses, sourceRow: row.sourceRow, lastSyncedAt: now, archived: false },
          update: { ...e, source_system: SOURCE, sourceSheet: TAB_NAMES.expenses, sourceRow: row.sourceRow, lastSyncedAt: now, archived: false },
        }),
      );
    }
    await archiveMissing("expense", expenseKeys, (keys) =>
      prisma.expense.updateMany({ where: { source_system: SOURCE, archived: false, expenseKey: { notIn: keys } }, data: { archived: true } }),
      doArchive && expenseKeys.size > 0,
    );

    // --- Revenue (needs client FK) ---
    const revenueKeys = new Set<string>();
    for (const row of mapTable(tabs[TAB_NAMES.revenue], mappings.revenue)) {
      stats.read++;
      const res = parseRevenue(row);
      if (!res.ok) { reject(stats, "revenue", row.sourceRow, res.errors); continue; }
      const r = res.value!;
      const clientId = clientIdByKey.get(r.clientKey);
      if (!clientId) { reject(stats, "revenue", row.sourceRow, [`Unknown client "${r.clientKey}"`]); continue; }
      revenueKeys.add(r.revenueKey);
      const { clientKey, ...data } = r;
      void clientKey;
      await upsertCounting(stats, prisma.revenue.findUnique({ where: { revenueKey: r.revenueKey } }), () =>
        prisma.revenue.upsert({
          where: { revenueKey: r.revenueKey },
          create: { ...data, clientId, source_system: SOURCE, sourceSheet: TAB_NAMES.revenue, sourceRow: row.sourceRow, lastSyncedAt: now, archived: false },
          update: { ...data, clientId, source_system: SOURCE, sourceSheet: TAB_NAMES.revenue, sourceRow: row.sourceRow, lastSyncedAt: now, archived: false },
        }),
      );
    }
    await archiveMissing("revenue", revenueKeys, (keys) =>
      prisma.revenue.updateMany({ where: { source_system: SOURCE, archived: false, revenueKey: { notIn: keys } }, data: { archived: true } }),
      doArchive && revenueKeys.size > 0,
    );

    const revenueIdByKey = await keyMap(prisma.revenue.findMany({ select: { id: true, revenueKey: true } }), "revenueKey");

    // --- Payments (needs client + optional revenue FK) ---
    const paymentKeys = new Set<string>();
    for (const row of mapTable(tabs[TAB_NAMES.payments], mappings.payments)) {
      stats.read++;
      const res = parsePayment(row);
      if (!res.ok) { reject(stats, "payment", row.sourceRow, res.errors); continue; }
      const p = res.value!;
      const clientId = clientIdByKey.get(p.clientKey);
      if (!clientId) { reject(stats, "payment", row.sourceRow, [`Unknown client "${p.clientKey}"`]); continue; }
      const revenueId = p.revenueKey ? revenueIdByKey.get(p.revenueKey) ?? null : null;
      paymentKeys.add(p.paymentKey);
      await upsertCounting(stats, prisma.payment.findUnique({ where: { paymentKey: p.paymentKey } }), () =>
        prisma.payment.upsert({
          where: { paymentKey: p.paymentKey },
          create: { paymentKey: p.paymentKey, date: p.date, amount: p.amount, currency: p.currency, method: p.method, status: p.status, notes: p.notes, clientId, revenueId, source_system: SOURCE, sourceSheet: TAB_NAMES.payments, sourceRow: row.sourceRow, lastSyncedAt: now, archived: false },
          update: { date: p.date, amount: p.amount, currency: p.currency, method: p.method, status: p.status, notes: p.notes, clientId, revenueId, source_system: SOURCE, sourceSheet: TAB_NAMES.payments, sourceRow: row.sourceRow, lastSyncedAt: now, archived: false },
        }),
      );
    }
    await archiveMissing("payment", paymentKeys, (keys) =>
      prisma.payment.updateMany({ where: { source_system: SOURCE, archived: false, paymentKey: { notIn: keys } }, data: { archived: true } }),
      doArchive && paymentKeys.size > 0,
    );

    // Refresh data-quality snapshot.
    await persistDataQuality().catch(() => {});

    const status: SyncResult["status"] = stats.rejected > 0 ? "PARTIAL" : "SUCCESS";
    await prisma.syncRun.update({
      where: { id: run.id },
      data: {
        finishedAt: new Date(),
        status,
        rowsRead: stats.read,
        rowsCreated: stats.created,
        rowsUpdated: stats.updated,
        rowsRejected: stats.rejected,
        errorCount: stats.rejected,
        message: stats.rejected > 0 ? `${stats.rejected} row(s) rejected` : "Sync completed",
      },
    });

    return { syncRunId: run.id, status, rowsRead: stats.read, rowsCreated: stats.created, rowsUpdated: stats.updated, rowsRejected: stats.rejected, errorCount: stats.rejected, rejects: stats.rejects };
  } catch (err) {
    await prisma.syncRun.update({
      where: { id: run.id },
      data: { finishedAt: new Date(), status: "FAILED", errorCount: 1, message: err instanceof Error ? err.message : "Unknown error", rowsRead: stats.read, rowsCreated: stats.created, rowsUpdated: stats.updated, rowsRejected: stats.rejected },
    });
    throw err;
  }
}

// --- helpers ---

function reject(stats: Stats, entity: string, sourceRow: number, errors: string[]) {
  stats.rejected++;
  stats.rejects.push({ entity, sourceRow, errors });
}

async function upsertCounting(stats: Stats, existingQuery: Promise<unknown>, doUpsert: () => Promise<unknown>) {
  const existing = await existingQuery;
  await doUpsert();
  existing ? stats.updated++ : stats.created++;
}

async function archiveMissing(
  _entity: string,
  seen: Set<string>,
  archive: (keys: string[]) => Promise<unknown>,
  hasAny: boolean,
) {
  // Only archive when the sheet actually returned rows for this entity, so an
  // empty/failed tab never wipes out existing data.
  if (!hasAny) return;
  await archive([...seen]);
}

async function keyMap<T extends Record<string, unknown>>(query: Promise<T[]>, key: string): Promise<Map<string, string>> {
  const rows = await query;
  const map = new Map<string, string>();
  for (const r of rows) map.set(r[key] as string, r.id as string);
  return map;
}

function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
