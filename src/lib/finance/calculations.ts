// Pure financial calculation functions.
//
// Design rules (from the build brief):
//  - Original amount + currency are never mutated; conversion happens here.
//  - Zero revenue must never cause a division error.
//  - Missing exchange rates are surfaced, not silently treated as 1.
//  - Partial payments are handled correctly for pending revenue.

import type {
  RevenueLine,
  PaymentLine,
  TeamCostLine,
  SubscriptionLine,
  ExpenseLine,
  RateTable,
} from "./types";

/** Rounds to 2 decimal places, avoiding floating point noise. */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Convert an amount from its currency to the reporting currency (default USD).
 *
 * Rates are expressed as "1 unit of currency = rate USD". To convert to a
 * non-USD reporting currency we go via USD.
 *
 * Throws when a required rate is missing so callers can flag a data-quality
 * issue rather than silently mis-reporting money.
 */
export function convertCurrency(
  amount: number,
  from: string,
  to: string,
  rates: RateTable,
): number {
  if (from === to) return round2(amount);

  const fromRate = from === "USD" ? 1 : rates[from];
  const toRate = to === "USD" ? 1 : rates[to];

  if (fromRate == null) {
    throw new Error(`Missing exchange rate for currency: ${from}`);
  }
  if (toRate == null) {
    throw new Error(`Missing exchange rate for currency: ${to}`);
  }

  const usd = amount * fromRate;
  return round2(usd / toRate);
}

/**
 * Safe variant: returns the converted amount, or null when a rate is missing.
 * Used by aggregations that prefer to skip + flag rather than throw.
 */
export function tryConvertCurrency(
  amount: number,
  from: string,
  to: string,
  rates: RateTable,
): number | null {
  try {
    return convertCurrency(amount, from, to, rates);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Revenue
// ---------------------------------------------------------------------------

/** Total expected/earned revenue for the given lines, in reporting currency. */
export function calcRevenue(
  lines: RevenueLine[],
  rates: RateTable,
  reporting = "USD",
): number {
  const total = lines.reduce((sum, l) => {
    const v = tryConvertCurrency(l.amount, l.currency, reporting, rates);
    return sum + (v ?? 0);
  }, 0);
  return round2(total);
}

/**
 * Received revenue — actual cash in.
 *
 * When explicit payment records exist for a period, cash received is the sum
 * of those payments. This is the most accurate signal ("actual received").
 */
export function calcReceivedFromPayments(
  payments: PaymentLine[],
  rates: RateTable,
  reporting = "USD",
): number {
  const total = payments.reduce((sum, p) => {
    const v = tryConvertCurrency(p.amount, p.currency, reporting, rates);
    return sum + (v ?? 0);
  }, 0);
  return round2(total);
}

/**
 * Received revenue derived from revenue records' payment status, used when a
 * revenue line has no linked payment rows. PAID => full amount received,
 * PARTIAL => amount already accounted for by linked payments (0 here so the
 * payment rows are the source of truth), PENDING => 0.
 *
 * `paidRevenueIds` lets the caller exclude revenue that already has payment
 * rows, so received cash is never double counted.
 */
export function calcReceivedFromRevenue(
  lines: RevenueLine[],
  rates: RateTable,
  reporting = "USD",
  paidRevenueIds: Set<string> = new Set(),
): number {
  const total = lines.reduce((sum, l) => {
    if (paidRevenueIds.has(l.id)) return sum; // covered by payment rows
    if (l.paymentStatus !== "PAID") return sum; // partial/pending -> not here
    const v = tryConvertCurrency(l.amount, l.currency, reporting, rates);
    return sum + (v ?? 0);
  }, 0);
  return round2(total);
}

/**
 * Pending revenue = expected revenue - received, floored at 0 per line so a
 * client that overpaid one invoice does not mask another's shortfall.
 *
 * `receivedByRevenueId` maps revenue id -> cash already received against it
 * (from payment rows). Lines flagged PAID with no payment rows are treated as
 * fully received.
 */
export function calcPending(
  lines: RevenueLine[],
  receivedByRevenueId: Map<string, number>,
  rates: RateTable,
  reporting = "USD",
): number {
  const total = lines.reduce((sum, l) => {
    const expected = tryConvertCurrency(l.amount, l.currency, reporting, rates) ?? 0;
    let received = receivedByRevenueId.get(l.id) ?? 0;
    // No payment rows but marked PAID -> consider fully received.
    if (received === 0 && l.paymentStatus === "PAID") {
      received = expected;
    }
    const linePending = Math.max(0, expected - received);
    return sum + linePending;
  }, 0);
  return round2(total);
}

// ---------------------------------------------------------------------------
// Costs
// ---------------------------------------------------------------------------

/** Team cost = sum of (salary + overhead) converted to reporting currency. */
export function calcTeamCost(
  lines: TeamCostLine[],
  rates: RateTable,
  reporting = "USD",
): number {
  const total = lines.reduce((sum, l) => {
    const salary = tryConvertCurrency(l.salary, l.currency, reporting, rates) ?? 0;
    const overhead = tryConvertCurrency(l.overhead, l.currency, reporting, rates) ?? 0;
    return sum + salary + overhead;
  }, 0);
  return round2(total);
}

/**
 * Monthly subscription cost from ACTIVE subscriptions, multiplied by the
 * number of months in the period (default 1).
 */
export function calcSubscriptionCost(
  subs: SubscriptionLine[],
  rates: RateTable,
  reporting = "USD",
  months = 1,
): number {
  const monthly = subs.reduce((sum, s) => {
    if (!s.active) return sum;
    const v = tryConvertCurrency(s.monthlyCost, s.currency, reporting, rates);
    return sum + (v ?? 0);
  }, 0);
  return round2(monthly * months);
}

/** Sum of recorded other expenses. */
export function calcOtherExpenses(
  lines: ExpenseLine[],
  rates: RateTable,
  reporting = "USD",
): number {
  const total = lines.reduce((sum, l) => {
    const v = tryConvertCurrency(l.amount, l.currency, reporting, rates);
    return sum + (v ?? 0);
  }, 0);
  return round2(total);
}

export function calcTotalCost(
  teamCost: number,
  subscriptionCost: number,
  otherExpenses: number,
): number {
  return round2(teamCost + subscriptionCost + otherExpenses);
}

export function calcNetProfit(revenue: number, totalCost: number): number {
  return round2(revenue - totalCost);
}

/** Profit margin as a percentage. Zero revenue => 0 (no division error). */
export function calcProfitMargin(netProfit: number, revenue: number): number {
  if (revenue === 0) return 0;
  return round2((netProfit / revenue) * 100);
}

/**
 * Percentage change between two periods. Returns null when the previous value
 * is 0 (an "N/A" / new signal rather than a misleading Infinity).
 */
export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return round2(((current - previous) / Math.abs(previous)) * 100);
}
