import { describe, it, expect } from "vitest";
import {
  parseDecimal,
  parseDate,
  parseMonth,
  parseBool,
  normalizeCurrency,
  parsePaymentStatus,
  parseRevenueStatus,
  parseClient,
  parseRevenue,
  parseTeamRow,
  parseSubscription,
  parseExpense,
  parsePayment,
  parseExchangeRate,
} from "./parsers";
import type { MappedRow } from "./mapping";

const row = (values: Record<string, string>, sourceRow = 2): MappedRow => ({ values, sourceRow });
const iso = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);

describe("parseDecimal", () => {
  it("parses plain and formatted numbers", () => {
    expect(parseDecimal("1000")).toBe(1000);
    expect(parseDecimal("$1,250.50")).toBe(1250.5);
    expect(parseDecimal(" 2,000 ")).toBe(2000);
    expect(parseDecimal("-500")).toBe(-500);
  });
  it("returns null for empty / non-numeric", () => {
    expect(parseDecimal("")).toBeNull();
    expect(parseDecimal("N/A")).toBeNull();
    expect(parseDecimal("-")).toBeNull();
  });
});

describe("parseDate", () => {
  it("parses ISO and slash formats", () => {
    expect(iso(parseDate("2026-09-05"))).toBe("2026-09-05");
    expect(iso(parseDate("2026/09/05"))).toBe("2026-09-05");
  });
  it("parses US MM/DD/YYYY", () => {
    expect(iso(parseDate("09/05/2026"))).toBe("2026-09-05");
  });
  it("detects DD/MM/YYYY when day > 12", () => {
    expect(iso(parseDate("25/12/2026"))).toBe("2026-12-25");
  });
  it("returns null for blank / garbage", () => {
    expect(parseDate("")).toBeNull();
    expect(parseDate("not a date")).toBeNull();
  });
});

describe("parseMonth", () => {
  it("parses YYYY-MM to first of month", () => {
    expect(iso(parseMonth("2026-09"))).toBe("2026-09-01");
  });
  it("collapses a full date to first of month", () => {
    expect(iso(parseMonth("2026-09-19"))).toBe("2026-09-01");
  });
});

describe("parseBool", () => {
  it("recognizes truthy tokens", () => {
    ["true", "Yes", "Y", "1", "Active"].forEach((t) => expect(parseBool(t)).toBe(true));
  });
  it("recognizes falsy tokens", () => {
    ["false", "No", "0", "inactive"].forEach((t) => expect(parseBool(t)).toBe(false));
  });
  it("uses default when blank", () => {
    expect(parseBool("", true)).toBe(true);
    expect(parseBool("", false)).toBe(false);
  });
});

describe("normalizeCurrency", () => {
  it("uppercases and defaults to USD", () => {
    expect(normalizeCurrency("usd")).toBe("USD");
    expect(normalizeCurrency("pkr")).toBe("PKR");
    expect(normalizeCurrency("")).toBe("USD");
  });
});

describe("parsePaymentStatus", () => {
  it("maps known statuses", () => {
    expect(parsePaymentStatus("Paid")).toBe("PAID");
    expect(parsePaymentStatus("partial")).toBe("PARTIAL");
    expect(parsePaymentStatus("")).toBe("PENDING");
  });
  it("returns null for unknown", () => {
    expect(parsePaymentStatus("weird")).toBeNull();
  });
});

describe("parseRevenueStatus", () => {
  it("defaults to CONFIRMED and maps cancelled", () => {
    expect(parseRevenueStatus("")).toBe("CONFIRMED");
    expect(parseRevenueStatus("canceled")).toBe("CANCELLED");
  });
});

describe("parseClient", () => {
  it("parses a valid client", () => {
    const res = parseClient(row({ clientKey: "CL-1", name: "Acme", active: "Yes", source: "Upwork" }));
    expect(res.ok).toBe(true);
    expect(res.value?.name).toBe("Acme");
    expect(res.value?.active).toBe(true);
  });
  it("rejects when key or name missing", () => {
    const res = parseClient(row({ clientKey: "", name: "" }));
    expect(res.ok).toBe(false);
    expect(res.errors).toContain("Missing Client ID");
    expect(res.errors).toContain("Missing Client Name");
  });
});

