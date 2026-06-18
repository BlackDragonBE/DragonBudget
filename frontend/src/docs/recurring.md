# Recurring Expenses

## What the recurring detector does

DragonBudget automatically scans your transaction history and identifies payments that repeat on a regular schedule — subscriptions, rent, insurance premiums, utility bills, and so on. These appear on the [Recurring](/recurring) page.

Detection runs automatically after every import. You can also trigger it manually with the **"Re-detect"** button.

## How detection works

Transactions are grouped by counterparty:

- If the transaction has a counterparty IBAN, that IBAN is the grouping key (most reliable).
- If not (e.g., card payments), the app extracts a merchant token from the Details field.

For each group, the detector checks:

1. **Direct debits and standing orders** (`domiciliëring` / `doorlopende betalingsopdracht`) qualify with just **one occurrence** — the bank type alone is enough evidence.
2. **All other types** need at least **two occurrences** with amounts within ±10% of each other and a consistent gap between dates.

If the gaps are consistent, the frequency is inferred:

| Frequency | Gap between transactions |
|-----------|-------------------------|
| Weekly | 5–10 days |
| Monthly | 24–35 days |
| Yearly | 350–385 days |
| Irregular | Anything else |

Irregular patterns are not automatically detected (unless they're direct debits).

## The status workflow

Each recurring entry has a status that you control:

| Status | Meaning |
|--------|---------|
| **Detected** | Auto-discovered, awaiting your review |
| **Confirmed** | You've verified this is genuinely recurring |
| **Dismissed** | You've decided not to track this |

Confirm entries you recognise and want to monitor. Dismiss entries that are false positives (e.g., a coincidence of two similarly-priced payments to the same merchant).

Dismissed entries can be restored if you change your mind.

## What each recurring entry shows

- **Label** — defaults to the counterparty name or merchant token; you can edit it to something friendlier
- **Frequency badge** — weekly, monthly, yearly, or irregular
- **Expected amount** — the most recent transaction amount
- **Last seen** — date of the most recent transaction in the group
- **Next expected** — estimated next payment date (last seen + median gap)
- **Category** — you can assign a category directly from this page; it applies to all transactions in the group
- **Transactions** — click "Show transactions" to see every payment in the group

## Editing labels and categories

Click the label text to edit it inline. Changes are saved immediately.

Use the category dropdown to assign all transactions in a recurring group to a category at once — useful for subscriptions that share a merchant token with other transactions.

## Re-detection preserves your edits

When re-detection runs (after import or manually), it updates metrics (frequency, expected amount, next expected date) but **preserves**:
- Status you've set (confirmed/dismissed entries stay that way)
- Labels you've edited

So it's safe to run re-detection at any time without losing your manual adjustments.

## Tips

- After a fresh import, check the Recurring page for any new "detected" entries and confirm or dismiss them.
- If "Next expected" is in the past, the payment may be overdue or the subscription may have been cancelled.
- The expected amount is always the **last** transaction's amount, so a price increase will update it automatically after the next import.
