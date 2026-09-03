---
description: Set up (if needed) and run Financial Hub locally on http://localhost:3000
---

Get Financial Hub running locally. Work through these steps, skipping any that
are already satisfied — don't redo setup that's already in place.

## 1. Preconditions

- **Node 20+**: `node --version`.
- **PostgreSQL**: check `pg_isready`. If not running, start it:
  `brew services start postgresql@14` (adjust the version if needed). The
  default `DATABASE_URL` expects a `financial_hub` role + database with password
  `financial_hub`. Create them if missing:
  ```bash
  psql -d postgres -c "CREATE ROLE financial_hub WITH LOGIN PASSWORD 'financial_hub' CREATEDB;"
  psql -d postgres -c "CREATE DATABASE financial_hub OWNER financial_hub;"
  ```

## 2. Dependencies

If `node_modules` is missing, run `npm install`.

## 3. Environment

If `.env` is missing, copy it from `.env.example` and fill in secrets:
- `AUTH_SECRET` → `openssl rand -base64 48`
- `TOKEN_ENCRYPTION_KEY` → `openssl rand -base64 32`

Leave the `GOOGLE_*` vars blank — without them the app runs on seeded demo data
with the dev login (Phase 2 Google Sheets sync stays disabled, which is fine for
local use). Keep `DATABASE_URL` as the default unless the user has a different
Postgres.

## 4. Database

Apply migrations, generate the client, and seed demo data if the DB is empty:
```bash
npm run db:migrate
npm run db:seed
```
Use `npm run db:reset` only if the user wants a clean re-seed.

## 5. Run

Start the dev server **in the background** so it keeps running:
```bash
npm run dev
```
Poll `http://localhost:3000/` until it responds (an unauthenticated request
returns a 307 redirect to the sign-in page — that means it's healthy).

## 6. Report

Tell the user the app is up at http://localhost:3000 and list the seeded dev
logins:

| Email | Role |
| --- | --- |
| admin@financialhub.dev | Admin |
| finance@financialhub.dev | Finance |
| mgmt@financialhub.dev | Management |
| employee@financialhub.dev | Employee |
