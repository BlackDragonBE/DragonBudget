# Rules

## What rules do

Rules automatically categorize transactions when they're imported (or when you click "Re-run rules now"). Instead of manually assigning every transaction, you define a rule once and the app applies it to every matching transaction going forward.

## How a rule is structured

Each rule has four required fields:

| Field | Options | Example |
|-------|---------|---------|
| **When** (field) | Details, Counterparty name, Message | Details |
| **Type** (match type) | contains, starts with, equals | contains |
| **Value** | Any text | COLRUYT |
| **Category** | Any of your categories | Groceries |

And one optional field:

| Field | Description | Default |
|-------|-------------|---------|
| **Priority** | Higher number = checked first | 0 |

### Match fields explained

- **Details** — the bank's own transaction reference, usually in all caps. Contains the merchant name and the bank's internal reference code. This is the most reliable field for card payments.
- **Counterparty name** — the name of the other account holder. Reliable for bank transfers and direct debits.
- **Message** — the free-text payment note you or the sender attached. Less structured; useful for recurring transfers with a fixed description.

### Match types explained

- **contains** — the value appears anywhere in the field (e.g., "COLRUYT" matches "BETALING COLRUYT SINT-NIKLAAS")
- **starts with** — the field begins with the value (useful when you know the merchant prefix is always the same)
- **equals** — the entire field is exactly the value (most precise; rarely needed)

All matching is **case-insensitive**.

## Priority: controlling which rule wins

When multiple rules could match the same transaction, the one with the **highest priority number** wins. Only one rule is ever applied per transaction.

**Example:** You have:
- Priority 10: "contains CARREFOUR" → Groceries
- Priority 20: "contains CARREFOUR EXPRESS" → Dining out

A transaction with "CARREFOUR EXPRESS BRUSSELS" matches both, but priority 20 wins, so it's tagged as Dining out. Without priority, the first rule added would always win — messy. Use priority to put specific rules above general ones.

## Manual categorization is protected

If you manually categorize a transaction (by choosing a category from the dropdown in the Transactions list or Dashboard), that assignment is locked. Rules will **never overwrite a manual categorization**, even if you create or edit rules later.

This lets you safely re-run rules (or create new ones) without losing your manual corrections.

The only way to make rules re-apply to manually categorized transactions is to click "Re-run rules now" with the "recategorize all" option, which is intentionally buried.

## Previewing a rule before saving

The rule form has a **Preview** button. Click it to see exactly which existing transactions the rule would match — count plus a sample list. Use this before saving to catch overly broad rules (e.g., "contains 'ING'" matching far more than intended).

## Re-run rules now

The **"Re-run rules now"** button on the Rules page applies all enabled rules to every transaction that doesn't have a manual categorization. Run this after:
- Creating several new rules at once
- Importing historical data before rules existed
- Enabling a rule you previously had disabled

## Enabling and disabling rules

Each rule has an on/off toggle. A disabled rule is ignored during rule application but stays in the list. Use this to temporarily suspend a rule without deleting it.

## Rule suggestions

When you manually categorize a transaction, DragonBudget checks whether the same merchant token appears in two or more other **uncategorized** transactions. If it does, it automatically suggests a rule.

Suggestions appear in a blue panel at the top of the Rules page. Each suggestion shows:
- The token it detected (e.g., "KRUIDVAT")
- How many uncategorized transactions it would match
- Five example transactions

You can **Accept** (creates the rule and applies it immediately) or **Dismiss** (hides the suggestion permanently). Dismissed suggestions are never re-surfaced.

Accepted suggestions are marked with a "suggested" badge in the rule list so you know which rules were auto-generated.
