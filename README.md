# Financial Hub

An internal, management-facing financial dashboard. Google Sheets stays the
team's data-entry system; Financial Hub syncs that data into a normalized
PostgreSQL database and presents a fast, visual view of revenue, costs, profit,
and client performance.

> **Status: Phase 1** — database, authentication, financial calculations, and
> the full dashboard, running on seeded demo data. Google OAuth and live Google
> Sheets sync are Phase 2.

## What a manager can answer in ~10 seconds

How much did we earn · received · pending · spending — team, subscriptions,
other expenses — net profit · profit margin · which clients drive revenue · and
whether revenue/profit is trending up or down.

## Tech stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4 · Recharts ·
PostgreSQL · Prisma 6 · Vitest.

## Getting started

### 1. Prerequisites

- Node.js 20+
- A running PostgreSQL instance

### 2. Configure environment

```bash
cp .env.example .env
# edit .env: set DATABASE_URL and a long random AUTH_SECRET
```

### 3. Install, migrate, seed

```bash
npm install
npm run db:migrate     # apply the schema
npm run db:seed        # load realistic demo data
```

### 4. Run

```bash
npm run dev            # http://localhost:3000
```

Sign in as any seeded user to explore role-based access:

| Email                          | Role       |
| ------------------------------ | ---------- |
| admin@financialhub.dev         | Admin      |
| finance@financialhub.dev       | Finance    |
| mgmt@financialhub.dev          | Management |
| employee@financialhub.dev      | Employee   |

## Scripts

| Command             | Description                              |
| ------------------- | ---------------------------------------- |
| `npm run dev`       | Start the dev server                     |
| `npm run build`     | Production build (runs the TS type-check)|
| `npm test`          | Run financial-calculation unit tests     |
| `npm run db:migrate`| Apply Prisma migrations                  |
| `npm run db:seed`   | Seed demo data                           |
| `npm run db:reset`  | Reset the database and re-seed           |

## Tests

Financial calculations are pure functions with unit tests (revenue, received,
pending, team/subscription/expense costs, net profit, margin, currency
conversion, partial payments, zero-revenue safety):

```bash
npm test
```

## Documentation

- [`docs/architecture.md`](docs/architecture.md) — system design & principles
- [`docs/data-model.md`](docs/data-model.md) — database schema & calculations
- [`docs/google-sheets-schema.md`](docs/google-sheets-schema.md) — master sheet

## Pages

Overview (default) · Clients (+ detail) · Revenue · Team · Subscriptions ·
Expenses · Payments · P&L · Data Quality · Settings.

## Roadmap

- **Phase 1 (done):** schema, auth + RBAC, dashboard, all pages, calculation
  tests, seeded data.
- **Phase 2 (done):** Google OAuth sign-in, encrypted token storage, Google
  Sheets connection, idempotent sync engine (upsert by business key,
  soft-archive, rejects), sync history, and column mapping. See
  [`docs/google-oauth-and-sync.md`](docs/google-oauth-and-sync.md).
- **Phase 3 (done):** advanced client analytics (collection rate, days-to-pay,
  aging), CSV exports (Revenue/Payments/Clients/P&L), the Excel/CSV
  import & migration utility (dry-run report → commit), an audit-log page, and
  role management (Admin).
- **Later:** scheduled/background sync, exportable PDF reports, per-field column
  mapping UI.

## Google Sheets sync (Phase 2)

Configure the Google env vars (see `.env.example` and
[`docs/google-oauth-and-sync.md`](docs/google-oauth-and-sync.md)), sign in with
Google, then set the spreadsheet ID and **Sync now** from Settings. Without
those vars the app runs on seeded data with the dev login. Sync is idempotent —
re-running never duplicates records — and vanished rows are soft-archived, never
deleted.
