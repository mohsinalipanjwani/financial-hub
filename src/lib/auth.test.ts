import { describe, it, expect } from "vitest";
import {
  canAdmit,
  canViewFinancials,
  canViewSalaries,
  canViewInvoices,
  canManageInvoices,
  canViewBankDetails,
} from "./auth";

describe("canAdmit (invite-only admission)", () => {
  it("admits an existing active user", () => {
    expect(canAdmit({ userExists: true, userActive: true, isBootstrapAdmin: false })).toEqual({ ok: true });
  });
  it("rejects an existing but deactivated user", () => {
    expect(canAdmit({ userExists: true, userActive: false, isBootstrapAdmin: false })).toEqual({ ok: false, reason: "deactivated" });
  });
  it("rejects an unknown (uninvited) user", () => {
    expect(canAdmit({ userExists: false, userActive: false, isBootstrapAdmin: false })).toEqual({ ok: false, reason: "not-invited" });
  });
  it("admits a bootstrap admin even when not yet invited", () => {
    expect(canAdmit({ userExists: false, userActive: false, isBootstrapAdmin: true })).toEqual({ ok: true });
  });
  it("still rejects a deactivated user even if listed as bootstrap admin", () => {
    // An explicitly deactivated account is not silently re-admitted.
    expect(canAdmit({ userExists: true, userActive: false, isBootstrapAdmin: true })).toEqual({ ok: false, reason: "deactivated" });
  });
});

describe("role permissions", () => {
  it("financial views exclude employees", () => {
    expect(canViewFinancials("MANAGEMENT")).toBe(true);
    expect(canViewFinancials("EMPLOYEE")).toBe(false);
  });
  it("salary + invoice management restricted to admin/finance", () => {
    expect(canViewSalaries("FINANCE")).toBe(true);
    expect(canViewSalaries("MANAGEMENT")).toBe(false);
    expect(canManageInvoices("MANAGEMENT")).toBe(false);
    expect(canManageInvoices("ADMIN")).toBe(true);
    expect(canViewBankDetails("MANAGEMENT")).toBe(false);
  });
  it("management can view invoices but not employees", () => {
    expect(canViewInvoices("MANAGEMENT")).toBe(true);
    expect(canViewInvoices("EMPLOYEE")).toBe(false);
  });
});
