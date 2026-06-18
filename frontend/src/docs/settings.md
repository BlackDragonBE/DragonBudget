# Settings

The [Settings](/settings) page is divided into four tabs: Appearance, Data, Accounts, and Danger Zone.

---

## Appearance

### Theme

Choose between **Light**, **Dark**, and **System**. System mode follows your operating system's preference and switches automatically when you change it.

Your choice is saved in the browser and persists across sessions.

---

## Data

### Exporting backups

Three separate export buttons let you download your data as JSON files:

| Export | Contains |
|--------|---------|
| **Transactions** | All imported transactions with category names |
| **Categories & Rules** | All categories, their settings, and all categorization rules |
| **Budgets** | All monthly budget limits |

Export files use category names (not IDs) so they remain readable and portable even after a database reset.

### Importing backups

Matching import buttons let you restore from those JSON files. Imports are **additive and idempotent**:
- Transactions are matched by their dedup hash — re-importing a backup won't create duplicates.
- Categories and rules are upserted — existing ones are updated, new ones are added.
- Budgets are upserted by category name and month.

You can use exports as a migration path between servers: export everything from the old instance, import into the new one.

---

## Accounts

### What known accounts are for

When a transaction's counterparty IBAN matches one of your known accounts, a **blue badge** appears on that transaction in the Transactions list. The badge shows the account's friendly name.

This is most useful for identifying your own transfers between accounts — for example, transfers to your savings account, joint account, or a family member's account.

### Adding a known account

Click "Add account", enter a friendly name (e.g., "Savings", "Joint account"), and the account's IBAN or account number. Spaces in account numbers are stripped automatically.

### Removing a known account

Click the delete button next to any account. Removing an account stops new badge labels from appearing on that counterparty's transactions — existing transactions are unaffected.

---

## Danger Zone

### Clear all transactions

This button **permanently and irreversibly deletes every transaction** in the database. The confirmation dialog requires you to type a phrase before proceeding.

Use this only to start fresh — for example, after testing with sample data before using the app with real imports.

Categories, rules, and budgets are **not** deleted by this action. To do a full reset, you would also need to manually delete categories and rules.

**There is no undo.** Export your transactions first if you want a backup.