describe("parseRevenue", () => {
  const base = { revenueKey: "REV-1", clientKey: "CL-1", amount: "1000", date: "2026-09-05", month: "2026-09", currency: "USD", paymentStatus: "Pending" };
  it("parses a valid revenue row", () => {
    const res = parseRevenue(row(base));
    expect(res.ok).toBe(true);
    expect(res.value?.amount).toBe(1000);
    expect(iso(res.value?.month)).toBe("2026-09-01");
    expect(res.value?.paymentStatus).toBe("PENDING");
  });
  it("falls back to date's month when Month blank", () => {
    const res = parseRevenue(row({ ...base, month: "" }));
    expect(iso(res.value?.month)).toBe("2026-09-01");
  });
  it("rejects missing amount / date / client and bad status", () => {
    const res = parseRevenue(row({ revenueKey: "REV-2", clientKey: "", amount: "", date: "", month: "", paymentStatus: "??" }));
    expect(res.ok).toBe(false);
    expect(res.errors).toEqual(expect.arrayContaining(["Missing Client", "Missing or invalid Amount", "Missing or invalid Date"]));
  });
});

describe("parseTeamRow", () => {
  it("parses salary + overhead", () => {
    const res = parseTeamRow(row({ employeeKey: "EMP-1", employee: "Zed", month: "2026-09", salary: "3000", overhead: "500", currency: "USD" }));
    expect(res.ok).toBe(true);
    expect(res.value?.salary).toBe(3000);
    expect(res.value?.overhead).toBe(500);
  });
  it("rejects when both salary and overhead are zero", () => {
    const res = parseTeamRow(row({ employeeKey: "EMP-1", employee: "Zed", month: "2026-09", salary: "0", overhead: "0" }));
    expect(res.ok).toBe(false);
    expect(res.errors).toContain("Employee has no salary or overhead");
  });
});

describe("parseSubscription", () => {
  it("parses a subscription", () => {
    const res = parseSubscription(row({ subscriptionKey: "SUB-1", name: "Claude", monthlyCost: "100", currency: "USD", active: "Yes" }));
    expect(res.ok).toBe(true);
    expect(res.value?.monthlyCost).toBe(100);
  });
  it("rejects missing cost", () => {
    expect(parseSubscription(row({ subscriptionKey: "SUB-1", name: "X", monthlyCost: "" })).ok).toBe(false);
  });
});

describe("parseExpense", () => {
  it("derives month from date", () => {
    const res = parseExpense(row({ expenseKey: "EXP-1", date: "2026-07-12", amount: "600", currency: "USD", paid: "Yes" }));
    expect(res.ok).toBe(true);
    expect(iso(res.value?.month)).toBe("2026-07-01");
  });
});

describe("parsePayment", () => {
  it("parses a payment with optional revenue link", () => {
    const res = parsePayment(row({ paymentKey: "PAY-1", clientKey: "CL-1", revenueKey: "REV-1", amount: "500", date: "2026-09-10", status: "Cleared" }));
    expect(res.ok).toBe(true);
    expect(res.value?.revenueKey).toBe("REV-1");
    expect(res.value?.status).toBe("CLEARED");
  });
  it("allows a payment without a revenue link", () => {
    const res = parsePayment(row({ paymentKey: "PAY-2", clientKey: "CL-1", revenueKey: "", amount: "500", date: "2026-09-10" }));
    expect(res.ok).toBe(true);
    expect(res.value?.revenueKey).toBeNull();
  });
});

describe("parseExchangeRate", () => {
  it("parses a rate", () => {
    const res = parseExchangeRate(row({ date: "2026-01-01", currency: "PKR", rateToUsd: "0.0036" }));
    expect(res.ok).toBe(true);
    expect(res.value?.rateToUsd).toBe(0.0036);
  });
  it("rejects non-positive rate", () => {
    expect(parseExchangeRate(row({ date: "2026-01-01", currency: "PKR", rateToUsd: "0" })).ok).toBe(false);
  });
});
