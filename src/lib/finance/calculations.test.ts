import { describe, it, expect } from "vitest";
import {
  round2,
  convertCurrency,
  tryConvertCurrency,
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
} from "./calculations";
import type {
  RevenueLine,
  PaymentLine,
  TeamCostLine,
  SubscriptionLine,
  ExpenseLine,
  RateTable,
} from "./types";

// 1 PKR = 0.0036 USD  (~278 PKR / USD)
const rates: RateTable = { USD: 1, PKR: 0.0036 };

const rev = (o: Partial<RevenueLine>): RevenueLine => ({
  id: "r1",
  clientId: "c1",
  clientName: "Client",
  month: "2026-09-01",
  amount: 1000,
  currency: "USD",
  paymentStatus: "PENDING",
  ...o,
});

describe("round2", () => {
  it("rounds to 2 decimals without float noise", () => {
    expect(round2(0.1 + 0.2)).toBe(0.3);
    expect(round2(1.005)).toBe(1.01);
    expect(round2(2.675)).toBe(2.68);
  });
});

describe("convertCurrency", () => {
  it("returns same amount when currencies match", () => {
    expect(convertCurrency(500, "USD", "USD", rates)).toBe(500);
  });
  it("converts a foreign currency to USD", () => {
    expect(convertCurrency(100000, "PKR", "USD", rates)).toBe(360);
  });
  it("converts USD to a foreign reporting currency", () => {
    expect(convertCurrency(360, "USD", "PKR", rates)).toBe(100000);
  });
  it("throws on a missing rate", () => {
    expect(() => convertCurrency(100, "EUR", "USD", rates)).toThrow(/Missing exchange rate/);
  });
  it("tryConvertCurrency returns null instead of throwing", () => {
    expect(tryConvertCurrency(100, "EUR", "USD", rates)).toBeNull();
  });
});

describe("calcRevenue", () => {
  it("sums mixed-currency revenue in reporting currency", () => {
    const lines = [
      rev({ id: "a", amount: 1000, currency: "USD" }),
      rev({ id: "b", amount: 100000, currency: "PKR" }), // 360 USD
    ];
    expect(calcRevenue(lines, rates)).toBe(1360);
  });
  it("returns 0 for empty data", () => {
    expect(calcRevenue([], rates)).toBe(0);
  });
  it("skips lines with unknown currency (flagged elsewhere)", () => {
    const lines = [rev({ id: "a", amount: 1000 }), rev({ id: "b", amount: 500, currency: "EUR" })];
    expect(calcRevenue(lines, rates)).toBe(1000);
  });
});

describe("received", () => {
  it("sums payments as actual cash received", () => {
    const payments: PaymentLine[] = [
      { id: "p1", clientId: "c1", date: "2026-09-05", amount: 400, currency: "USD" },
      { id: "p2", clientId: "c1", date: "2026-09-10", amount: 100000, currency: "PKR" }, // 360
    ];
    expect(calcReceivedFromPayments(payments, rates)).toBe(760);
  });
  it("counts PAID revenue without payment rows, skipping those already paid via rows", () => {
    const lines = [
      rev({ id: "a", amount: 1000, paymentStatus: "PAID" }),
      rev({ id: "b", amount: 500, paymentStatus: "PAID" }), // covered by a payment row
      rev({ id: "c", amount: 200, paymentStatus: "PENDING" }),
    ];
    const paidViaRows = new Set(["b"]);
    expect(calcReceivedFromRevenue(lines, rates, "USD", paidViaRows)).toBe(1000);
  });
});

describe("calcPending — partial payment handling", () => {
  it("expected minus received, per line, floored at zero", () => {
    const lines = [
      rev({ id: "a", amount: 1000, paymentStatus: "PARTIAL" }),
      rev({ id: "b", amount: 500, paymentStatus: "PENDING" }),
    ];
    const received = new Map([["a", 600]]); // 400 still pending on a
    expect(calcPending(lines, received, rates)).toBe(900); // 400 + 500
  });
  it("treats PAID lines without payment rows as fully received", () => {
    const lines = [rev({ id: "a", amount: 1000, paymentStatus: "PAID" })];
    expect(calcPending(lines, new Map(), rates)).toBe(0);
  });
  it("does not let overpayment on one line offset another", () => {
    const lines = [
      rev({ id: "a", amount: 1000, paymentStatus: "PARTIAL" }),
      rev({ id: "b", amount: 1000, paymentStatus: "PENDING" }),
    ];
    const received = new Map([["a", 1500]]); // overpaid a by 500
    expect(calcPending(lines, received, rates)).toBe(1000); // b still fully pending
  });
  it("handles mixed currency pending", () => {
    const lines = [rev({ id: "a", amount: 100000, currency: "PKR", paymentStatus: "PENDING" })];
    expect(calcPending(lines, new Map(), rates)).toBe(360);
  });
});

describe("calcTeamCost", () => {
  it("sums salary + overhead across currencies", () => {
    const lines: TeamCostLine[] = [
      { teamMemberId: "t1", employeeName: "A", month: "2026-09-01", salary: 3000, overhead: 500, currency: "USD" },
      { teamMemberId: "t2", employeeName: "B", month: "2026-09-01", salary: 200000, overhead: 0, currency: "PKR" }, // 720
    ];
    expect(calcTeamCost(lines, rates)).toBe(4220);
  });
  it("returns 0 with no team costs", () => {
    expect(calcTeamCost([], rates)).toBe(0);
  });
});

describe("calcSubscriptionCost", () => {
  const subs: SubscriptionLine[] = [
    { id: "s1", name: "Claude", monthlyCost: 100, currency: "USD", active: true },
    { id: "s2", name: "OldTool", monthlyCost: 50, currency: "USD", active: false },
    { id: "s3", name: "IONOS", monthlyCost: 10000, currency: "PKR", active: true }, // 36
  ];
  it("sums only active subscriptions", () => {
    expect(calcSubscriptionCost(subs, rates)).toBe(136);
  });
  it("multiplies by number of months in the period", () => {
    expect(calcSubscriptionCost(subs, rates, "USD", 3)).toBe(408);
  });
});

describe("calcOtherExpenses", () => {
  it("sums recorded expenses", () => {
    const lines: ExpenseLine[] = [
      { id: "e1", month: "2026-09-01", amount: 800, currency: "USD" },
      { id: "e2", month: "2026-09-01", amount: 100000, currency: "PKR" }, // 360
    ];
    expect(calcOtherExpenses(lines, rates)).toBe(1160);
  });
});

describe("aggregates", () => {
  it("totalCost sums the three cost buckets", () => {
    expect(calcTotalCost(45000, 5000, 8000)).toBe(58000);
  });
  it("netProfit = revenue - totalCost", () => {
    expect(calcNetProfit(100000, 58000)).toBe(42000);
  });
  it("profitMargin as a percentage", () => {
    expect(calcProfitMargin(42000, 100000)).toBe(42);
  });
  it("profitMargin returns 0 for zero revenue (no division error)", () => {
    expect(calcProfitMargin(-58000, 0)).toBe(0);
  });
  it("negative profit yields negative margin", () => {
    expect(calcProfitMargin(-10000, 40000)).toBe(-25);
  });
});

describe("percentChange", () => {
  it("computes period-over-period change", () => {
    expect(percentChange(112400, 100000)).toBe(12.4);
  });
  it("returns null when previous is zero", () => {
    expect(percentChange(1000, 0)).toBeNull();
  });
  it("handles a decrease", () => {
    expect(percentChange(80, 100)).toBe(-20);
  });
});
