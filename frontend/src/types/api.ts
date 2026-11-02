// Shapes of what OUR backend returns (see /api/docs). UI-facing shapes live in types.ts.
export interface User { id: string; email: string; display_name: string; created_at: string }

export type DatasetStatus = 'uploaded' | 'needs_mapping' | 'processing' | 'ready' | 'failed';

export interface DatasetOverview {
  total_complaints: number; unique_products: number; unique_issues: number;
  date_min: string | null; date_max: string | null; rows_with_valid_date: number;
  narratives_present: number; narratives_missing: number; narrative_pct: number;
}

export interface CleaningReport {
  rows_in: number; rows_out: number; duplicate_ids_removed: number;
  exact_duplicate_rows_found: number; exact_duplicate_rows_removed: number;
  date_format_used: string | null; invalid_dates: number; invalid_date_examples: string[];
  blank_text_to_missing: Record<string, number>; missing_by_column: Record<string, number>;
  narratives_present: number; narratives_missing: number; notes: string[];
}

export interface ProfileColumn { column: string; missing: number; missing_pct: number; unique: number }

export interface Dataset {
  id: string; original_filename: string; size_bytes: number; status: DatasetStatus; error: string | null;
  rows: number | null; summary: DatasetOverview | null; created_at: string; processed_at: string | null;
}

export interface DatasetDetail extends Dataset {
  file_columns: string[] | null; mapping: Record<string, string> | null;
  cleaning_report: CleaningReport | null; profile: { rows: number; columns: ProfileColumn[] } | null;
  required_fields: string[]; optional_fields: string[];
}

export interface DatasetPreview { page: number; page_size: number; total_rows: number; rows: Record<string, string | boolean | null>[] }

export type JobKind = 'sentiment' | 'prediction';
export interface Job {
  id: string; dataset_id: string; kind: JobKind; status: 'queued' | 'running' | 'done' | 'failed';
  progress: number; error: string | null; created_at: string; finished_at: string | null;
}

export interface NamedCount { name: string; count: number; pct: number }
export interface MonthCount { month: string; count: number; partial: boolean }
export interface YearCount { year: number; count: number; months_covered: number; partial: boolean }
export interface SentimentDistribution {
  analysed: number; no_text: number; counts: Record<'Negative' | 'Neutral' | 'Positive', number>;
  pct: Record<'Negative' | 'Neutral' | 'Positive', number>; mean_compound: number | null; note: string;
}

export interface DashboardResponse {
  metrics: DatasetOverview; top_products: NamedCount[]; top_issues: NamedCount[];
  monthly: MonthCount[]; yearly: YearCount[]; sentiment: SentimentDistribution | null; sentiment_available: boolean;
  filters_applied: { date_from: string | null; date_to: string | null; products: string[]; issues: string[]; sentiments: string[] };
}

export interface FilterOptions {
  products: string[]; issues: string[]; date_min: string | null; date_max: string | null;
  sentiment_available: boolean; sentiments: string[];
}

export interface TopPrediction { product: string; probability: number }
export interface PredictResponse {
  status: 'ok' | 'insufficient_text'; predicted_product: string | null; confidence: number | null;
  confidence_level?: 'low' | 'moderate' | 'high'; top_predictions?: TopPrediction[]; target?: string; note?: string; message?: string;
}

export interface ModelCard {
  model_type: string; target: string; classes: string[];
  evaluation: { available: boolean; accuracy?: number; macro_f1?: number; test_size?: number; weak_classes?: string[];
                per_class?: { product: string; precision: number; recall: number; f1: number; support: number }[] };
  training_notes: string[];
}

export interface AppInfo {
  app_name: string; privacy: { storage: string[]; processing: string[]; retention: string[] };
  limits: { max_upload_mb: number; max_rows: number; max_datasets_per_user: number; session_days: number };
  sentiment_note: string;
}

export interface HealthResponse { status: string; database: string; model_files: { model: boolean; vectorizer: boolean } }

export interface AnalysisListItem {
  id: string; dataset_id: string; dataset_name: string; kind: 'recommendations' | 'summary';
  title: string | null; headline: string | null; created_at: string;
}

