# DragonBudget — Feature Roadmap

Post-v1 feature plan. v1 (see `DESIGN.md`) is built; so are several extras
(dark mode, JSON backup/restore, known-account labels, rule auto-suggestions).
This document is about what would make it genuinely *better*, not bigger.

## What the app already nails

Import + dedup, rule-based categorization with manual override + suggestions,
month view with budget-vs-actual, all-time balance + trends, recurring
detection, JSON backup. That's a complete, honest budgeting tool already.

## What people actually love (research)

Recurring themes across YNAB, Actual Budget, and Lunch Money reviews:

1. **Rollover / "true expenses" / sinking funds** — unspent budget carries
   forward so annual bills (insurance, taxes, car) never surprise you. This is
   *the* most-cited reason people stick with YNAB.
2. **Cash-flow forecast / bill timeline** — "never be surprised by a bill."
   Upcoming recurring charges projected forward, end-of-month projected balance.
3. **Split transactions** — one purchase across multiple categories.
4. **Goals with visual progress** — save toward a target by a date.
5. **Stats & insights** — month-over-month deltas, top merchants, "you spent
   X% more on dining," largest transactions.
6. **Customization** — category groups/subcategories, ordering.
7. **Undo** — robust rollback so mistakes are cheap.

(Sources at bottom.)

---

## Tier 1 — build these (high value, fits the architecture)

### 1.1 Budget rollover (sinking funds) — **the headline**
Unspent (or overspent) budget carries into next month:
`available = limit + carried_over`, `carried_over = prev_available − prev_spent`.
Turns the app from "spending tracker with monthly limits" into a real
budgeting tool. Makes irregular/annual expenses work (save €30/mo for a €360
insurance bill).
- **Scope it lazy:** per-category rollover, opt-in per category. NOT full
  zero-based envelope ("budget every euro from a to-be-assigned pool") — that
  needs a live account balance and a forward mental model that fits a
  real-time app, not a retrospective CSV importer. Per-category rollover is
  the 80/20.
- **Touchpoints:** one boolean `rollover` on `categories` (or `budgets`);
  rollover math lives in `reports.ts` month report (running carry per
  category). No new table. Display: "available" alongside "spent / limit".

### 1.2 Cash-flow forecast from recurring expenses
You already *detect* recurring expenses — surface them forward. A timeline /
calendar of upcoming charges this month + "projected end-of-month balance =
current balance − remaining expected recurring." This is Lunch Money's most
praised feature and you're 80% there with `recurring_expenses.next_expected_date`.
- **Touchpoints:** new pure query in `reports.ts` (upcoming = recurring rows
  with `next_expected_date` in range, minus ones already matched this period);
  small panel on the Dashboard. No schema change.

### 1.3 Richer insights on existing data
All pure query functions in the `reports.ts` pattern — cheap, high ROI, no
schema:
- Month-over-month per-category delta ("Dining ▲ €42 vs last month").
- Top merchants / largest transactions for the period.
- Average daily spend, days-remaining burn rate vs budget.
- Income vs expense vs net summary tiles (some exist — round out).

### 1.4 Split transactions
One transaction split across categories (the supermarket run that's groceries
+ household + wine). Common real need; the only Tier-1 item needing schema.
- **Touchpoints:** `transaction_splits(transaction_id, category_id, amount_cents)`;
  when splits exist, reports sum splits instead of the row's single category.
  Keep the single-category path as the default — splits are the exception.
- **Lazy guard:** only build if you actually hit this monthly. If a rough
  category is fine, this is YAGNI — skip until it bites.

---

## Tier 2 — strong follow-ups

### 2.1 Internal-transfer detection / exclusion
You have `known_accounts`. Auto-flag transfers between your own accounts so
moving money to savings doesn't read as income+expense. Excluded from totals
like `status='rejected'` already is.
- **Touchpoints:** match `counterparty_account` against `known_accounts`;
  treat as a transfer (new status or a `is_transfer` flag) excluded from
  income/expense totals but still listed.

### 2.2 Savings goals
Target amount + optional target date + progress bar. Maps cleanly onto a
sinking-fund category once 1.1 exists — a goal is "rollover category + a
target." Build *after* rollover or it's redundant.

### 2.3 Notes & tags on transactions
Free-text note + lightweight tags (`vacation`, `car-2026`) for slicing across
categories. One `tags` + `transaction_tags` table, or a simple `notes` TEXT
column first (notes alone may be enough — add tags only if you reach for them).

### 2.4 PWA / installable mobile
A `manifest.webmanifest` is already committed. Finish it: installable to home
screen, offline app shell. Low effort, big mobile-feel win for a
phone-on-the-go check. (Data still needs the server — Tailscale — so no
offline data sync, just the shell.)

### 2.5 Filtered CSV export
JSON export exists; add CSV export of the current filtered transaction view
for spreadsheet users. Near-trivial.

---

## Skip — YAGNI for *this* app (and why)

- **Multi-currency** — source account is EUR-only (DESIGN.md). Don't carry the
  complexity for one currency.
- **Live bank sync (PSD2/GoCardless/Ponto)** — explicitly deferred; CSV import
  is the contract. Real value but real ongoing maintenance; revisit only if
  manual export becomes a chore.
- **Multi-user / sharing** — single user by design. Schema already leaves the
  door open (`accounts` table later); don't build UI now.
- **Multi-device E2E sync** — it's a server app behind Tailscale; the server
  *is* the single source of truth. Sync solves a problem you don't have.
- **Investment / net-worth tracking** — out of scope; no asset data enters.
- **AI auto-categorization** — your rules + suggestions already cover this
  deterministically and debuggably. An LLM here adds cost and nondeterminism
  for marginal gain.
- **Undo system** — nice in theory, but JSON backup + the fact that re-import
  is idempotent already covers "I messed up." Add only if a destructive action
  proves painful.

---

## Recommended order

1. **Budget rollover (1.1)** — biggest single leap in usefulness.
2. **Cash-flow forecast (1.2)** — high value, you're already most of the way.
3. **Insights (1.3)** — cheap wins on data you already have.
4. Then pick from Tier 2 by what you actually find yourself wanting.

Split transactions, goals, and tags are all "build when it bites" — don't
pre-build them.

## Sources

- [Why YNAB is Different](https://www.ynab.com/why-ynab-is-different) · [20 Reasons I Love YNAB](https://www.ynab.com/blog/20-reasons-i-love-ynab) · [Fortune: YNAB pros/cons](https://fortune.com/article/ynab-pros-and-cons/)
- [Actual Budget](https://actualbudget.org/) · [Actual Budget on GitHub](https://github.com/actualbudget/actual)
- [Lunch Money](https://lunchmoney.app/) · [Lunch Money review (Family Money Adventure)](https://familymoneyadventure.com/lunch-money-review/)
