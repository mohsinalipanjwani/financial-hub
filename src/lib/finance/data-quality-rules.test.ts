import { describe, it, expect } from "vitest";
import {
  validateRevenueRow,
  validateSubscriptionRow,
  validateTeamCostRow,
  findDuplicates,
  type RevenueInput,
} from "./data-quality-rules";

const currencies = new Set(["USD", "PKR"]);

const codes = (issues: { code: string }[]) => issues.map((i) => i.code).sort();

const revenue = (o: Partial<RevenueInput>): RevenueInput => ({
  revenueKey: "REV-1",
  clientId: "c1",
  amount: 1000,
  hasDate: true,
  currency: "USD",
  paymentStatus: "PENDING",
  hasReceivedDate: false,
  ...o,
});

describe("validateRevenueRow", () => {
  it("passes a clean row", () => {
    expect(validateRevenueRow(revenue({}), currencies)).toEqual([]);
  });
  it("flags a missing client", () => {
    expect(codes(validateRevenueRow(revenue({ clientId: null }), currencies))).toContain("MISSING_CLIENT");
  });
  it("flags missing / non-positive amount", () => {
    expect(codes(validateRevenueRow(revenue({ amount: null }), currencies))).toContain("MISSING_AMOUNT");
    expect(codes(validateRevenueRow(revenue({ amount: 0 }), currencies))).toContain("MISSING_AMOUNT");
    expect(codes(validateRevenueRow(revenue({ amount: -5 }), currencies))).toContain("MISSING_AMOUNT");
  });
  it("flags a missing date", () => {
    expect(codes(validateRevenueRow(revenue({ hasDate: false }), currencies))).toContain("MISSING_DATE");
  });
  it("flags an unknown currency", () => {
    expect(codes(validateRevenueRow(revenue({ currency: "EUR" }), currencies))).toContain("UNKNOWN_CURRENCY");
  });
  it("flags PAID without a received date as a warning", () => {
    const issues = validateRevenueRow(revenue({ paymentStatus: "PAID", hasReceivedDate: false }), currencies);
    const paid = issues.find((i) => i.code === "PAID_NO_RECEIVED_DATE");
    expect(paid?.severity).toBe("WARNING");
  });
  it("does not flag PAID when a received date exists", () => {
    expect(codes(validateRevenueRow(revenue({ paymentStatus: "PAID", hasReceivedDate: true }), currencies))).toEqual([]);
  });
  it("flags an invalid payment status", () => {
    const issues = codes(validateRevenueRow(revenue({ paymentStatus: "DONE" }), currencies));
    expect(issues).toContain("INVALID_PAYMENT_STATUS");
    expect(issues).not.toContain("PAID_NO_RECEIVED_DATE");
  });
  it("accumulates multiple issues on one row", () => {
    const issues = codes(validateRevenueRow(revenue({ clientId: null, amount: null, currency: "EUR" }), currencies));
    expect(issues).toEqual(["MISSING_AMOUNT", "MISSING_CLIENT", "UNKNOWN_CURRENCY"]);
  });
});

describe("validateSubscriptionRow", () => {
  it("passes a clean subscription", () => {
    expect(validateSubscriptionRow({ name: "Claude", monthlyCost: 100, currency: "USD" }, currencies)).toEqual([]);
  });
  it("warns on missing cost", () => {
    expect(codes(validateSubscriptionRow({ name: "X", monthlyCost: null, currency: "USD" }, currencies))).toContain("SUBSCRIPTION_MISSING_COST");
  });
  it("flags unknown currency", () => {
    expect(codes(validateSubscriptionRow({ name: "X", monthlyCost: 10, currency: "GBP" }, currencies))).toContain("UNKNOWN_CURRENCY");
  });
});

describe("validateTeamCostRow", () => {
  it("passes when salary present", () => {
    expect(validateTeamCostRow({ costKey: "k", salary: 3000, overhead: 0, currency: "USD" }, currencies)).toEqual([]);
  });
  it("passes when only overhead present", () => {
    expect(validateTeamCostRow({ costKey: "k", salary: 0, overhead: 500, currency: "USD" }, currencies)).toEqual([]);
  });
  it("warns only when both salary and overhead are missing", () => {
    expect(codes(validateTeamCostRow({ costKey: "k", salary: 0, overhead: 0, currency: "USD" }, currencies))).toContain("EMPLOYEE_MISSING_COST");
  });
});

describe("findDuplicates", () => {
  it("returns keys appearing more than once", () => {
    expect(findDuplicates(["A", "B", "A", "C", "C", "C"]).sort()).toEqual(["A", "C"]);
  });
  it("ignores null / undefined keys", () => {
    expect(findDuplicates([null, undefined, "A"])).toEqual([]);
  });
  it("returns empty when all unique", () => {
    expect(findDuplicates(["A", "B", "C"])).toEqual([]);
  });
});
