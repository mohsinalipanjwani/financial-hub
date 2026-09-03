# Invoicing Module

An integrated invoice system connected to Clients, Revenue, Projects/Phases, and
Payments. Financial Hub becomes the financial-document layer; Google Sheets stays
the operational data-entry layer.

```
Revenue / standalone → Draft → Preview → Issue → PDF → Payment → Dashboard / P&L
```

## Creating invoices

- **From a Revenue record** — the Revenue page shows a *Generate Invoice* action
  per row. It pre-fills client, billing profile, project, phase, amount,
  currency, dates, and payment terms into an editable draft. A revenue record has
  at most one primary invoice (enforced unique).
- **Standalone** — *Invoices → New Invoice* creates an invoice with no revenue
  link (retainers, monthly services, one-offs, adjustments, custom).

## Lifecycle & statuses

`DRAFT → ISSUED → SENT → PARTIALLY_PAID → PAID`, plus `VOID`. **OVERDUE** is
derived at read time (`due_date < now AND amount_due > 0`) and never stored, so
it can't go stale. Drafts are freely editable; **issued invoices are historical
records** and are not edited — correct them by **voiding and reissuing**
(the replacement links back to the original via `replacesInvoiceId`).

## Numbering

Configured in Settings → Company Billing Profile: `prefix`, `next number`
→ `INV-2026-0001`. Numbers are allocated **atomically at issue time** inside a
transaction, so concurrent issues never collide and discarded drafts never waste
a number. The starting number locks once any invoice has been issued — numbers
are never reused.

## Payments

An invoice has many payments. `amount_paid` / `amount_due` and the paid status
are recomputed (`recalcInvoicePayments`) from cleared payments applied either
directly (`payment.invoiceId`) or via the invoice's revenue record
(`payment.revenueId`), converted to the invoice currency. Sheet-synced payments
are reconciled automatically after every sync.

## PDF

The same HTML template drives the on-screen **preview** (`/api/invoices/:id/preview`,
shown in an iframe) and the **PDF** (rendered server-side with headless Chromium
via Playwright). At issue the PDF is generated and **stored on the invoice**
(`invoice_pdfs`), so a later template change never alters a historical document.
Drafts are rendered on demand. `/api/invoices/:id/pdf` streams the stored bytes
(or renders a draft live).

## Billing profiles

- **Company profile** (single row): identity, address, tax/registration, bank
  details, numbering, footer. Bank/payment fields are only editable by
  Finance/Admin. Entered once, reused on every invoice.
- **Client billing profile**: legal/company name, billing email & contact,
  address, tax/VAT, default currency, terms, invoice notes. Pre-fills invoices.

## Permissions

| Action | Roles |
| --- | --- |
| View invoices | Admin, Finance, Management |
| Create / issue / void / edit billing | Admin, Finance |
| View/edit bank details | Admin, Finance |
| (Employees) | no access |

## Audit trail

Every meaningful action writes to `audit_logs` (created, edited, issued, sent,
downloaded, voided, deleted) with user, timestamp, and invoice id — visible on
the invoice detail page and the Audit Log page.

## Email (architecture only)

*Mark as Sent* records the sent state and audit entry; an `invoice_emails` table
scaffolds Send/Resend/email-history. No email provider is wired in for the MVP —
generate and download the PDF instead.

## Data model

`invoices`, `invoice_items`, `invoice_pdfs`, `invoice_emails`, `company_profile`;
billing fields on `clients`; `invoice_id` on `payments`; `revenue.invoice`
(0/1). See `prisma/schema.prisma`.

## Tests

- `src/lib/invoice/calc.test.ts` — totals, amount due, status derivation,
  OVERDUE overlay, number formatting, payment terms.
- `src/lib/invoice/service.test.ts` — DB-backed lifecycle: prefill from revenue,
  one-invoice-per-revenue, sequential non-reused numbering, no double-issue,
  payment reconciliation (partial → paid), void + reissue linkage.
