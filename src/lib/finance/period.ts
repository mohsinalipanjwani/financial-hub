// Period helpers: turn dashboard filters into concrete date ranges, and
// compute the immediately-preceding comparison period.

export type PeriodType = "month" | "quarter" | "year" | "custom";

export interface Period {
  type: PeriodType;
  start: Date; // inclusive
  end: Date; // exclusive
  label: string;
}

function startOfMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

function addMonths(d: Date, n: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
}

/** Number of whole months in [start, end). */
export function monthsInPeriod(p: Period): number {
  return (
    (p.end.getUTCFullYear() - p.start.getUTCFullYear()) * 12 +
    (p.end.getUTCMonth() - p.start.getUTCMonth())
  );
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export function monthPeriod(year: number, month0: number): Period {
  const start = new Date(Date.UTC(year, month0, 1));
  return {
    type: "month",
    start,
    end: addMonths(start, 1),
    label: `${MONTHS[month0]} ${year}`,
  };
}

export function quarterPeriod(year: number, quarter: number): Period {
  const month0 = (quarter - 1) * 3;
  const start = new Date(Date.UTC(year, month0, 1));
  return {
    type: "quarter",
    start,
    end: addMonths(start, 3),
    label: `Q${quarter} ${year}`,
  };
}

export function yearPeriod(year: number): Period {
  const start = new Date(Date.UTC(year, 0, 1));
  return {
    type: "year",
    start,
    end: addMonths(start, 12),
    label: `${year}`,
  };
}

/**
 * Custom range over whole months, INCLUSIVE of both the start and end month.
 * `end` is stored exclusive (first of the month after `end`) so range queries
 * `>= start && < end` behave consistently with the other period types.
 */
export function customPeriod(start: Date, end: Date): Period {
  const s = startOfMonth(start);
  let e = addMonths(startOfMonth(end), 1);
  if (e <= s) e = addMonths(s, 1); // guard against inverted ranges
  return {
    type: "custom",
    start: s,
    end: e,
    label: `${formatMonthLabel(s)} – ${formatMonthLabel(addMonths(e, -1))}`,
  };
}

/** The period immediately before `p`, of equal length. */
export function previousPeriod(p: Period): Period {
  const months = monthsInPeriod(p) || 1;
  const start = addMonths(p.start, -months);
  const end = p.start;
  return { ...p, start, end, label: `Previous ${p.type}` };
}

/** Enumerate the first-of-month dates covered by a period. */
export function eachMonth(p: Period): Date[] {
  const out: Date[] = [];
  let cur = startOfMonth(p.start);
  while (cur < p.end) {
    out.push(cur);
    cur = addMonths(cur, 1);
  }
  return out;
}

export function formatMonthLabel(d: Date): string {
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** Resolve dashboard search params into a Period. Defaults to current quarter. */
export function resolvePeriod(params: {
  type?: string;
  year?: string;
  month?: string;
  quarter?: string;
  start?: string;
  end?: string;
}, now = new Date()): Period {
  const year = params.year ? parseInt(params.year, 10) : now.getUTCFullYear();
  switch (params.type) {
    case "month": {
      const m = params.month != null ? parseInt(params.month, 10) : now.getUTCMonth();
      return monthPeriod(year, m);
    }
    case "year":
      return yearPeriod(year);
    case "custom": {
      if (params.start && params.end) {
        return customPeriod(new Date(params.start), new Date(params.end));
      }
      return monthPeriod(now.getUTCFullYear(), now.getUTCMonth());
    }
    case "quarter":
    default: {
      const q = params.quarter ? parseInt(params.quarter, 10) : Math.floor(now.getUTCMonth() / 3) + 1;
      return quarterPeriod(year, q);
    }
  }
}
