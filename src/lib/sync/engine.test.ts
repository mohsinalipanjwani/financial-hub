import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { InMemorySheetSource } from "@/lib/google/sheets";
import { runSync } from "./engine";

// Integration test against the real database. It only touches google-sourced
// rows (distinct "T*" business keys) and cleans them up, leaving seed data intact.

const CLIENTS = [
  ["Client ID", "Client Name", "Source", "Lead", "Account Manager", "Active", "Start Date", "Notes"],
  ["TCL-1", "Test Alpha", "Upwork", "Sam", "Fin", "Yes", "2026-01-01", ""],
  ["TCL-2", "Test Beta", "Referral", "Sam", "Fin", "Yes", "2026-01-01", ""],
];

const REVENUE = [
  ["Revenue ID", "Date", "Client", "Project", "Phase", "Month", "Amount", "Currency", "Status", "Payment Status", "Received Date", "Expected Date", "Payment Method", "Lead", "Developer", "Notes"],
  ["TREV-1", "2026-09-05", "TCL-1", "Web", "Dev", "2026-09", "1000", "USD", "Confirmed", "Pending", "", "2026-10-01", "Wire", "Sam", "Zed", ""],
  ["TREV-2", "2026-09-06", "TCL-2", "App", "QA", "2026-09", "2000", "USD", "Confirmed", "Paid", "2026-09-20", "", "Wire", "Sam", "Omar", ""],
];

const PAYMENTS = [
  ["Payment ID", "Date", "Client", "Revenue ID", "Amount", "Currency", "Method", "Status", "Notes"],
  ["TPAY-1", "2026-09-20", "TCL-2", "TREV-2", "2000", "USD", "Wire", "Cleared", ""],
];

const TEAM = [
  ["Employee ID", "Employee", "Month", "Salary", "Overhead", "Currency", "Active", "Notes"],
  ["TEMP-1", "Test Emp", "2026-09", "3000", "500", "USD", "Yes", ""],
];

const SUBSCRIPTIONS = [
  ["Subscription ID", "Subscription", "Owner", "Category", "Monthly Cost", "Currency", "Start Date", "Renewal Date", "Active", "Notes"],
  ["TSUB-1", "TestTool", "Admin", "AI", "100", "USD", "2026-01-01", "2026-12-01", "Yes", ""],
];

const EXPENSES = [
  ["Expense ID", "Date", "Category", "Description", "Amount", "Currency", "Paid", "Notes"],
  ["TEXP-1", "2026-09-10", "Office", "Chairs", "600", "USD", "Yes", ""],
];

const EXCHANGE = [["Date", "Currency", "Rate to USD", "Notes"]]; // header only

function buildSheet(revenue = REVENUE, clients = CLIENTS) {
  return new InMemorySheetSource({
    Clients: clients,
    Revenue: revenue,
    Payments: PAYMENTS,
    Team: TEAM,
    Subscriptions: SUBSCRIPTIONS,
    "Other Expenses": EXPENSES,
    "Exchange Rates": EXCHANGE,
  });
}

async function cleanup() {
  await prisma.payment.deleteMany({ where: { source_system: "google" } });
  await prisma.revenue.deleteMany({ where: { source_system: "google" } });
  await prisma.teamCost.deleteMany({ where: { source_system: "google" } });
  await prisma.teamMember.deleteMany({ where: { source_system: "google" } });
  await prisma.subscription.deleteMany({ where: { source_system: "google" } });
  await prisma.expense.deleteMany({ where: { source_system: "google" } });
  await prisma.client.deleteMany({ where: { source_system: "google" } });
}

const googleCount = () => prisma.client.count({ where: { source_system: "google", archived: false } });

describe("sync engine", () => {
  beforeAll(cleanup);
  afterAll(cleanup);

  it("imports rows on first run", async () => {
    const res = await runSync(buildSheet());
    expect(res.status).toBe("SUCCESS");
    expect(res.rowsRejected).toBe(0);
    expect(await googleCount()).toBe(2);
    const rev = await prisma.revenue.findUnique({ where: { revenueKey: "TREV-1" } });
    expect(rev).not.toBeNull();
    expect(Number(rev!.amount)).toBe(1000);
    // Payment linked to its revenue
    const pay = await prisma.payment.findUnique({ where: { paymentKey: "TPAY-1" }, include: { revenue: true } });
    expect(pay?.revenue?.revenueKey).toBe("TREV-2");
    // Team member + cost created
    expect(await prisma.teamCost.count({ where: { source_system: "google" } })).toBe(1);
  });

  it("is idempotent — a second identical sync creates nothing and duplicates nothing", async () => {
    const before = await prisma.revenue.count({ where: { source_system: "google" } });
    const res = await runSync(buildSheet());
    expect(res.status).toBe("SUCCESS");
    expect(res.rowsCreated).toBe(0); // everything already exists -> all updates
    expect(res.rowsUpdated).toBeGreaterThan(0);
    const after = await prisma.revenue.count({ where: { source_system: "google" } });
    expect(after).toBe(before); // no duplicate financial records
    expect(await googleCount()).toBe(2);
  });

  it("updates a changed row in place", async () => {
    const changed = REVENUE.map((r) => [...r]);
    changed[1][6] = "1500"; // TREV-1 amount 1000 -> 1500
    await runSync(buildSheet(changed));
    const rev = await prisma.revenue.findUnique({ where: { revenueKey: "TREV-1" } });
    expect(Number(rev!.amount)).toBe(1500);
    // still exactly one record for that key
    expect(await prisma.revenue.count({ where: { revenueKey: "TREV-1" } })).toBe(1);
  });

  it("soft-archives rows that disappear from the sheet, never hard-deletes", async () => {
    const fewer = [REVENUE[0], REVENUE[1]]; // drop TREV-2
    await runSync(buildSheet(fewer));
    const gone = await prisma.revenue.findUnique({ where: { revenueKey: "TREV-2" } });
    expect(gone).not.toBeNull(); // still present…
    expect(gone!.archived).toBe(true); // …but archived
    const alive = await prisma.revenue.findUnique({ where: { revenueKey: "TREV-1" } });
    expect(alive!.archived).toBe(false);
  });

  it("rejects invalid rows and reports PARTIAL without aborting the run", async () => {
    const withBad = REVENUE.map((r) => [...r]);
    withBad.push(["TREV-3", "2026-09-07", "TCL-1", "X", "Dev", "2026-09", "", "USD", "Confirmed", "Pending", "", "", "", "", "", ""]); // missing amount
    const res = await runSync(buildSheet(withBad));
    expect(res.status).toBe("PARTIAL");
    expect(res.rowsRejected).toBe(1);
    expect(res.rejects[0].errors.join(" ")).toMatch(/Amount/);
    // The good rows still synced
    expect(await prisma.revenue.count({ where: { revenueKey: "TREV-1" } })).toBe(1);
  });

  it("rejects a revenue row referencing an unknown client", async () => {
    const badClient = REVENUE.map((r) => [...r]);
    badClient.push(["TREV-9", "2026-09-07", "NOPE", "X", "Dev", "2026-09", "500", "USD", "Confirmed", "Pending", "", "", "", "", "", ""]);
    const res = await runSync(buildSheet(badClient));
    expect(res.rejects.some((r) => r.errors.join(" ").includes("Unknown client"))).toBe(true);
  });
});
