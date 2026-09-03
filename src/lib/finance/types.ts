// Shared domain types for financial calculations.
// These are intentionally plain (no Prisma/Decimal dependency) so the
// calculation functions are pure and trivially unit-testable.

export type PaymentStatus = "PENDING" | "PAID" | "PARTIAL";

/** A revenue line item, already converted to the reporting currency. */
export interface RevenueLine {
  id: string;
  clientId: string;
  clientName: string;
  /** First day of the month this revenue belongs to (ISO string or Date). */
  month: string | Date;
  /** Amount in the ORIGINAL currency. */
  amount: number;
  currency: string;
  paymentStatus: PaymentStatus;
  project?: string | null;
  phase?: string | null;
}

/** An actual cash payment received. */
export interface PaymentLine {
  id: string;
  clientId: string;
  revenueId?: string | null;
  date: string | Date;
  amount: number;
  currency: string;
}

export interface TeamCostLine {
  teamMemberId: string;
  employeeName: string;
  month: string | Date;
  salary: number;
  overhead: number;
  currency: string;
}

export interface SubscriptionLine {
  id: string;
  name: string;
  category?: string | null;
  owner?: string | null;
  monthlyCost: number;
  currency: string;
  active: boolean;
}

export interface ExpenseLine {
  id: string;
  category?: string | null;
  month: string | Date;
  amount: number;
  currency: string;
}

/** currency -> rate to USD (1 unit of currency = rate USD). USD is always 1. */
export type RateTable = Record<string, number>;

export interface FinancialSummary {
  revenue: number;
  received: number;
  pending: number;
  teamCost: number;
  subscriptionCost: number;
  otherExpenses: number;
  totalCost: number;
  netProfit: number;
  profitMargin: number; // percentage
}
