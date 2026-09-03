// CSV helpers used by exports (rows -> CSV) and the import utility (CSV -> rows).
// RFC-4180-ish: quote fields containing comma, quote, or newline; escape quotes
// by doubling them.

export interface CsvColumn<T> {
  key: keyof T | string;
  label: string;
  /** Optional value formatter (defaults to String()). */
  format?: (row: T) => string | number | null | undefined;
}

function escapeCell(value: unknown): string {
  if (value == null) return "";
  const s = String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const header = columns.map((c) => escapeCell(c.label)).join(",");
  const body = rows.map((row) =>
    columns
      .map((c) => {
        const raw = c.format ? c.format(row) : (row as Record<string, unknown>)[c.key as string];
        return escapeCell(raw);
      })
      .join(","),
  );
  return [header, ...body].join("\r\n");
}

/**
 * Parse CSV text into a 2D array of strings (including the header row).
 * Handles quoted fields, escaped quotes, and CRLF/LF line endings.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  // Strip a UTF-8 BOM if present.
  const s = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c === "\r") {
      // handled by the \n branch; skip lone CR before LF
      if (s[i + 1] !== "\n") {
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
      }
    } else {
      field += c;
    }
  }
  // flush trailing field/row (unless the input ended exactly on a newline)
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // Drop fully-empty trailing rows.
  return rows.filter((r) => !(r.length === 1 && r[0].trim() === ""));
}
