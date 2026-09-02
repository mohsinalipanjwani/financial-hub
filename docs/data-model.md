# Financial Hub — Data Model

The database is a normalized relational copy of the master Google Sheet. It uses
surrogate primary keys (`id`) for relationships and a separate **stable business
key** (e.g. `revenue_key`, `client_key`) that mirrors the sheet's ID column and
makes sync idempotent.

Every financial entity carries **auditability columns**:
`source_system`, `source_sheet`, `source_row`, `last_synced_at`, and `archived`
(soft delete). This lets Finance trace `Google Sheet → Revenue tab → row 142 →
REV-00142` and guarantees historical records are never hard-deleted.

## Entities & relationships

```
clients ─┬─< revenue ─┬─< payments
         └─< payments <┘  (payment.revenue_id → revenue.id, optional)

team_members ─< team_costs        (one row per employee per month)
subscriptions                     (monthly recurring software cost)
expenses                          (other, non-salary/non-subscription costs)
exchange_rates                    (currency → USD, effective-dated)
sync_runs                         (one row per sync execution)
data_quality_issues               (detected problems)
users, audit_logs                 (auth + config change trail)
```

Key relationships:

- `revenue.client_id → clients.id`
- `payment.client_id → clients.id`
- `payment.revenue_id → revenue.id` (optional — a payment may settle a specific
  revenue line)
- `team_cost.team_member_id → team_members.id`

## Tables

### clients
`client_key` (unique business ID), `name`, `source`, `lead`,
`account_manager`, `active`, `start_date`, `notes`.

### revenue
Expected/earned revenue. `revenue_key` (unique), `date`, `month` (first of
month), `project`, `phase`, `amount` + `currency` (**original, never
overwritten**), `status` (DRAFT/CONFIRMED/INVOICED/CANCELLED),
`payment_status` (**PENDING / PAID / PARTIAL**), `received_date`,
`expected_date`, `payment_method`, `lead`, `developer`, `client_id`.

> A revenue record existing does **not** mean the cash was collected. Collection
> is tracked by `payment_status` and by linked `payments`.

### payments
Actual cash received, separate from expected revenue. `payment_key` (unique),
`date`, `amount` + `currency`, `method`, `status` (PENDING/CLEARED/FAILED),
`client_id`, `revenue_id?`.

### team_members / team_costs
`team_members`: `employee_key` (unique), `name`, `active`.
`team_costs`: one row per employee per **month** (no monthly tabs) —
`cost_key` (unique), `month`, `salary`, `overhead`, `currency`, `team_member_id`.
Total cost = `salary + overhead` (computed, not stored).

### subscriptions
`subscription_key` (unique), `name`, `owner`, `category`, `monthly_cost` +
`currency`, `start_date`, `renewal_date`, `active`. Monthly subscription
overhead is summed from **active** subscriptions.

### expenses
Non-salary, non-subscription costs. `expense_key` (unique), `date`, `month`,
`category`, `description`, `amount` + `currency`, `paid`.

### exchange_rates
`date`, `currency`, `rate_to_usd`, unique on `(currency, date)`. Conversion uses
the most recent rate on or before the period. Rates are **never hardcoded** in
application code.

### sync_runs
`started_at`, `finished_at`, `status` (RUNNING/SUCCESS/FAILED/PARTIAL),
`rows_read`, `rows_created`, `rows_updated`, `rows_rejected`, `error_count`,
`message`.

### data_quality_issues
`entity_type`, `entity_key`, `code`, `severity` (INFO/WARNING/ERROR),
`status` (OPEN/RESOLVED/IGNORED), `message`, `source_sheet`, `source_row`.

### users / audit_logs
`users`: `email` (unique), `name`, `role` (ADMIN/FINANCE/MANAGEMENT/EMPLOYEE),
`active`. `audit_logs`: `action`, `entity_type`, `entity_id`, `metadata`,
`user_id` — the trail for logins and important configuration changes.

## Financial calculations (definitions)

Given a reporting period and reporting currency (default USD):

| Metric              | Definition |
| ------------------- | ---------- |
| **Revenue**         | Σ revenue lines (non-cancelled) converted to reporting currency |
| **Received**        | Σ cleared payments + PAID revenue lines without payment rows |
| **Pending**         | Σ per-line `max(0, expected − received)` (partial-payment safe) |
| **Team Cost**       | Σ (salary + overhead) |
| **Subscription Cost** | Σ active subscriptions' monthly cost × months in period |
| **Other Expenses**  | Σ recorded expenses |
| **Total Cost**      | Team + Subscriptions + Other Expenses |
| **Net Profit**      | Revenue − Total Cost |
| **Profit Margin**   | Net Profit ÷ Revenue × 100 (0 when Revenue = 0) |

Partial payments: pending is computed **per revenue line and floored at zero**,
so an overpayment on one invoice can never mask a shortfall on another. Missing
exchange rates cause the affected line to be skipped from totals and flagged as
a data-quality issue rather than silently mis-valued.
