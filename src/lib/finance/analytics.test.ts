import { describe, it, expect } from "vitest";
import {
  collectionRate,
  daysBetween,
  averageDaysToPay,
  agingBuckets,
  momGrowth,
  averageMonthlyGrowth,
} from "./analytics";

const d = (s: string) => new Date(s + "T00:00:00Z");

describe("collectionRate", () => {
  it("computes received / revenue as a percentage", () => {
    expect(collectionRate(7500, 10000)).toBe(75);
  });
  it("returns 0 for zero revenue", () => {
    expect(collectionRate(0, 0)).toBe(0);
  });
});

describe("daysBetween", () => {
  it("counts whole days", () => {
    expect(daysBetween(d("2026-09-01"), d("2026-09-11"))).toBe(10);
  });
  it("is negative when b precedes a", () => {
    expect(daysBetween(d("2026-09-11"), d("2026-09-01"))).toBe(-10);
  });
  it("returns null on missing dates", () => {
    expect(daysBetween(null, d("2026-09-01"))).toBeNull();
  });
});

describe("averageDaysToPay", () => {
  it("averages collection lag over settled items", () => {
    const items = [
      { expectedDate: d("2026-09-01"), receivedDate: d("2026-09-06") }, // +5
      { expectedDate: d("2026-09-01"), receivedDate: d("2026-09-11") }, // +10
    ];
    expect(averageDaysToPay(items)).toBe(7.5);
  });
  it("ignores items lacking either date and returns null when none qualify", () => {
    expect(averageDaysToPay([{ expectedDate: d("2026-09-01"), receivedDate: null }])).toBeNull();
  });
  it("supports early payment (negative lag)", () => {
    expect(averageDaysToPay([{ expectedDate: d("2026-09-10"), receivedDate: d("2026-09-05") }])).toBe(-5);
  });
});

describe("agingBuckets", () => {
  const asOf = d("2026-09-30");
  it("buckets pending amounts by overdue age", () => {
    const items = [
      { pending: 100, expectedDate: d("2026-10-15") }, // future -> current
      { pending: 200, expectedDate: d("2026-09-20") }, // 10 days -> 1-30
      { pending: 300, expectedDate: d("2026-08-15") }, // 46 days -> 31-60
      { pending: 400, expectedDate: d("2026-07-15") }, // 77 days -> 61-90
      { pending: 500, expectedDate: d("2026-05-01") }, // >90
    ];
    expect(agingBuckets(items, asOf)).toEqual({ current: 100, d1_30: 200, d31_60: 300, d61_90: 400, d90plus: 500 });
  });
  it("treats missing expected date as current and skips zero pending", () => {
    const items = [
      { pending: 0, expectedDate: d("2026-01-01") },
      { pending: 150, expectedDate: null },
    ];
    expect(agingBuckets(items, asOf).current).toBe(150);
  });
});

describe("momGrowth", () => {
  it("computes last-over-previous change", () => {
    expect(momGrowth([100, 112])).toBe(12);
  });
  it("returns null for <2 points or zero previous", () => {
    expect(momGrowth([100])).toBeNull();
    expect(momGrowth([0, 100])).toBeNull();
  });
});

describe("averageMonthlyGrowth", () => {
  it("averages successive period changes", () => {
    // 100->110 (+10%), 110->121 (+10%) => 10%
    expect(averageMonthlyGrowth([100, 110, 121])).toBe(10);
  });
  it("skips transitions from zero", () => {
    expect(averageMonthlyGrowth([0, 100, 150])).toBe(50);
  });
  it("returns null when no valid transitions", () => {
    expect(averageMonthlyGrowth([0, 0])).toBeNull();
  });
});
