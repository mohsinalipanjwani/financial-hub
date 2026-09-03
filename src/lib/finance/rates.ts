import { prisma } from "@/lib/prisma";
import type { RateTable } from "./types";

/**
 * Build a currency -> rateToUSD table using the most recent rate on or before
 * `asOf` for each currency. USD is always 1. Missing currencies simply won't
 * appear in the table; conversion helpers surface that as null/flag.
 */
export async function loadRateTable(asOf: Date = new Date()): Promise<RateTable> {
  const rows = await prisma.exchangeRate.findMany({
    where: { date: { lte: asOf } },
    orderBy: { date: "desc" },
  });

  const table: RateTable = { USD: 1 };
  for (const r of rows) {
    // rows are newest-first, so first occurrence per currency wins
    if (!(r.currency in table)) {
      table[r.currency] = Number(r.rateToUsd);
    }
  }
  return table;
}
