# Google OAuth & Sheets Sync (Phase 2)

Phase 2 connects the master Google Sheet to the database through a real OAuth
flow and an idempotent sync engine. The dashboard still reads only from the
database — the sheet is never queried on a page request.

```
Google Sheets → OAuth (read-only) → Sync engine → Validate → Normalize → Database → Dashboard
```

## Setup

1. **Create OAuth credentials** in Google Cloud Console → APIs & Services →
   Credentials → *OAuth client ID* (type: Web application).
   - Authorized redirect URI: `{APP_URL}/api/auth/google/callback`
     (e.g. `http://localhost:3000/api/auth/google/callback`).
   - Enable the **Google Sheets API** for the project.
2. **Set environment variables** (see `.env.example`):
   - `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
   - `APP_URL` (public base URL, used to build the redirect URI)
   - `TOKEN_ENCRYPTION_KEY` (32 bytes; `openssl rand -base64 32`) — encrypts
     stored tokens at rest
   - `ADMIN_EMAILS` (comma-separated) — bootstrapped to ADMIN on first login
   - `GOOGLE_SHEETS_SPREADSHEET_ID` (optional; can be set from Settings)
3. **Sign in with Google** on the login page, granting read-only Sheets access.
4. On **Settings → Google Sheets Sync**, set the master spreadsheet ID and click
   **Sync now** (Finance/Admin only).

If Google is not configured, the app runs on seeded data with the dev login —
nothing breaks.

## OAuth flow

- `GET /api/auth/google/start` — sets a CSRF `state` cookie and redirects to the
  Google consent screen (`access_type=offline` to obtain a refresh token).
- `GET /api/auth/google/callback` — verifies `state`, exchanges the code for
  tokens, fetches the user's profile, upserts the `User` (role from
  `ADMIN_EMAILS`, else EMPLOYEE), creates the session, and stores the connection
  (tokens **encrypted** via AES-256-GCM) for syncing.

Secrets never reach the browser; only the consent URL is exposed. Access tokens
are refreshed transparently (`getValidAccessToken`) and re-encrypted on refresh.

## Sync engine (`src/lib/sync/engine.ts`)

Driven by a `SheetSource` interface, so it runs against a real spreadsheet
(`GoogleSheetSource`) or an in-memory fixture (`InMemorySheetSource`) in tests.

Per run it:

1. Reads every master tab (`values.batchGet`).
2. **Maps** columns to canonical fields (`DEFAULT_MAPPINGS`; overridable later
   for flexible column mapping) — header matching is case/space-insensitive.
3. **Validates + normalizes** each row with pure parsers (`parsers.ts`):
   numbers, dates, months, currencies, enums, required fields.
4. **Upserts by stable business key** (`Revenue ID`, `Client ID`, …). Because
   every write is an upsert, **re-syncing the same sheet never duplicates**
   financial records. Foreign keys (`revenue.client_id`,
   `payment.revenue_id`, `team_cost.team_member_id`) are resolved from keys.
5. **Soft-archives** google-sourced records that vanished from the sheet
   (`archived = true`) — never hard-deletes, and never touches seed rows.
   An empty/failed tab never triggers archiving.
6. Records the run in `sync_runs` (read/created/updated/rejected, status,
   timing) and refreshes the data-quality snapshot.

Invalid rows are **rejected and reported** (run status `PARTIAL`) without
aborting the rest of the import.

## Auditability

Every synced record stores `source_system = "google"`, `source_sheet`,
`source_row`, and `last_synced_at`, so Finance can trace any value back to
`Google Sheet → tab → row`. Logins, sync runs, and config changes are written to
`audit_logs`.

## Tests

- `parsers.test.ts` / `mapping.test.ts` — pure parsing, normalization, mapping.
- `engine.test.ts` — full pipeline against the database via an in-memory sheet:
  first import, **idempotency** (second run creates nothing, duplicates
  nothing), in-place updates, **soft-archive** on removal, and rejection of
  invalid rows / unknown client references.
