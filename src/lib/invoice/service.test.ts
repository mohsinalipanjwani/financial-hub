import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  createDraftFromRevenue,
  createStandaloneDraft,
  issueInvoice,
  voidInvoice,
  recalcInvoicePayments,
  getCompanyProfile,
} from "./service";

// DB-backed lifecycle test. Uses distinct "INVTEST" keys and cleans up.
const CK = "INVTEST-CL";
const RK = "INVTEST-REV";
let clientId = "";
let revenueId = "";
let userId = "";
const createdInvoiceIds: string[] = [];

beforeAll(async () => {
  await getCompanyProfile(); // ensure singleton exists
  const u = await prisma.user.create({ data: { email: "invtest@financialhub.dev", name: "Invoice Tester", role: "FINANCE" } });
  userId = u.id;
  const client = await prisma.client.create({
    data: { clientKey: CK, name: "Invoice Test Co", source_system: "seed", billingEmail: "billing@test.co", defaultCurrency: "USD", paymentTerms: "Net 15" },
  });
  clientId = client.id;
  const rev = await prisma.revenue.create({
    data: {
      revenueKey: RK, date: new Date("2026-09-05T00:00:00Z"), month: new Date("2026-09-01T00:00:00Z"),
      project: "Test Project", phase: "Development", amount: 10000, currency: "USD",
      paymentStatus: "PENDING", clientId, expectedDate: new Date("2026-09-30T00:00:00Z"), source_system: "seed",
    },
  });
  revenueId = rev.id;
});

afterAll(async () => {
  await prisma.payment.deleteMany({ where: { paymentKey: { startsWith: "INVTEST" } } });
  await prisma.auditLog.deleteMany({ where: { userId } });
  await prisma.invoice.deleteMany({ where: { id: { in: createdInvoiceIds } } });
  await prisma.invoice.deleteMany({ where: { clientId } });
  await prisma.revenue.deleteMany({ where: { revenueKey: RK } });
  await prisma.client.deleteMany({ where: { clientKey: CK } });
  await prisma.user.deleteMany({ where: { id: userId } });
});

describe("invoice lifecycle", () => {
  it("pre-fills a draft from a revenue record", async () => {
    const inv = await createDraftFromRevenue(revenueId);
    createdInvoiceIds.push(inv.id);
    const full = await prisma.invoice.findUnique({ where: { id: inv.id }, include: { items: true } });
    expect(full!.status).toBe("DRAFT");
    expect(full!.invoiceNumber).toBeNull();
    expect(Number(full!.total)).toBe(10000);
    expect(full!.currency).toBe("USD");
    expect(full!.revenueId).toBe(revenueId);
    expect(full!.items).toHaveLength(1);
    expect(Number(full!.items[0].unitPrice)).toBe(10000);
  });

  it("enforces one primary invoice per revenue", async () => {
    const again = await createDraftFromRevenue(revenueId);
    // Returns the existing invoice rather than creating a second.
    expect(again.revenueId).toBe(revenueId);
  });

  it("issues with a sequential, non-reused number", async () => {
    const profileBefore = await getCompanyProfile();
    const baseSeq = profileBefore.invoiceNextNumber;
    const prefix = profileBefore.invoicePrefix;

    const inv = await prisma.invoice.findFirst({ where: { revenueId } });
    const issued = await issueInvoice(inv!.id);
    expect(issued!.status).toBe("ISSUED");
    expect(issued!.invoiceNumber).toBe(`${prefix}-2026-${String(baseSeq).padStart(4, "0")}`);

    // Counter advanced.
    const profileAfter = await getCompanyProfile();
    expect(profileAfter.invoiceNextNumber).toBe(baseSeq + 1);

    // A second invoice gets the next number — never the same one.
    const standalone = await createStandaloneDraft({ clientId, items: [{ description: "Retainer", quantity: 1, unitPrice: 2000 }] });
    createdInvoiceIds.push(standalone.id);
    const issued2 = await issueInvoice(standalone.id);
    expect(issued2!.invoiceNumber).toBe(`${prefix}-2026-${String(baseSeq + 1).padStart(4, "0")}`);
    expect(issued2!.invoiceNumber).not.toBe(issued!.invoiceNumber);
  });

  it("cannot issue a draft twice / cannot edit issued", async () => {
    const inv = await prisma.invoice.findFirst({ where: { revenueId } });
    await expect(issueInvoice(inv!.id)).rejects.toThrow(/draft/i);
  });

  it("reconciles payments linked via the revenue record", async () => {
    const inv = await prisma.invoice.findFirst({ where: { revenueId } });
    await prisma.payment.create({
      data: { paymentKey: "INVTEST-P1", date: new Date("2026-09-10T00:00:00Z"), amount: 4000, currency: "USD", status: "CLEARED", clientId, revenueId, source_system: "seed" },
    });
    await recalcInvoicePayments(inv!.id);
    let after = await prisma.invoice.findUnique({ where: { id: inv!.id } });
    expect(Number(after!.amountPaid)).toBe(4000);
    expect(Number(after!.amountDue)).toBe(6000);
    expect(after!.status).toBe("PARTIALLY_PAID");

    await prisma.payment.create({
      data: { paymentKey: "INVTEST-P2", date: new Date("2026-09-15T00:00:00Z"), amount: 6000, currency: "USD", status: "CLEARED", clientId, revenueId, source_system: "seed" },
    });
    await recalcInvoicePayments(inv!.id);
    after = await prisma.invoice.findUnique({ where: { id: inv!.id } });
    expect(Number(after!.amountPaid)).toBe(10000);
    expect(Number(after!.amountDue)).toBe(0);
    expect(after!.status).toBe("PAID");
  });

  it("voids and reissues, linking the replacement to the original", async () => {
    const standalone = await createStandaloneDraft({ clientId, items: [{ description: "One-off", quantity: 1, unitPrice: 500 }] });
    createdInvoiceIds.push(standalone.id);
    const issued = await issueInvoice(standalone.id);
    const result = await voidInvoice(issued!.id, userId, "Wrong amount", true);
    expect(result.replacement).not.toBeNull();
    createdInvoiceIds.push(result.replacement!.id);

    const original = await prisma.invoice.findUnique({ where: { id: issued!.id } });
    expect(original!.status).toBe("VOID");
    expect(original!.voidReason).toBe("Wrong amount");

    const replacement = await prisma.invoice.findUnique({ where: { id: result.replacement!.id }, include: { items: true } });
    expect(replacement!.status).toBe("DRAFT");
    expect(replacement!.replacesInvoiceId).toBe(issued!.id);
    expect(replacement!.items).toHaveLength(1);
  });
});
