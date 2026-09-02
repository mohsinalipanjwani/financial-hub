import { describe, it, expect } from "vitest";
import {
  lineAmount,
  computeTotals,
  amountDue,
  deriveStatusFromPayments,
  displayStatus,
  isOverdue,
  formatInvoiceNumber,
  addDays,
  paymentTermsToDays,
} from "./calc";

describe("lineAmount / computeTotals", () => {
  it("computes line amounts and subtotal", () => {
    const items = [
      { quantity: 2, unitPrice: 500 },
      { quantity: 1, unitPrice: 250.5 },
    ];
    expect(lineAmount(items[0])).toBe(1000);
    expect(computeTotals(items).subtotal).toBe(1250.5);
  });
  it("applies absolute discount and tax", () => {
    const t = computeTotals([{ quantity: 1, unitPrice: 10000 }], 1000, 800);
    expect(t).toEqual({ subtotal: 10000, discount: 1000, tax: 800, total: 9800 });
  });
  it("never goes negative and ignores negative discount/tax", () => {
    const t = computeTotals([{ quantity: 1, unitPrice: 100 }], 500, -50);
    expect(t.total).toBe(0);
    expect(t.tax).toBe(0);
  });
  it("handles an empty invoice", () => {
    expect(computeTotals([])).toEqual({ subtotal: 0, discount: 0, tax: 0, total: 0 });
  });
});

describe("amountDue", () => {
  it("is total minus paid, floored at zero", () => {
    expect(amountDue(10000, 7000)).toBe(3000);
    expect(amountDue(10000, 12000)).toBe(0);
  });
});

describe("deriveStatusFromPayments", () => {
  it("marks fully paid as PAID", () => {
    expect(deriveStatusFromPayments("SENT", 10000, 10000)).toBe("PAID");
  });
  it("marks part paid as PARTIALLY_PAID", () => {
    expect(deriveStatusFromPayments("ISSUED", 10000, 4000)).toBe("PARTIALLY_PAID");
  });
  it("reverts to ISSUED when payments removed", () => {
    expect(deriveStatusFromPayments("PARTIALLY_PAID", 10000, 0)).toBe("ISSUED");
  });
  it("never changes DRAFT or VOID", () => {
    expect(deriveStatusFromPayments("DRAFT", 10000, 5000)).toBe("DRAFT");
    expect(deriveStatusFromPayments("VOID", 10000, 10000)).toBe("VOID");
  });
  it("keeps SENT when there are no payments", () => {
    expect(deriveStatusFromPayments("SENT", 10000, 0)).toBe("SENT");
  });
});

describe("displayStatus / isOverdue", () => {
  const now = new Date("2026-09-30T00:00:00Z");
  const past = new Date("2026-09-01T00:00:00Z");
  const future = new Date("2026-10-15T00:00:00Z");

  it("shows OVERDUE for an unpaid issued invoice past its due date", () => {
    expect(displayStatus("SENT", past, 5000, now)).toBe("OVERDUE");
    expect(isOverdue("SENT", past, 5000, now)).toBe(true);
  });
  it("is not overdue when nothing is due", () => {
    expect(displayStatus("PAID", past, 0, now)).toBe("PAID");
    expect(isOverdue("SENT", past, 0, now)).toBe(false);
  });
  it("is not overdue before the due date", () => {
    expect(displayStatus("ISSUED", future, 5000, now)).toBe("ISSUED");
  });
  it("never overrides DRAFT or VOID", () => {
    expect(displayStatus("DRAFT", past, 5000, now)).toBe("DRAFT");
    expect(displayStatus("VOID", past, 5000, now)).toBe("VOID");
  });
});

describe("formatInvoiceNumber", () => {
  it("zero-pads the sequence", () => {
    expect(formatInvoiceNumber("INV", 2026, 1)).toBe("INV-2026-0001");
    expect(formatInvoiceNumber("INV", 2026, 42)).toBe("INV-2026-0042");
    expect(formatInvoiceNumber("ACME", 2027, 1234)).toBe("ACME-2027-1234");
  });
});

describe("addDays / paymentTermsToDays", () => {
  it("adds days", () => {
    expect(addDays(new Date("2026-09-01T00:00:00Z"), 30).toISOString().slice(0, 10)).toBe("2026-10-01");
  });
  it("parses payment terms", () => {
    expect(paymentTermsToDays("Net 30")).toBe(30);
    expect(paymentTermsToDays("45")).toBe(45);
    expect(paymentTermsToDays("Due on receipt")).toBe(0);
    expect(paymentTermsToDays(null)).toBe(30);
  });
});
