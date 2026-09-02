// Import/migration dry-run. Runs the same parsers as the sync engine over a
// SheetSource and produces a report (create / update / reject counts + reasons)
// WITHOUT writing anything. Used to inspect existing Excel/CSV exports before
// importing, per the migration workflow (inspect → map → report → import).

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
  type ParseResult,
} from "./parsers";
import type { MappedRow } from "./mapping";

export interface EntityPreview {
  entity: string;
  toCreate: number;
  toUpdate: number;
  rejected: { sourceRow: number; errors: string[] }[];
}

export interface SyncPreview {
  entities: EntityPreview[];
  totals: { rows: number; toCreate: number; toUpdate: number; rejected: number };
}

async function existingKeys(model: {
  findMany: (args: { select: Record<string, boolean> }) => Promise<Record<string, unknown>[]>;
}, keyField: string): Promise<Set<string>> {
  const rows = await model.findMany({ select: { [keyField]: true } });
  return new Set(rows.map((r) => r[keyField] as string));
}

export async function previewSync(
  source: SheetSource,
  mappings: Record<string, FieldMap> = DEFAULT_MAPPINGS,
): Promise<SyncPreview> {
  const tabs = await source.readTabs(Object.values(TAB_NAMES));

  const [clientKeysDb, revenueKeysDb, paymentKeysDb, subKeysDb, expenseKeysDb] = await Promise.all([
    existingKeys(prisma.client, "clientKey"),
    existingKeys(prisma.revenue, "revenueKey"),
    existingKeys(prisma.payment, "paymentKey"),
    existingKeys(prisma.subscription, "subscriptionKey"),
    existingKeys(prisma.expense, "expenseKey"),
  ]);

  const entities: EntityPreview[] = [];

  // Clients (also builds the set of client keys available to revenue/payments)
  const importedClientKeys = new Set<string>();
  const clientsPrev = evaluate("client", tabs[TAB_NAMES.clients], mappings.clients, parseClient, (v) => {
    importedClientKeys.add(v.clientKey);
    return { key: v.clientKey, exists: clientKeysDb.has(v.clientKey) };
  });
  entities.push(clientsPrev);

  const knownClients = new Set<string>([...clientKeysDb, ...importedClientKeys]);

  entities.push(
    evaluate("exchange_rate", tabs[TAB_NAMES.exchangeRates], mappings.exchangeRates, parseExchangeRate, () => ({ key: null, exists: false })),
  );
  entities.push(
    evaluate("team", tabs[TAB_NAMES.team], mappings.team, parseTeamRow, () => ({ key: null, exists: false })),
  );
  entities.push(
    evaluate("subscription", tabs[TAB_NAMES.subscriptions], mappings.subscriptions, parseSubscription, (v) => ({ key: v.subscriptionKey, exists: subKeysDb.has(v.subscriptionKey) })),
  );
  entities.push(
    evaluate("expense", tabs[TAB_NAMES.expenses], mappings.expenses, parseExpense, (v) => ({ key: v.expenseKey, exists: expenseKeysDb.has(v.expenseKey) })),
  );
  entities.push(
    evaluate("revenue", tabs[TAB_NAMES.revenue], mappings.revenue, parseRevenue, (v) => {
      if (!knownClients.has(v.clientKey)) return { reject: [`Unknown client "${v.clientKey}"`] };
      return { key: v.revenueKey, exists: revenueKeysDb.has(v.revenueKey) };
    }),
  );
  entities.push(
    evaluate("payment", tabs[TAB_NAMES.payments], mappings.payments, parsePayment, (v) => {
      if (!knownClients.has(v.clientKey)) return { reject: [`Unknown client "${v.clientKey}"`] };
      return { key: v.paymentKey, exists: paymentKeysDb.has(v.paymentKey) };
    }),
  );

  const totals = entities.reduce(
    (acc, e) => ({
      rows: acc.rows + e.toCreate + e.toUpdate + e.rejected.length,
      toCreate: acc.toCreate + e.toCreate,
      toUpdate: acc.toUpdate + e.toUpdate,
      rejected: acc.rejected + e.rejected.length,
    }),
    { rows: 0, toCreate: 0, toUpdate: 0, rejected: 0 },
  );

  return { entities, totals };
}

type Classify<T> = (value: T) => { key: string | null; exists: boolean } | { reject: string[] };

function evaluate<T>(
  entity: string,
  table: { header: string[]; rows: string[][] } | undefined,
  fieldMap: FieldMap,
  parse: (row: MappedRow) => ParseResult<T>,
  classify: Classify<T>,
): EntityPreview {
  const prev: EntityPreview = { entity, toCreate: 0, toUpdate: 0, rejected: [] };
  if (!table) return prev;

  // Track duplicate keys within the file itself.
  const seenKeys = new Set<string>();

  for (const row of mapTable(table, fieldMap)) {
    const res = parse(row);
    if (!res.ok) {
      prev.rejected.push({ sourceRow: row.sourceRow, errors: res.errors });
      continue;
    }
    const c = classify(res.value!);
    if ("reject" in c) {
      prev.rejected.push({ sourceRow: row.sourceRow, errors: c.reject });
      continue;
    }
    if (c.key && seenKeys.has(c.key)) {
      prev.rejected.push({ sourceRow: row.sourceRow, errors: [`Duplicate ${entity} key "${c.key}" in file`] });
      continue;
    }
    if (c.key) seenKeys.add(c.key);
    if (c.exists) prev.toUpdate++;
    else prev.toCreate++;
  }
  return prev;
}
