# Sinking Funds

## What is a sinking fund?

A sinking fund is a budgeting technique for irregular or infrequent expenses. Instead of trying to pay a large bill from one month's budget, you set aside a small amount every month. When the bill arrives, the accumulated balance covers it.

DragonBudget implements sinking funds as a **budget rollover**: unspent budget carries forward to the next month. Overspending also carries forward as a negative balance.

## Enabling rollover for a category

On the [Budgets](/budgets) page, each expense category row has a small **↺ icon** (recycling symbol). Click it to toggle the sinking fund on or off. The icon turns green when active.

You can also toggle it from the [Categories](/categories) page editor.

## How the math works

When rollover is enabled, the app calculates a **carryover** for each month by looking at all previous months since the category first had a budget:

```
carryover = sum of all previous monthly limits − sum of all previous spending
```

Then:

```
available = this month's limit + carryover
```

The progress bar and over-budget logic use **available**, not the raw limit.

## Worked example

You're saving for annual car insurance (€600/year). You set a monthly budget of **€50** and enable rollover.

| Month | Limit | Spent | Carryover to next month | Available |
|-------|-------|-------|------------------------|-----------|
| January | €50 | €0 | +€50 | €50 |
| February | €50 | €0 | +€100 | €100 |
| … | €50 | €0 | … | … |
| December | €50 | €600 | −€50 (overspent) | −€350 (next year) |

Wait — December's available is only €550 (11 months × €50), but the insurance is €600. You'll go over budget by €50 in December. That −€50 carries into January next year, reducing available from €50 to €0 in January.

A better setup: set the limit to **€55/month** so that after 12 months you have €660 available — enough to cover €600 and carry €60 into the next year.

## Reading carryover in the UI

On the Budgets page, active sinking-fund categories show a small annotation like **"↪ +€120 carried"** below the progress bar. This is the signed carryover:

- **Positive** — you've accumulated surplus from previous months
- **Negative** — you've overspent in previous months and are "paying it back"

On the Dashboard, the spending section shows "(incl. carry)" next to the available amount for rollover categories.

## When to use sinking funds

Good candidates for rollover:

- **Annual bills** — insurance, subscriptions billed yearly, road tax
- **Seasonal expenses** — heating in winter, holiday gifts
- **Irregular maintenance** — car repairs, home repairs, vet bills

Poor candidates:

- **Daily or weekly spending** — groceries, dining out, fuel. These are better managed with a strict monthly limit.
- **Categories you don't budget** — rollover only makes sense if you actually set a limit.

## Carryover is anchored to the first budget month

The calculation starts from the first month you set a budget for that category. Spending before that month is ignored in the carryover calculation. If you enable rollover on a category with years of historical transactions but only add a budget starting this month, the carryover starts from zero.
