# Getting Started

## What is DragonBudget?

DragonBudget is a self-hosted personal budgeting app designed for BNP Paribas Fortis account holders. You import your bank's CSV exports, and the app categorizes your transactions, tracks your spending against monthly budgets, and detects recurring expenses automatically.

Everything runs locally — your financial data never leaves your server.

## First-time setup

1. **Create categories** on the [Categories](/categories) page. Give each one a name, an emoji icon, and a colour. Mark salary or other income streams as "Income" so they show up separately in reports.

2. **Import your transactions** on the [Import](/import) page. Download a CSV export from BNP Paribas Fortis Easy Banking and upload it here. The app handles the rest.

3. **Set up rules** on the [Rules](/rules) page to automatically categorize future transactions. For example, a rule matching "COLRUYT" in the Details field can auto-tag all supermarket purchases.

4. **Set monthly budgets** on the [Budgets](/budgets) page. Enter a spending limit for each category, then use the Dashboard to track how you're doing mid-month.

## Navigation overview

| Page | Purpose |
|------|---------|
| Dashboard | Current month at a glance — income, spending, budget progress |
| All-time | Historical charts and category trends over any date range |
| Transactions | Searchable, filterable ledger of every transaction |
| Categories | Manage your spending and income categories |
| Rules | Auto-categorization rules and rule suggestions |
| Budgets | Set monthly spending limits per category |
| Recurring | View and manage automatically detected recurring expenses |
| Import | Upload BNP Paribas Fortis CSV exports |
| Settings | Theme, data backup, known accounts, danger zone |

## Key concepts

**Amounts are always in euros.** Internally everything is stored as integer cents to avoid floating-point errors — this is invisible to you but worth knowing if you ever inspect the raw data.

**Rejected transactions** are rows the bank has flagged as failed or refused. They appear greyed out in the transaction list but are excluded from all totals and reports.

**Categories** are the core organizing unit. Every transaction can be assigned to one category (or left uncategorized). Rules assign categories automatically; you can always override a rule's assignment manually.
