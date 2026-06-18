export interface Category {
  id: number;
  name: string;
  icon: string | null;
  color: string | null;
  is_income: number;
  archived: number;
  rollover: number;
  txn_count: number;
}

export interface Rule {
  id: number;
  category_id: number;
  match_field: 'details' | 'counterparty_name' | 'message';
  match_type: 'contains' | 'equals' | 'starts_with';
  match_value: string;
  priority: number;
  enabled: number;
  created_from_suggestion: number;
  category_name: string | null;
  category_icon: string | null;
}

export interface RuleSuggestion {
  id: number;
  token: string;
  match_field: string;
  category_id: number;
  category_name: string;
  category_icon: string | null;
  match_count: number;
  sample: Array<{ id: number; execution_date: string | null; amount_cents: number; counterparty_name: string | null; details: string }>;
}

export interface RulePreview {
  total: number;
  sample: Array<{
    id: number;
    execution_date: string | null;
    amount_cents: number;
    counterparty_name: string | null;
    transaction_type: string;
    details: string;
  }>;
}

export interface Tx {
  id: number;
  execution_date: string | null;
  value_date: string | null;
  amount_cents: number;
  transaction_type: string;
  counterparty_name: string | null;
  details: string;
  status: 'accepted' | 'rejected';
  category_id: number | null;
  category_name: string | null;
  category_icon: string | null;
  category_color: string | null;
  known_account_name: string | null;
}

export interface KnownAccount {
  id: number;
  name: string;
  account_number: string;
}

export interface TxPage {
  transactions: Tx[];
  page: number;
  pageSize: number;
  total: number;
}

export interface CategorySpend {
  category_id: number;
  name: string;
  icon: string | null;
  color: string | null;
  is_income: number;
  rollover?: number;
  spent_cents: number;
  txn_count: number;
  limit_cents?: number | null;
  carried_in_cents?: number | null;
  available_cents?: number | null;
}

export interface MonthReport {
  month: string;
  income_cents: number;
  expense_cents: number;
  net_cents: number;
  categories: CategorySpend[];
  uncategorized: Tx[];
}

export interface UpcomingCharge {
  id: number;
  label: string;
  expected_amount_cents: number;
  frequency: 'weekly' | 'monthly' | 'yearly' | 'irregular';
  next_expected_date: string | null;
  category_name: string | null;
  category_icon: string | null;
  category_color: string | null;
}

export interface UpcomingForecast {
  month: string;
  upcoming: UpcomingCharge[];
  expected_income_cents: number;
  expected_expense_cents: number;
}

export interface Insights {
  month: string;
  days_in_month: number;
  days_elapsed: number;
  expense_cents: number;
  daily_avg_cents: number;
  projected_expense_cents: number;
  budget_total_cents: number;
  top_expenses: Tx[];
  category_deltas: Array<{
    category_id: number;
    name: string;
    icon: string | null;
    color: string | null;
    is_income: number;
    spent_cents: number;
    prev_cents: number;
    delta_cents: number;
  }>;
}

export interface BalancePoint {
  date: string;
  balance_cents: number;
}

export interface CategoryTrends {
  categories: Array<{ id: number; name: string; color: string | null }>;
  data: Array<Record<string, number | string>>;
}

export interface RecurringTxn {
  id: number;
  execution_date: string | null;
  amount_cents: number;
  counterparty_name: string | null;
  transaction_type: string;
  details: string;
}

export interface RecurringExpense {
  id: number;
  label: string;
  counterparty_key: string;
  category_id: number | null;
  expected_amount_cents: number;
  frequency: 'weekly' | 'monthly' | 'yearly' | 'irregular';
  status: 'detected' | 'confirmed' | 'dismissed';
  next_expected_date: string | null;
  last_seen_date: string | null;
  category_name: string | null;
  category_icon: string | null;
  occurrences?: number;
  transactions: RecurringTxn[];
}

export interface ImportSummary {
  parsed: number;
  inserted: number;
  duplicates: number;
  rejected: number;
  autoCategorized: number;
}
