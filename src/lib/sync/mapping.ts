// Column mapping: canonical field name -> the sheet header that holds it.
// The MVP ships the master-sheet defaults below. Flexible per-tab remapping
// later is just a matter of overriding these maps (e.g. from a stored config),
// without touching the parsers or the engine.

import type { SheetTable } from "@/lib/google/sheets";

export type FieldMap = Record<string, string>;

export const TAB_NAMES = {
  clients: "Clients",
  revenue: "Revenue",
  team: "Team",
  subscriptions: "Subscriptions",
  expenses: "Other Expenses",
  payments: "Payments",
  exchangeRates: "Exchange Rates",
} as const;

export const DEFAULT_MAPPINGS: Record<string, FieldMap> = {
  clients: {
    clientKey: "Client ID",
    name: "Client Name",
    source: "Source",
    lead: "Lead",
    accountManager: "Account Manager",
    active: "Active",
    startDate: "Start Date",
    notes: "Notes",
  },
  revenue: {
    revenueKey: "Revenue ID",
    date: "Date",
    clientKey: "Client",
    project: "Project",
    phase: "Phase",
    month: "Month",
    amount: "Amount",
    currency: "Currency",
    status: "Status",
    paymentStatus: "Payment Status",
    receivedDate: "Received Date",
    expectedDate: "Expected Date",
    paymentMethod: "Payment Method",
    lead: "Lead",
    developer: "Developer",
    notes: "Notes",
  },
  team: {
    employeeKey: "Employee ID",
    employee: "Employee",
    month: "Month",
    salary: "Salary",
    overhead: "Overhead",
    currency: "Currency",
    active: "Active",
    notes: "Notes",
  },
  subscriptions: {
    subscriptionKey: "Subscription ID",
    name: "Subscription",
    owner: "Owner",
    category: "Category",
    monthlyCost: "Monthly Cost",
    currency: "Currency",
    startDate: "Start Date",
    renewalDate: "Renewal Date",
    active: "Active",
    notes: "Notes",
  },
  expenses: {
    expenseKey: "Expense ID",
    date: "Date",
    category: "Category",
    description: "Description",
    amount: "Amount",
    currency: "Currency",
    paid: "Paid",
    notes: "Notes",
  },
  payments: {
    paymentKey: "Payment ID",
    date: "Date",
    clientKey: "Client",
    revenueKey: "Revenue ID",
    amount: "Amount",
    currency: "Currency",
    method: "Method",
    status: "Status",
    notes: "Notes",
  },
  exchangeRates: {
    date: "Date",
    currency: "Currency",
    rateToUsd: "Rate to USD",
    notes: "Notes",
  },
};

/** A parsed row: canonical field -> raw string value, plus its sheet row number. */
export interface MappedRow {
  values: Record<string, string>;
  sourceRow: number; // 1-based row number in the sheet (header = row 1)
}

/**
 * Turn a SheetTable into canonical-field rows using a FieldMap. Headers present
 * in the map but missing from the sheet simply yield empty strings. Case- and
 * whitespace-insensitive header matching.
 */
export function mapTable(table: SheetTable, fieldMap: FieldMap): MappedRow[] {
  const headerIndex = new Map<string, number>();
  table.header.forEach((h, i) => headerIndex.set(h.trim().toLowerCase(), i));

  const fieldToIndex: Record<string, number | undefined> = {};
  for (const [field, header] of Object.entries(fieldMap)) {
    fieldToIndex[field] = headerIndex.get(header.trim().toLowerCase());
  }

  return table.rows.map((row, r) => {
    const values: Record<string, string> = {};
    for (const [field, idx] of Object.entries(fieldToIndex)) {
      values[field] = idx == null ? "" : String(row[idx] ?? "").trim();
    }
    return { values, sourceRow: r + 2 }; // +2: skip header, 1-based
  });
}
