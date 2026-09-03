// Pure data-quality rules. These operate on plain values (no Prisma), so they
// are unit-testable in isolation. `data-quality.ts` loads rows from the DB and
// runs them through these functions.

export type Severity = "INFO" | "WARNING" | "ERROR";

export interface RuleIssue {
  code: string;
  severity: Severity;
  message: string;
}

const VALID_PAYMENT_STATUSES = ["PENDING", "PAID", "PARTIAL"];

export interface RevenueInput {
  revenueKey: string;
  clientId: string | null;
  amount: number | null;
  hasDate: boolean;
  currency: string;
  paymentStatus: string;
  hasReceivedDate: boolean;
}

export function validateRevenueRow(r: RevenueInput, knownCurrencies: Set<string>): RuleIssue[] {
  const issues: RuleIssue[] = [];
  if (!r.clientId) {
    issues.push({ code: "MISSING_CLIENT", severity: "ERROR", message: `Revenue ${r.revenueKey} has no client` });
  }
  if (r.amount == null || r.amount <= 0) {
    issues.push({ code: "MISSING_AMOUNT", severity: "ERROR", message: `Revenue ${r.revenueKey} has a missing or non-positive amount` });
  }
  if (!r.hasDate) {
    issues.push({ code: "MISSING_DATE", severity: "ERROR", message: `Revenue ${r.revenueKey} has no date` });
  }
  if (!knownCurrencies.has(r.currency)) {
    issues.push({ code: "UNKNOWN_CURRENCY", severity: "ERROR", message: `Revenue ${r.revenueKey} uses currency ${r.currency} with no exchange rate` });
  }
  if (!VALID_PAYMENT_STATUSES.includes(r.paymentStatus)) {
    issues.push({ code: "INVALID_PAYMENT_STATUS", severity: "ERROR", message: `Revenue ${r.revenueKey} has an invalid payment status` });
  } else if (r.paymentStatus === "PAID" && !r.hasReceivedDate) {
    issues.push({ code: "PAID_NO_RECEIVED_DATE", severity: "WARNING", message: `Revenue ${r.revenueKey} is marked Paid but has no received date` });
  }
  return issues;
}

export interface SubscriptionInput {
  name: string;
  monthlyCost: number | null;
  currency: string;
}

export function validateSubscriptionRow(s: SubscriptionInput, knownCurrencies: Set<string>): RuleIssue[] {
  const issues: RuleIssue[] = [];
  if (s.monthlyCost == null || s.monthlyCost <= 0) {
    issues.push({ code: "SUBSCRIPTION_MISSING_COST", severity: "WARNING", message: `Subscription ${s.name} has no monthly cost` });
  }
  if (!knownCurrencies.has(s.currency)) {
    issues.push({ code: "UNKNOWN_CURRENCY", severity: "ERROR", message: `Subscription ${s.name} uses currency ${s.currency} with no exchange rate` });
  }
  return issues;
}

export interface TeamCostInput {
  costKey: string;
  salary: number | null;
  overhead: number | null;
  currency: string;
}

export function validateTeamCostRow(t: TeamCostInput, knownCurrencies: Set<string>): RuleIssue[] {
  const issues: RuleIssue[] = [];
  const noSalary = t.salary == null || t.salary <= 0;
  const noOverhead = t.overhead == null || t.overhead <= 0;
  if (noSalary && noOverhead) {
    issues.push({ code: "EMPLOYEE_MISSING_COST", severity: "WARNING", message: `Team cost ${t.costKey} has no salary or overhead` });
  }
  if (!knownCurrencies.has(t.currency)) {
    issues.push({ code: "UNKNOWN_CURRENCY", severity: "ERROR", message: `Team cost ${t.costKey} uses currency ${t.currency} with no exchange rate` });
  }
  return issues;
}

/** Business keys that appear more than once. */
export function findDuplicates(keys: (string | null | undefined)[]): string[] {
  const counts = new Map<string, number>();
  for (const k of keys) {
    if (!k) continue;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return [...counts.entries()].filter(([, n]) => n > 1).map(([k]) => k);
}
