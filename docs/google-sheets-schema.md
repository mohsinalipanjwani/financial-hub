# Master Google Sheet — Schema

The existing spreadsheets (Upwork/revenue workbook, subscription sheet, team
cost sheet) are consolidated into **one master Google Sheet** with the tabs
below. There are **no monthly or quarterly tabs** — all revenue lives in one
`Revenue` table with a date/month column, and the same holds for every entity.

Each row keeps its **stable ID** (Client ID, Revenue ID, …) so Financial Hub can
sync idempotently: re-importing the same row updates the existing database record
instead of creating a duplicate.

## Tabs

```
README            Explains the sheet, its rules, and how sync works
Clients           Client master
Revenue           Expected / earned revenue (one table, dated)
Team              Employee cost per month
Subscriptions     Recurring software / tool costs
Other Expenses    Costs that aren't salaries or subscriptions
Payments          Actual cash received
Exchange Rates    Currency → USD, effective-dated
Settings          Controlled dropdown values
Dashboard Data    (optional) helper ranges for in-sheet charts
```

## Column definitions

### Clients
`Client ID` · `Client Name` · `Source` · `Lead` · `Account Manager` ·
`Active` · `Start Date` · `Notes`
Client ID must be unique.

### Revenue
`Revenue ID` · `Date` · `Client` · `Project` · `Phase` · `Month` · `Amount` ·
`Currency` · `Status` · `Payment Status` · `Received Date` · `Expected Date` ·
`Payment Method` · `Lead` · `Developer` · `Notes`
Revenue is expected/earned — do not assume it's collected. `Payment Status` is
one of **Pending / Paid / Partial**.

### Team
`Employee ID` · `Employee` · `Month` · `Salary` · `Overhead` · `Total Cost` ·
`Currency` · `Active` · `Notes`
`Total Cost` normally equals `Salary + Overhead` (Financial Hub recomputes it;
don't rely on a manually duplicated total).

### Subscriptions
`Subscription ID` · `Subscription` · `Owner` · `Category` · `Monthly Cost` ·
`Currency` · `Start Date` · `Renewal Date` · `Active` · `Notes`
Monthly subscription overhead is computed from **active** rows.

### Other Expenses
`Expense ID` · `Date` · `Category` · `Description` · `Amount` · `Currency` ·
`Paid` · `Notes`

### Payments
`Payment ID` · `Date` · `Client` · `Revenue ID` · `Amount` · `Currency` ·
`Method` · `Status` · `Notes`
Separates actual cash received from expected revenue. Link to a `Revenue ID`
where a payment settles a specific line.

### Exchange Rates
`Date` · `Currency` · `Rate to USD` · `Notes`
Currently USD and PKR; the model supports adding currencies later. Rates are
effective-dated (most recent on/before a period applies).

### Settings
Controlled values / dropdowns: `Status`, `Payment Status`, `Currency`,
`Expense Category`, `Subscription Category`, `Active`, `Payment Method`,
`Source`.

## Mapping to the database

| Sheet tab       | Table                | Business key       |
| --------------- | -------------------- | ------------------ |
| Clients         | `clients`            | `client_key`       |
| Revenue         | `revenue`            | `revenue_key`      |
| Team            | `team_members` + `team_costs` | `employee_key` / `cost_key` |
| Subscriptions   | `subscriptions`      | `subscription_key` |
| Other Expenses  | `expenses`           | `expense_key`      |
| Payments        | `payments`           | `payment_key`      |
| Exchange Rates  | `exchange_rates`     | `(currency, date)` |
| Settings        | enums / dropdowns    | —                  |

## Sync rules

1. Read each tab; validate required fields against the schema.
2. Upsert by business key — existing rows are **updated**, not duplicated.
3. Reject invalid rows and record them in `sync_runs.rows_rejected` +
   `data_quality_issues`.
4. Never hard-delete; mark removed rows `archived`.
5. Record the run in `sync_runs` (rows read / created / updated / rejected).

## Column mapping (Phase 2)

The MVP configures the expected master-sheet structure directly (the columns
above). The architecture keeps room for flexible **column mapping** later, so a
sheet with differently-named or reordered columns can be mapped without code
changes: Connect Google Account → Select Spreadsheet → Select tab → Map columns
→ Sync.
