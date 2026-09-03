import { describe, it, expect } from "vitest";
import { mapTable, DEFAULT_MAPPINGS } from "./mapping";
import type { SheetTable } from "@/lib/google/sheets";

describe("mapTable", () => {
  it("maps headers to canonical fields, case/space-insensitively", () => {
    const table: SheetTable = {
      header: ["Client ID", " client name ", "Active"],
      rows: [["CL-1", "Acme", "Yes"]],
    };
    const mapped = mapTable(table, DEFAULT_MAPPINGS.clients);
    expect(mapped[0].values.clientKey).toBe("CL-1");
    expect(mapped[0].values.name).toBe("Acme");
    expect(mapped[0].values.active).toBe("Yes");
    expect(mapped[0].sourceRow).toBe(2); // header is row 1
  });

  it("yields empty strings for headers missing from the sheet", () => {
    const table: SheetTable = { header: ["Client ID"], rows: [["CL-1"]] };
    const mapped = mapTable(table, DEFAULT_MAPPINGS.clients);
    expect(mapped[0].values.clientKey).toBe("CL-1");
    expect(mapped[0].values.name).toBe("");
  });

  it("assigns increasing source row numbers", () => {
    const table: SheetTable = { header: ["Client ID", "Client Name"], rows: [["A", "1"], ["B", "2"]] };
    const mapped = mapTable(table, DEFAULT_MAPPINGS.clients);
    expect(mapped.map((m) => m.sourceRow)).toEqual([2, 3]);
  });
});