// ------------------------------------------------------------------ analytics, sentiment, recommendations, reports
export interface AnalyticsFilters { date_from?: string; date_to?: string; product?: string; issue?: string; sentiment?: string }

export interface RankedList { total_unique: number; items: NamedCount[] }

export interface TrendsResponse {
  monthly: MonthCount[]; yearly: YearCount[];
  by_category?: { column: string; months: string[]; series: Record<string, number[]> };
  negative_sentiment_monthly?: SentimentMonth[];
}

export interface SentimentMonth { month: string; analysed: number; negative: number; negative_pct: number | null; low_sample: boolean }

export interface BreakdownIssue { issue: string; count: number; products: NamedCount[]; sub_issues: { available: boolean; items: NamedCount[]; missing_pct: number | null } }
export interface BreakdownProduct { product: string; count: number; issues: NamedCount[] }

export interface CompareItem {
  name: string; count_prev: number; count_recent: number; share_prev_pct: number; share_recent_pct: number;
  share_change_pp: number; share_relative_change_pct: number | null; count_change_pct: number | null;
  p_value: number; p_adjusted: number; meaningful: boolean; direction: 'up' | 'down' | 'flat';
}
export interface RisingResponse {
  status: 'ok' | 'insufficient_data'; reason?: string; items: CompareItem[];
  period_prev?: [string, string]; period_recent?: [string, string];
  total_prev?: number; total_recent?: number; volume_change_pct?: number | null;
}

export interface SentimentCategory {
  name: string; analysed: number; negative: number; neutral: number; positive: number;
  negative_pct: number; positive_pct: number; mean_compound: number | null;
}
export interface SentimentResults {
  distribution: SentimentDistribution; by_product: SentimentCategory[]; by_issue: SentimentCategory[];
  most_negative_issues: SentimentCategory[]; monthly: SentimentMonth[]; min_narratives_per_category: number;
}

export type Tier = 'High' | 'Medium' | 'Low';
export interface ScoreBreakdown { signal: 'volume' | 'trend' | 'sentiment'; assessed: boolean; points: number; max: number; detail: string }
export interface RecommendationRule {
  rule_id: string; title: string; match_type: 'issue' | 'pattern' | 'product_fallback' | 'generic' | string; specific: boolean; label: string;
  context: string; actions: string[]; reason: string; priority_criteria: string;
  evidence_and_assumptions: string[]; follow_up_metrics: string[];
}
export interface RecommendationItem {
  rank: number; issue: string; count: number; share_pct: number; volume_rank: number; tier: Tier | string;
  score: { total: number; max_possible: number; signals_assessed: number; tier: string; breakdown: ScoreBreakdown[] };
  products: NamedCount[];
  sub_issues: { available: boolean; items: NamedCount[]; missing_pct: number | null };
  trend: null | { meaningful: boolean; direction: 'up' | 'down' | 'flat'; share_prev_pct: number; share_recent_pct: number; period_prev?: string | null; period_recent?: string | null };
  sentiment: null | (SentimentCategory & { vs_overall_pp: number });
  same_theme_variants: { name: string; count: number }[];
  recommendation: RecommendationRule;
  why_highlighted: string[];
}
export interface RecommendationReport {
  status: 'ok' | 'no_data'; label: string; disclaimer?: string; generated_at?: string; rules_version?: string;
  dataset?: { complaints: number; issues: number; sentiment_available: boolean };
  trend_status?: { status: string; reason?: string | null; period_prev?: string[] | null; period_recent?: string[] | null; volume_change_pct?: number | null };
  method?: { signals: Record<string, number>; tiers: { name: string; min_score: number }[]; note: string };
  coverage?: { specific_rule_pct: number; exact_match_pct: number; pattern_match_pct: number; fallback_only_pct: number; unmatched_issues: { issue: string; count: number }[] };
  themes: { rule_id: string; title: string; count: number; share_pct: number; issues: { name: string; count: number }[] }[];
  items: RecommendationItem[]; limitations: string[];
}

export interface AnalysisDetail extends AnalysisListItem { report: Record<string, unknown> }
