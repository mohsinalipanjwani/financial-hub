import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { InMemorySheetSource } from "@/lib/google/sheets";
import { previewSync } from "./preview";

const CLIENTS = [
  ["Client ID", "Client Name", "Source", "Active"],
  ["PCL-1", "Preview Co", "Upwork", "Yes"],
];
const REVENUE = [
  ["Revenue ID", "Date", "Client", "Month", "Amount", "Currency", "Payment Status"],
  ["PREV-1", "2026-09-05", "PCL-1", "2026-09", "1000", "USD", "Pending"], // ok, new client in file
  ["PREV-2", "2026-09-06", "GHOST", "2026-09", "1000", "USD", "Pending"], // unknown client
  ["PREV-3", "2026-09-07", "PCL-1", "2026-09", "", "USD", "Pending"], // missing amount
];

function sheet() {
  return new InMemorySheetSource({ Clients: CLIENTS, Revenue: REVENUE });
}

describe("previewSync (dry-run)", () => {
  afterAll(async () => {
    // Safety: ensure nothing leaked in (preview must not write).
    await prisma.client.deleteMany({ where: { clientKey: "PCL-1" } });
    await prisma.revenue.deleteMany({ where: { revenueKey: { in: ["PREV-1", "PREV-2", "PREV-3"] } } });
  });

  it("reports create/update/reject without writing to the database", async () => {
    const clientsBefore = await prisma.client.count();
    const revenueBefore = await prisma.revenue.count();

    const report = await previewSync(sheet());

    // No writes happened.
    expect(await prisma.client.count()).toBe(clientsBefore);
    expect(await prisma.revenue.count()).toBe(revenueBefore);

    const clientPrev = report.entities.find((e) => e.entity === "client")!;
    expect(clientPrev.toCreate).toBe(1);

    const revPrev = report.entities.find((e) => e.entity === "revenue")!;
    expect(revPrev.toCreate).toBe(1); // PREV-1 (client resolved from the same file)
    expect(revPrev.rejected).toHaveLength(2); // GHOST client + missing amount
    const reasons = revPrev.rejected.flatMap((r) => r.errors).join(" ");
    expect(reasons).toMatch(/Unknown client/);
    expect(reasons).toMatch(/Amount/);
  });

  it("counts existing keys as updates", async () => {
    // Seed one client so the same key previews as an update.
    await prisma.client.create({ data: { clientKey: "PCL-1", name: "Preview Co", source_system: "import" } });
    const report = await previewSync(sheet());
    const clientPrev = report.entities.find((e) => e.entity === "client")!;
    expect(clientPrev.toUpdate).toBe(1);
    expect(clientPrev.toCreate).toBe(0);
  });
});
