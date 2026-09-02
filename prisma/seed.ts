import { PrismaClient, Role, PaymentStatus, RevenueStatus } from "@prisma/client";

const prisma = new PrismaClient();

// Deterministic pseudo-random so seeds are reproducible.
let _s = 42;
function rng(): number {
  _s = (_s * 1103515245 + 12345) & 0x7fffffff;
  return _s / 0x7fffffff;
}
function pick<T>(arr: T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}
function vary(base: number, pct = 0.15): number {
  return Math.round(base * (1 + (rng() - 0.5) * 2 * pct));
}

const YEAR = 2026;
// Seed Feb..Sep so the current month (Sep 2026) has data and trends exist.
const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8]; // 0-indexed months (Feb..Sep)

function monthDate(m0: number, day = 1): Date {
  return new Date(Date.UTC(YEAR, m0, day));
}

async function main() {
  console.log("Resetting seed data…");
  // Order matters for FKs.
  await prisma.payment.deleteMany();
  await prisma.revenue.deleteMany();
  await prisma.teamCost.deleteMany();
  await prisma.teamMember.deleteMany();
  await prisma.client.deleteMany();
  await prisma.subscription.deleteMany();
  await prisma.expense.deleteMany();
  await prisma.exchangeRate.deleteMany();
  await prisma.dataQualityIssue.deleteMany();
  await prisma.syncRun.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.user.deleteMany();

  // --- Users (one per role) ---
  const users = [
    { email: "admin@financialhub.dev", name: "Ava Admin", role: Role.ADMIN },
    { email: "finance@financialhub.dev", name: "Frank Finance", role: Role.FINANCE },
    { email: "mgmt@financialhub.dev", name: "Maya Management", role: Role.MANAGEMENT },
    { email: "employee@financialhub.dev", name: "Eli Employee", role: Role.EMPLOYEE },
  ];
  for (const u of users) await prisma.user.create({ data: u });
  console.log(`Created ${users.length} users`);

  // --- Exchange rates (USD base; PKR ~ 278/USD) ---
  await prisma.exchangeRate.create({
    data: { date: monthDate(0, 1), currency: "PKR", rateToUsd: 0.0036, notes: "Seed rate" },
  });
  await prisma.exchangeRate.create({
    data: { date: monthDate(5, 1), currency: "PKR", rateToUsd: 0.0035, notes: "Mid-year update" },
  });

  // --- Clients ---
  const clientDefs = [
    { key: "CL-001", name: "Northwind Traders", source: "Upwork", lead: "Sarah K.", am: "Frank Finance" },
    { key: "CL-002", name: "Acme Robotics", source: "Referral", lead: "Sarah K.", am: "Maya Management" },
    { key: "CL-003", name: "Globex Media", source: "Upwork", lead: "Bilal A.", am: "Frank Finance" },
    { key: "CL-004", name: "Initech Systems", source: "Direct", lead: "Bilal A.", am: "Maya Management" },
    { key: "CL-005", name: "Umbrella Health", source: "Upwork", lead: "Sarah K.", am: "Frank Finance" },
  ];
  const clients: Record<string, string> = {};
  for (let i = 0; i < clientDefs.length; i++) {
    const c = clientDefs[i];
    const created = await prisma.client.create({
      data: {
        clientKey: c.key,
        name: c.name,
        source: c.source,
        lead: c.lead,
        accountManager: c.am,
        active: true,
        startDate: monthDate(0, 1),
        source_system: "seed",
        sourceSheet: "Clients",
        sourceRow: i + 2,
        lastSyncedAt: new Date(),
      },
    });
    clients[c.key] = created.id;
  }
  console.log(`Created ${clientDefs.length} clients`);

  // --- Revenue + Payments ---
  const projects = ["Website Revamp", "Mobile App", "API Platform", "Data Migration", "Support Retainer"];
  const phases = ["Discovery", "Design", "Development", "QA", "Delivery"];
  const methods = ["Upwork", "Wire", "PayPal"];
  // Baseline monthly revenue per client (USD).
  const baseline: Record<string, number> = {
    "CL-001": 9000,
    "CL-002": 14000,
    "CL-003": 6000,
    "CL-004": 11000,
    "CL-005": 4500,
  };

  let revCount = 0;
  let payCount = 0;
  let revSeq = 0;
  let paySeq = 0;

  for (const m0 of MONTHS) {
    for (const c of clientDefs) {
      // Not every client bills every month.
      if (rng() < 0.15) continue;
      const amount = vary(baseline[c.key]);
      revSeq++;
      const revenueKey = `REV-${String(revSeq).padStart(5, "0")}`;

      // Payment status: older months mostly paid, recent months more pending.
      const monthsAgo = 8 - m0;
      let paymentStatus: PaymentStatus;
      if (monthsAgo >= 3) paymentStatus = rng() < 0.9 ? PaymentStatus.PAID : PaymentStatus.PARTIAL;
      else if (monthsAgo === 2) paymentStatus = pick([PaymentStatus.PAID, PaymentStatus.PARTIAL, PaymentStatus.PENDING]);
      else paymentStatus = pick([PaymentStatus.PENDING, PaymentStatus.PARTIAL, PaymentStatus.PENDING]);

      const receivedDate =
        paymentStatus === PaymentStatus.PAID ? monthDate(Math.min(m0 + 1, 8), 15) : null;

      const rev = await prisma.revenue.create({
        data: {
          revenueKey,
          date: monthDate(m0, 5),
          month: monthDate(m0, 1),
          project: pick(projects),
          phase: pick(phases),
          amount,
          currency: "USD",
          status: RevenueStatus.CONFIRMED,
          paymentStatus,
          receivedDate,
          expectedDate: monthDate(Math.min(m0 + 1, 8), 28),
          paymentMethod: pick(methods),
          lead: c.lead,
          developer: pick(["Zed", "Omar", "Nadia", "Priya", "Hassan"]),
          clientId: clients[c.key],
          source_system: "seed",
          sourceSheet: "Revenue",
          sourceRow: revSeq + 1,
          lastSyncedAt: new Date(),
        },
      });
      revCount++;

      // Payment rows: PAID -> one full payment; PARTIAL -> one partial payment.
      if (paymentStatus === PaymentStatus.PAID) {
        paySeq++;
        await prisma.payment.create({
          data: {
            paymentKey: `PAY-${String(paySeq).padStart(5, "0")}`,
            date: receivedDate ?? monthDate(m0, 20),
            amount,
            currency: "USD",
            method: rev.paymentMethod,
            status: "CLEARED",
            clientId: clients[c.key],
            revenueId: rev.id,
            source_system: "seed",
            sourceSheet: "Payments",
            sourceRow: paySeq + 1,
            lastSyncedAt: new Date(),
          },
        });
        payCount++;
      } else if (paymentStatus === PaymentStatus.PARTIAL) {
        paySeq++;
        await prisma.payment.create({
          data: {
            paymentKey: `PAY-${String(paySeq).padStart(5, "0")}`,
            date: monthDate(Math.min(m0 + 1, 8), 10),
            amount: Math.round(amount * 0.5),
            currency: "USD",
            method: rev.paymentMethod,
            status: "CLEARED",
            clientId: clients[c.key],
            revenueId: rev.id,
            source_system: "seed",
            sourceSheet: "Payments",
            sourceRow: paySeq + 1,
            lastSyncedAt: new Date(),
          },
        });
        payCount++;
      }
    }
  }
  console.log(`Created ${revCount} revenue records, ${payCount} payments`);

  // --- Team members + monthly costs ---
  const team = [
    { key: "EMP-001", name: "Zed Khan", salary: 3200, overhead: 480, currency: "USD" },
    { key: "EMP-002", name: "Omar Farooq", salary: 2800, overhead: 420, currency: "USD" },
    { key: "EMP-003", name: "Nadia Sheikh", salary: 260000, overhead: 40000, currency: "PKR" },
    { key: "EMP-004", name: "Priya Nair", salary: 3500, overhead: 525, currency: "USD" },
    { key: "EMP-005", name: "Hassan Ali", salary: 220000, overhead: 33000, currency: "PKR" },
  ];
  let costSeq = 0;
  for (let i = 0; i < team.length; i++) {
    const t = team[i];
    const member = await prisma.teamMember.create({
      data: {
        employeeKey: t.key,
        name: t.name,
        active: true,
        source_system: "seed",
        sourceSheet: "Team",
        sourceRow: i + 2,
        lastSyncedAt: new Date(),
      },
    });
    for (const m0 of MONTHS) {
      costSeq++;
      await prisma.teamCost.create({
        data: {
          costKey: `${t.key}-${YEAR}-${String(m0 + 1).padStart(2, "0")}`,
          month: monthDate(m0, 1),
          salary: t.salary,
          overhead: t.overhead,
          currency: t.currency,
          teamMemberId: member.id,
          source_system: "seed",
          sourceSheet: "Team",
          sourceRow: costSeq + 1,
          lastSyncedAt: new Date(),
        },
      });
    }
  }
  console.log(`Created ${team.length} team members with monthly costs`);

  // --- Subscriptions ---
  const subs = [
    { key: "SUB-001", name: "Google Workspace", owner: "Ava Admin", category: "Productivity", cost: 180, currency: "USD" },
    { key: "SUB-002", name: "ClickUp", owner: "Maya Management", category: "Project Management", cost: 90, currency: "USD" },
    { key: "SUB-003", name: "Jira", owner: "Maya Management", category: "Project Management", cost: 75, currency: "USD" },
    { key: "SUB-004", name: "Confluence", owner: "Maya Management", category: "Project Management", cost: 55, currency: "USD" },
    { key: "SUB-005", name: "Bitbucket", owner: "Zed Khan", category: "Development", cost: 30, currency: "USD" },
    { key: "SUB-006", name: "Cursor", owner: "Zed Khan", category: "Development", cost: 80, currency: "USD" },
    { key: "SUB-007", name: "Claude", owner: "Ava Admin", category: "AI", cost: 100, currency: "USD" },
    { key: "SUB-008", name: "ChatGPT", owner: "Ava Admin", category: "AI", cost: 60, currency: "USD" },
    { key: "SUB-009", name: "IONOS / VPS", owner: "Zed Khan", category: "Hosting", cost: 12000, currency: "PKR" },
  ];
  for (let i = 0; i < subs.length; i++) {
    const s = subs[i];
    await prisma.subscription.create({
      data: {
        subscriptionKey: s.key,
        name: s.name,
        owner: s.owner,
        category: s.category,
        monthlyCost: s.cost,
        currency: s.currency,
        startDate: monthDate(0, 1),
        renewalDate: monthDate(pick(MONTHS), pick([1, 5, 12, 20])),
        active: true,
        source_system: "seed",
        sourceSheet: "Subscriptions",
        sourceRow: i + 2,
        lastSyncedAt: new Date(),
      },
    });
  }
  console.log(`Created ${subs.length} subscriptions`);

  // --- Other expenses ---
  const expenseCats = ["Office", "Legal", "Marketing", "Equipment", "Travel"];
  let expSeq = 0;
  for (const m0 of MONTHS) {
    const n = 1 + Math.floor(rng() * 2);
    for (let i = 0; i < n; i++) {
      expSeq++;
      const cat = pick(expenseCats);
      await prisma.expense.create({
        data: {
          expenseKey: `EXP-${String(expSeq).padStart(5, "0")}`,
          date: monthDate(m0, pick([5, 12, 22])),
          month: monthDate(m0, 1),
          category: cat,
          description: `${cat} expense`,
          amount: vary(600, 0.5),
          currency: "USD",
          paid: rng() < 0.85,
          source_system: "seed",
          sourceSheet: "Other Expenses",
          sourceRow: expSeq + 1,
          lastSyncedAt: new Date(),
        },
      });
    }
  }
  console.log(`Created ${expSeq} other expenses`);

  // --- A representative sync run (so "Last synced" has data) ---
  const started = new Date(Date.now() - 2 * 60 * 1000);
  await prisma.syncRun.create({
    data: {
      startedAt: started,
      finishedAt: new Date(started.getTime() + 4000),
      status: "SUCCESS",
      rowsRead: revCount + payCount + team.length + subs.length + expSeq,
      rowsCreated: revCount + payCount,
      rowsUpdated: 0,
      rowsRejected: 0,
      errorCount: 0,
      message: "Seed baseline import",
    },
  });

  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
