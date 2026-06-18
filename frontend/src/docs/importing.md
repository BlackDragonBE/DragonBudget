# Importing Transactions

## Supported format

DragonBudget imports **BNP Paribas Fortis Easy Banking CSV exports** only. To download one:

1. Log in to Easy Banking Web or the mobile app
2. Go to your account's transaction history
3. Select a date range and export as CSV

The file will be UTF-8 encoded with a semicolon delimiter. DragonBudget handles the BOM (byte-order mark) that Windows sometimes adds automatically.

## Running an import

1. Go to the [Import](/import) page
2. Click "Choose file" and select your CSV
3. Click "Import"

The import runs in seconds. When it finishes, a summary shows how many rows were processed.

## Understanding the import summary

After a successful import you'll see five numbers:

| Stat | Meaning |
|------|---------|
| **Parsed** | Total rows read from the CSV file |
| **Inserted** | New transactions added to the database |
| **Duplicates** | Rows already in the database — skipped silently |
| **Rejected** | Transactions the bank marked as failed or refused |
| **Auto-categorized** | New transactions that matched a categorization rule |

## Re-importing is always safe

DragonBudget deduplicates by a SHA-256 hash of each transaction's key fields (date, amount, account number, and the bank's own reference in the Details column). Re-uploading a file you've already imported — or uploading an overlapping date range — will simply skip the rows that already exist. No duplicates are ever created.

This means you can safely re-import if you're unsure whether a previous import went through.

## What happens after import

Immediately after new rows are inserted, two processes run automatically:

1. **Rule application** — every enabled categorization rule is checked against the new transactions. Matches are categorized automatically.
2. **Recurring detection** — the recurring-expense detector re-runs over all transactions and updates the [Recurring](/recurring) page.

You don't need to trigger either of these manually after an import.

## Rejected transactions

Transactions with a "rejected" status (bank-declined payments) are imported and stored but are **excluded from all totals, budgets, and reports**. They appear greyed out in the [Transactions](/transactions) list so you can review them, but they don't affect your balance or category spending.
