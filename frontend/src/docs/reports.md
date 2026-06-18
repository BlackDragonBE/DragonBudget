# Reports

## Dashboard

The [Dashboard](/dashboard) is your monthly overview. Use the month picker at the top to switch between months.

### Summary cards

Three cards at the top show the month's **Income**, **Expenses**, and **Net** (income minus expenses). Net is green when positive (you saved money) and red when negative (you spent more than you earned).

### Spending by category

Each expense category with transactions shows:
- A horizontal progress bar (green = within budget, red = over budget)
- Amount spent vs budget limit
- For sinking-fund categories: available amount including carryover, labelled "(incl. carry)"

Clicking a category name opens the Transactions page filtered to that category and month.

### Income by category

Income categories show actual received amount. If you set an expected amount in Budgets, a smaller bar shows progress toward that target.

### Uncategorized transactions

A widget at the bottom lists all uncategorized transactions for the current month. Use the inline dropdown to categorize them without leaving the Dashboard. Once categorized, they disappear from this list.

---

## All-time reports

The [All-time](/all-time) page shows trends across any date range.

### Time range presets

Use the preset buttons — **3m, 6m, 12m, YTD, All** — to quickly zoom to a common range. You can also type custom from/to dates.

### Balance history

A line chart tracks your running account balance over time. To use it:

1. Enter your **current balance** (what your bank app shows today) in the input field.
2. The chart calculates a starting baseline and draws the balance curve backward from there.

You can also enter a **starting balance** if you know what your balance was at a specific past date.

The balance is calculated from transaction amounts — it reflects your imported transaction history and may not match your bank exactly if you have accounts not covered by imports.

### Spending by category (stacked bar)

A monthly stacked bar chart shows how much you spent in each expense category per month. Hovering over a bar shows the breakdown. Use this to spot seasonal patterns — higher heating bills in winter, holiday spending in December, and so on.

### Income by category (stacked bar)

The same chart format for income categories. Useful for seeing month-to-month variation in variable income.

---

## Transactions ledger

The [Transactions](/transactions) page is the full searchable list of all imported transactions.

### Filtering

| Filter | Options |
|--------|---------|
| Search | Free text matching Details, Counterparty name, and Message |
| Month | A specific month (YYYY-MM) |
| Status | Accepted or Rejected |
| Category | A specific category, or "Uncategorized" |
| Direction | Income or Expense |

Filters persist within your browser session — navigating away and back keeps them active.

### Sorting

Click any column header to sort. Click again to reverse. Sortable columns: Date, Amount, Counterparty.

### Transaction details

Click any row to open a detail panel showing all fields including the raw bank reference, transaction type, and any message attached.

### Inline categorization

The Category column has a dropdown on each row. Change it directly here to override any automatic categorization. Manual assignments are never overwritten by rules.
