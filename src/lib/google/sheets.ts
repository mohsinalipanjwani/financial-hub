// Google Sheets read access, behind a small SheetSource interface so the sync
// engine can be driven by a real spreadsheet OR an in-memory fixture in tests.

export interface SheetTable {
  /** Header row (column names), trimmed. */
  header: string[];
  /** Data rows (header excluded), each a list of raw string cells. */
  rows: string[][];
}

export interface SheetSource {
  /** Read the named tabs. Missing tabs come back as empty tables, not errors. */
  readTabs(tabNames: string[]): Promise<Record<string, SheetTable>>;
}

/** In-memory source for tests and seeding — rows include the header first. */
export class InMemorySheetSource implements SheetSource {
  constructor(private tabs: Record<string, string[][]>) {}

  async readTabs(tabNames: string[]): Promise<Record<string, SheetTable>> {
    const out: Record<string, SheetTable> = {};
    for (const name of tabNames) {
      const grid = this.tabs[name];
      if (!grid || grid.length === 0) {
        out[name] = { header: [], rows: [] };
        continue;
      }
      out[name] = { header: grid[0].map((h) => h.trim()), rows: grid.slice(1) };
    }
    return out;
  }
}

const SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets";

/** Reads a real Google spreadsheet via the Sheets API (values.batchGet). */
export class GoogleSheetSource implements SheetSource {
  constructor(
    private spreadsheetId: string,
    private accessToken: string,
  ) {}

  async readTabs(tabNames: string[]): Promise<Record<string, SheetTable>> {
    const ranges = tabNames.map((t) => `ranges=${encodeURIComponent(t)}`).join("&");
    const url = `${SHEETS_API}/${this.spreadsheetId}/values:batchGet?${ranges}&majorDimension=ROWS`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${this.accessToken}` },
    });
    if (!res.ok) {
      throw new Error(`Sheets API error: ${res.status} ${await res.text()}`);
    }
    const data = (await res.json()) as {
      valueRanges?: { range?: string; values?: string[][] }[];
    };

    const out: Record<string, SheetTable> = {};
    (data.valueRanges ?? []).forEach((vr, i) => {
      const name = tabNames[i];
      const values = vr.values ?? [];
      if (values.length === 0) {
        out[name] = { header: [], rows: [] };
      } else {
        out[name] = { header: values[0].map((h) => String(h).trim()), rows: values.slice(1) };
      }
    });
    // Ensure every requested tab has an entry.
    for (const name of tabNames) if (!(name in out)) out[name] = { header: [], rows: [] };
    return out;
  }
}
