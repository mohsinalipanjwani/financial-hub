import { describe, it, expect } from "vitest";
import { toCsv, parseCsv } from "./csv";

describe("toCsv", () => {
  it("emits a header and rows", () => {
    const csv = toCsv(
      [{ name: "Acme", amount: 1000 }],
      [
        { key: "name", label: "Client" },
        { key: "amount", label: "Amount" },
      ],
    );
    expect(csv).toBe("Client,Amount\r\nAcme,1000");
  });

  it("quotes fields containing commas, quotes, or newlines", () => {
    const csv = toCsv(
      [{ note: 'a, b', q: 'say "hi"', multi: "line1\nline2" }],
      [
        { key: "note", label: "Note" },
        { key: "q", label: "Quote" },
        { key: "multi", label: "Multi" },
      ],
    );
    expect(csv).toBe('Note,Quote,Multi\r\n"a, b","say ""hi""","line1\nline2"');
  });

  it("supports a custom formatter and null handling", () => {
    const csv = toCsv(
      [{ d: new Date("2026-09-01T00:00:00Z"), x: null }],
      [
        { key: "d", label: "Date", format: (r) => r.d.toISOString().slice(0, 10) },
        { key: "x", label: "X" },
      ],
    );
    expect(csv).toBe("Date,X\r\n2026-09-01,");
  });
});

describe("parseCsv", () => {
  it("parses a simple table", () => {
    expect(parseCsv("a,b\n1,2\n3,4")).toEqual([
      ["a", "b"],
      ["1", "2"],
      ["3", "4"],
    ]);
  });

  it("handles quoted fields with commas and escaped quotes", () => {
    expect(parseCsv('name,note\n"Acme, Inc","says ""hi"""')).toEqual([
      ["name", "note"],
      ["Acme, Inc", 'says "hi"'],
    ]);
  });

  it("handles CRLF line endings", () => {
    expect(parseCsv("a,b\r\n1,2\r\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("handles newlines inside quoted fields", () => {
    expect(parseCsv('a\n"line1\nline2"')).toEqual([["a"], ["line1\nline2"]]);
  });

  it("strips a UTF-8 BOM and drops empty trailing rows", () => {
    expect(parseCsv("﻿a,b\n1,2\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("round-trips with toCsv", () => {
    const csv = toCsv(
      [{ a: "x,y", b: 'z"z' }],
      [
        { key: "a", label: "A" },
        { key: "b", label: "B" },
      ],
    );
    expect(parseCsv(csv)).toEqual([
      ["A", "B"],
      ["x,y", 'z"z'],
    ]);
  });
});
