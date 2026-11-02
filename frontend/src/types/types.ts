export type SentimentLabel = 'positive' | 'negative' | 'neutral';

export type Priority = 'critical' | 'high' | 'medium' | 'low';

export interface ListResponse<T> {
  items: T[];
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

export interface HealthResponse {
  status: string;
  version?: string | null;
  model_loaded?: boolean | null;
  dataset_rows?: number | null;
}

export interface DashboardFilters {
  product?: string;
  start_date?: string;
  end_date?: string;
}

export interface CountItem {
  label: string;
  count: number;
  percentage?: number | null;
}

export interface MonthlyPoint {
  month: string;
  complaints: number;
  /** true when the data only covers part of this month */
  partial?: boolean;
}

export interface SentimentCounts {
  positive: number;
  negative: number;
  neutral: number;
}

export interface ComplaintRecord {
  id: string;
  date: string | null;
  product: string | null;
  issue: string | null;
  sub_issue?: string | null;
  company?: string | null;
  state?: string | null;
  channel?: string | null;
  complaint_text?: string | null;
  sentiment?: SentimentLabel | null;
}

export interface DashboardSummary {
  total_complaints: number;
  total_products: number;
  total_issues: number;
  /** Average over complete months only; null when there are no dated complaints. */
  avg_complaints_per_month: number | null;
  date_min: string | null;
  date_max: string | null;
  narrative_pct: number;
  most_reported_product: string | null;
  most_frequent_issue: string | null;
  monthly_trend: MonthlyPoint[];
  latest_month_partial: boolean;
  top_products: CountItem[];
  top_issues: CountItem[];
  product_distribution: CountItem[];
  /** null = sentiment has not been run for this dataset (NOT "all neutral"). */
  sentiment_distribution: SentimentCounts | null;
}

export interface ProductAnalytics {
  product: string;
  complaints: number;
  percentage: number;
  top_issue?: string | null;
}

export interface SubIssueAnalytics {
  sub_issue: string;
  complaints: number;
  percentage: number;
}

export interface IssueAnalytics {
  issue: string;
  complaints: number;
  percentage: number;
  products?: string[];
  sub_issues?: SubIssueAnalytics[];
}

export interface YearlyPoint {
  year: string;
  complaints: number;
}

export interface TrendsResponse {
  monthly: MonthlyPoint[];
  yearly: YearlyPoint[];
}

export interface SentimentTrendPoint extends SentimentCounts {
  month: string;
}

export interface ProductSentiment extends SentimentCounts {
  product: string;
  total: number;
}

export interface SentimentExample {
  text: string;
  sentiment: SentimentLabel;
  product?: string | null;
  issue?: string | null;
}

export interface SentimentAnalytics {
  distribution: SentimentCounts;
  trend: SentimentTrendPoint[];
  by_product: ProductSentiment[];
  examples: SentimentExample[];
}

export interface RootCauseItem {
  rank?: number | null;
  issue: string;
  product: string | null;
  complaints: number;
  percentage: number;
  observed_pattern: string | null;
  inferred_root_causes: string[];
  historical: MonthlyPoint[];
}

export interface RootCauseResponse {
  total_complaints: number;
  items: RootCauseItem[];
}

export interface Recommendation {
  id: string;
  issue: string;
  product: string | null;
  complaint_count: number;
  priority: Priority;
  identified_problem: string;
  corrective_action: string;
  preventive_action: string;
  business_impact?: string | null;
  reason?: string | null;
}

export interface PredictionRequest {
  text: string;
}

export interface PredictionResponse {
  predicted_product: string | null;
  confidence: number | null;
  confidence_level: 'low' | 'moderate' | 'high' | null;
  top_predictions: { product: string; probability: number }[];
  /** set when the text has no words the model knows, so no label is given */
  message: string | null;
}

export interface ComplaintQuery {
  page: number;
  page_size: number;
  search?: string;
  product?: string;
  issue?: string;
  start_date?: string;
  end_date?: string;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
}
