import { describe, it, expect } from "vitest";
import {
  monthPeriod,
  quarterPeriod,
  yearPeriod,
  customPeriod,
  previousPeriod,
  monthsInPeriod,
  eachMonth,
  formatMonthLabel,
  resolvePeriod,
} from "./period";

const iso = (d: Date) => d.toISOString().slice(0, 10);

describe("monthPeriod", () => {
  it("spans exactly one month, end exclusive", () => {
    const p = monthPeriod(2026, 8); // Sep 2026 (month0 = 8)
    expect(iso(p.start)).toBe("2026-09-01");
    expect(iso(p.end)).toBe("2026-10-01");
    expect(p.label).toBe("Sep 2026");
    expect(monthsInPeriod(p)).toBe(1);
  });
});

describe("quarterPeriod", () => {
  it("spans three months", () => {
    const p = quarterPeriod(2026, 3); // Q3 = Jul..Sep
    expect(iso(p.start)).toBe("2026-07-01");
    expect(iso(p.end)).toBe("2026-10-01");
    expect(p.label).toBe("Q3 2026");
    expect(monthsInPeriod(p)).toBe(3);
  });
});

describe("yearPeriod", () => {
  it("spans twelve months", () => {
    const p = yearPeriod(2026);
    expect(iso(p.start)).toBe("2026-01-01");
    expect(iso(p.end)).toBe("2027-01-01");
    expect(monthsInPeriod(p)).toBe(12);
  });
});

describe("customPeriod", () => {
  it("is inclusive of both start and end month", () => {
    const p = customPeriod(new Date("2026-02-15"), new Date("2026-04-10"));
    expect(iso(p.start)).toBe("2026-02-01");
    expect(iso(p.end)).toBe("2026-05-01"); // end exclusive = May 1
    expect(monthsInPeriod(p)).toBe(3); // Feb, Mar, Apr
    expect(p.label).toBe("Feb 2026 – Apr 2026");
  });
  it("handles a single-month range", () => {
    const p = customPeriod(new Date("2026-06-01"), new Date("2026-06-30"));
    expect(monthsInPeriod(p)).toBe(1);
  });
  it("guards against an inverted range", () => {
    const p = customPeriod(new Date("2026-06-01"), new Date("2026-01-01"));
    expect(monthsInPeriod(p)).toBe(1);
  });
});

describe("previousPeriod", () => {
  it("returns the immediately-preceding equal-length window", () => {
    const p = quarterPeriod(2026, 2); // Apr..Jun
    const prev = previousPeriod(p);
    expect(iso(prev.start)).toBe("2026-01-01"); // Jan..Mar
    expect(iso(prev.end)).toBe("2026-04-01");
    expect(monthsInPeriod(prev)).toBe(3);
  });
  it("crosses year boundaries for a month period", () => {
    const p = monthPeriod(2026, 0); // Jan 2026
    const prev = previousPeriod(p);
    expect(iso(prev.start)).toBe("2025-12-01");
    expect(iso(prev.end)).toBe("2026-01-01");
  });
});

describe("eachMonth", () => {
  it("lists every first-of-month in the period", () => {
    const p = quarterPeriod(2026, 1); // Jan..Mar
    expect(eachMonth(p).map(iso)).toEqual(["2026-01-01", "2026-02-01", "2026-03-01"]);
  });
});

describe("formatMonthLabel", () => {
  it("formats a UTC first-of-month", () => {
    expect(formatMonthLabel(new Date("2026-12-01"))).toBe("Dec 2026");
  });
});

describe("resolvePeriod", () => {
  const now = new Date("2026-09-15T00:00:00Z");
  it("defaults to the current month", () => {
    const p = resolvePeriod({}, now);
    expect(p.label).toBe("Sep 2026");
  });
  it("resolves a quarter", () => {
    const p = resolvePeriod({ type: "quarter", year: "2026", quarter: "2" }, now);
    expect(p.label).toBe("Q2 2026");
  });
  it("resolves a year", () => {
    const p = resolvePeriod({ type: "year", year: "2025" }, now);
    expect(p.label).toBe("2025");
  });
  it("resolves a custom range", () => {
    const p = resolvePeriod({ type: "custom", start: "2026-01", end: "2026-03" }, now);
    expect(monthsInPeriod(p)).toBe(3);
  });
  it("falls back to current month when custom range is incomplete", () => {
    const p = resolvePeriod({ type: "custom", start: "2026-01" }, now);
    expect(p.label).toBe("Sep 2026");
  });
});
