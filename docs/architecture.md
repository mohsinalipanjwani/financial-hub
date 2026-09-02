# Financial Hub — Architecture

Financial Hub is an internal, management-facing financial dashboard. It is a
**read / analysis / reporting** system. The company's team keeps entering data
in **Google Sheets** (the operational source of truth); Financial Hub syncs
that data into a normalized PostgreSQL database and presents fast, visual
analytics on top of it.

```
Team members → Google Sheets → Financial Hub sync → Database → Dashboard
```

## Guiding principles

- **Google Sheets stays the data-entry system.** Nobody is asked to learn a new
  financial tool. The Hub reads and reports; it does not replace the sheet.
- **The database is a normalized copy, not the source of truth.** Every record
  keeps a pointer back to its origin row (`source_system`, `source_sheet`,
  `source_row`, `last_synced_at`) so Finance can trace any number back to the
  sheet.
- **Never overwrite original money.** Amounts and currencies are stored as
  entered; conversion to the reporting currency happens at read time using the
  exchange-rate table.
- **Calculate at the company level.** No project-level profitability. Profit and
  margin are company-wide; clients are compared on revenue / collection /
  pending / contribution.

## Technology stack

| Layer            | Choice                                             |
| ---------------- | -------------------------------------------------- |
| Framework        | Next.js 16 (App Router) + React 19 + TypeScript    |
| Styling          | Tailwind CSS v4                                     |
| Charts           | Recharts                                            |
| Database         | PostgreSQL                                          |
| ORM              | Prisma 6                                            |
| Auth (Phase 1)   | Signed-cookie session (jose) + dev role login      |
| Auth (Phase 2)   | Google OAuth (planned)                             |
| Tests            | Vitest (financial calculations)                    |

## Application structure

```
src/
  app/
    (dashboard)/            # Authenticated app shell (sidebar + topbar)
      page.tsx              #   Overview (default)
      clients/…            #   Clients list + client detail
      revenue/  team/  subscriptions/  expenses/  payments/
      pnl/  data-quality/  settings/
    login/                  # Dev login (Phase 2: Google OAuth)
    api/auth/{login,logout} # Session endpoints
  components/               # Sidebar, Topbar, KPI cards, charts, filters, UI
  lib/
    prisma.ts              # Prisma client singleton
    auth.ts               # Session + role-based access control
    format.ts             # Currency / date / percent formatting
    finance/
      types.ts            # Pure domain types (no Prisma dependency)
      calculations.ts     # Pure financial functions (unit-tested)
      calculations.test.ts
      period.ts           # Month / quarter / year period resolution
      rates.ts            # Exchange-rate table loader
      service.ts          # DB → calculations → dashboard aggregations
      data-quality.ts     # Data-quality scanning
  middleware.ts            # Route protection (redirects to /login)
prisma/
  schema.prisma           # Relational schema
  migrations/             # SQL migrations
  seed.ts                 # Realistic demo data
```

## The calculation layer (why it's split)

`lib/finance/calculations.ts` contains **pure functions** that take plain
numbers and return plain numbers. They have no database or Prisma dependency,
which makes them fast and trivial to unit-test — and the unit tests are the
contract for the money math (revenue, received, pending, costs, profit, margin,
currency conversion, partial payments).

`lib/finance/service.ts` is the **only** place the UI depends on for numbers. It
loads normalized rows for a period, converts currencies via the rate table, and
applies the pure functions. Because every page routes through this service, the
rules stay identical everywhere.

## Authentication & authorization

Phase 1 uses a signed-cookie session. The login page lets you sign in as any
seeded user to exercise the four roles. `middleware.ts` protects every route
except `/login`. Server components call `requireFinancialAccess()` /
`canViewSalaries()` / `canManageConfig()` — **authorization is enforced on the
server**, never in the browser.

| Role        | Access                                                        |
| ----------- | ------------------------------------------------------------ |
| ADMIN       | Everything                                                   |
| FINANCE     | All financials + sync / configuration + salary detail        |
| MANAGEMENT  | All dashboard / reporting; aggregate team cost, no salaries   |
| EMPLOYEE    | No company-wide financials                                    |

Phase 2 replaces the login route body with the Google OAuth callback; the
session shape and every permission check stay the same.

**Admission is invite-only.** Authorization (what a signed-in person may do) is
separate from admission (who may sign in at all). Google sign-in is refused
unless an **active user record already exists** for that email — i.e. an admin
invited them first (`canAdmit`, unit-tested). The only exception is bootstrap
admins listed in `ADMIN_EMAILS`, so the first admin can get in before anyone is
invited. Admins invite (email + role) and revoke (deactivate) from Settings →
Users & Roles; every invite/role change is audit-logged. The passwordless dev
login is automatically disabled whenever Google OAuth is configured or in
production, so real deployments admit users only through invite-gated Google
sign-in.

## Sync architecture (Phase 2 — implemented)

The dashboard never queries Google Sheets directly. The sync engine
(`src/lib/sync/engine.ts`) reads the master sheet, validates and normalizes
rows, and upserts into the database keyed by stable business IDs (`Revenue ID`,
`Client ID`, …) so re-syncing is **idempotent** — the same row never creates
duplicates. Each run is recorded in `sync_runs` (rows read / created / updated /
rejected, errors, timing) and the topbar shows "Last synced: N minutes ago".
Deletions are soft (`archived`), so history is never lost.

The engine is driven by a `SheetSource` interface (`GoogleSheetSource` for the
live API, `InMemorySheetSource` for tests), which is why the full pipeline is
unit-testable against the database without any network. Google OAuth handles
sign-in and read-only Sheets access; tokens are encrypted at rest. See
[`google-oauth-and-sync.md`](google-oauth-and-sync.md) for the full flow.

Phase 1 seeded data (`source_system = "seed"`) coexists with synced data
(`source_system = "google"`); archiving only ever touches google-sourced rows.

## Data quality

Because many people edit the sheet, `lib/finance/data-quality.ts` scans the
normalized records for problems (missing client/amount/date, duplicate IDs,
paid-without-received-date, unknown currency, missing cost, invalid status). The
count appears as a warning badge in the sidebar and topbar and links to the Data
Quality page.

## Quality & safety

- Zero revenue never divides (margin returns 0).
- Missing exchange rates are surfaced as data-quality issues, not silently
  treated as 1:1.
- Empty periods render clean empty states.
- Financial calculations are covered by unit tests (`npm test`).
