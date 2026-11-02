import { apiRequest, downloadFile, uploadFile } from '@/services/apiClient';
import type {
  AnalysisDetail, AnalysisListItem, AnalyticsFilters, AppInfo, BreakdownIssue, BreakdownProduct, DashboardResponse, Dataset, DatasetDetail, DatasetPreview, FilterOptions,
  HealthResponse, Job, ModelCard, NamedCount, PredictResponse, RankedList, RecommendationReport, RisingResponse,
  SentimentResults, TrendsResponse, User,
} from '@/types/api';
import type { CountItem, DashboardFilters, DashboardSummary, PredictionRequest, PredictionResponse } from '@/types/types';

// ------------------------------------------------------------------ system / auth
export const fetchHealth = (signal?: AbortSignal) => apiRequest<HealthResponse>('/api/health', { signal, authRequired: false });
export const fetchInfo = (signal?: AbortSignal) => apiRequest<AppInfo>('/api/info', { signal });
export const fetchModelCard = (signal?: AbortSignal) => apiRequest<ModelCard>('/api/model', { signal });

export const getMe = (signal?: AbortSignal) => apiRequest<User>('/api/auth/me', { signal, authRequired: false });
export const registerUser = (body: { email: string; password: string; display_name: string }) =>
  apiRequest<User>('/api/auth/register', { method: 'POST', body, authRequired: false });
export const loginUser = (body: { email: string; password: string }) =>
  apiRequest<User>('/api/auth/login', { method: 'POST', body, authRequired: false });
export const logoutUser = () => apiRequest<void>('/api/auth/logout', { method: 'POST', authRequired: false });
export const changePassword = (body: { current_password: string; new_password: string }) =>
  apiRequest<void>('/api/auth/password', { method: 'POST', body });
export const deleteAccount = (password: string) => apiRequest<void>('/api/auth/account', { method: 'DELETE', body: { password } });

// ------------------------------------------------------------------ datasets and jobs
export const listDatasets = (signal?: AbortSignal) => apiRequest<Dataset[]>('/api/datasets', { signal });
export const getDataset = (id: string, signal?: AbortSignal) => apiRequest<DatasetDetail>(`/api/datasets/${id}`, { signal });
export const uploadDataset = (file: File, onProgress?: (percent: number) => void, signal?: AbortSignal) =>
  uploadFile<DatasetDetail>('/api/datasets', file, onProgress, signal);
export const saveMapping = (id: string, mapping: Record<string, string>) =>
  apiRequest<DatasetDetail>(`/api/datasets/${id}/mapping`, { method: 'POST', body: { mapping } });
export const previewDataset = (id: string, page: number, pageSize = 10, signal?: AbortSignal) =>
  apiRequest<DatasetPreview>(`/api/datasets/${id}/preview`, { query: { page, page_size: pageSize }, signal });
export const removeDataset = (id: string) => apiRequest<void>(`/api/datasets/${id}`, { method: 'DELETE' });
export const downloadCleaned = (id: string) => downloadFile(`/api/datasets/${id}/download/cleaned`, undefined, 'cleaned.csv');

export const listJobs = (id: string, signal?: AbortSignal) => apiRequest<Job[]>(`/api/datasets/${id}/jobs`, { signal });
export const startSentiment = (id: string) => apiRequest<Job>(`/api/datasets/${id}/sentiment`, { method: 'POST' });
export const startPredictions = (id: string) => apiRequest<Job>(`/api/datasets/${id}/predictions`, { method: 'POST' });

export const listAnalyses = (limit = 5, signal?: AbortSignal) =>
  apiRequest<AnalysisListItem[]>('/api/analyses', { query: { limit }, signal });

// ------------------------------------------------------------------ dashboard (adapter to the UI's shapes)
export const fetchFilterOptions = (id: string, signal?: AbortSignal) =>
  apiRequest<FilterOptions>(`/api/datasets/${id}/filters`, { signal });

const toCountItem = (n: NamedCount): CountItem => ({ label: n.name, count: n.count, percentage: n.pct });

/** Pure mapping from our dashboard response to what the existing dashboard components display. */
export function toDashboardSummary(d: DashboardResponse, productDistribution: NamedCount[]): DashboardSummary {
  const complete = d.monthly.filter((m) => !m.partial);
  const basis = complete.length ? complete : d.monthly;
  const avg = basis.length ? basis.reduce((sum, m) => sum + m.count, 0) / basis.length : null;
  const s = d.sentiment;
  return {
    total_complaints: d.metrics.total_complaints,
    total_products: d.metrics.unique_products,
    total_issues: d.metrics.unique_issues,
    avg_complaints_per_month: avg,
    date_min: d.metrics.date_min,
    date_max: d.metrics.date_max,
    narrative_pct: d.metrics.narrative_pct,
    most_reported_product: d.top_products[0]?.name ?? null,
    most_frequent_issue: d.top_issues[0]?.name ?? null,
    monthly_trend: d.monthly.map((m) => ({ month: m.month, complaints: m.count, partial: m.partial })),
    latest_month_partial: d.monthly.length > 0 && d.monthly[d.monthly.length - 1].partial,
    top_products: d.top_products.map(toCountItem),
    top_issues: d.top_issues.map(toCountItem),
    product_distribution: productDistribution.map(toCountItem),
    sentiment_distribution:
      s && s.analysed > 0 ? { positive: s.counts.Positive, negative: s.counts.Negative, neutral: s.counts.Neutral } : null,
  };
}

export async function fetchDashboardSummary(datasetId: string, filters: DashboardFilters, signal?: AbortSignal): Promise<DashboardSummary> {
  const query = { date_from: filters.start_date, date_to: filters.end_date, product: filters.product };
  const [dashboard, products] = await Promise.all([
    apiRequest<DashboardResponse>(`/api/datasets/${datasetId}/dashboard`, { query, signal }),
    apiRequest<{ items: NamedCount[] }>(`/api/datasets/${datasetId}/analytics/products`, { query: { ...query, limit: 8 }, signal }),
  ]);
  return toDashboardSummary(dashboard, products.items);
}

// ------------------------------------------------------------------ prediction (adapter)
export function toPredictionResponse(r: PredictResponse): PredictionResponse {
  return {
    predicted_product: r.predicted_product,
    confidence: r.confidence,
    confidence_level: r.confidence_level ?? null,
    top_predictions: r.top_predictions ?? [],
    message: r.status === 'insufficient_text' ? (r.message ?? 'The text has no words the model recognises.') : null,
  };
}

export async function predictComplaint(request: PredictionRequest, signal?: AbortSignal): Promise<PredictionResponse> {
  return toPredictionResponse(await apiRequest<PredictResponse>('/api/predict', { method: 'POST', body: request, signal }));
}

// ------------------------------------------------------------------ analytics / sentiment / recommendations / reports
const q = (f: AnalyticsFilters = {}) => ({ date_from: f.date_from, date_to: f.date_to, product: f.product, issue: f.issue, sentiment: f.sentiment });
const base = (id: string) => `/api/datasets/${id}`;

export const fetchIssues = (id: string, f: AnalyticsFilters, limit = 15, signal?: AbortSignal) =>
  apiRequest<RankedList>(`${base(id)}/analytics/issues`, { query: { ...q(f), limit }, signal });
export const fetchProducts = (id: string, f: AnalyticsFilters, limit = 15, signal?: AbortSignal) =>
  apiRequest<RankedList>(`${base(id)}/analytics/products`, { query: { ...q(f), limit }, signal });
export const fetchTrends = (id: string, f: AnalyticsFilters, by: 'none' | 'product' | 'issue' = 'none', top = 5, signal?: AbortSignal) =>
  apiRequest<TrendsResponse>(`${base(id)}/analytics/trends`, { query: { ...q(f), by, top }, signal });
export const fetchIssueBreakdown = (id: string, issue: string, f: AnalyticsFilters, signal?: AbortSignal) =>
  apiRequest<BreakdownIssue>(`${base(id)}/analytics/breakdown`, { query: { ...q(f), issue }, signal });
export const fetchProductBreakdown = (id: string, product: string, f: AnalyticsFilters, signal?: AbortSignal) =>
  apiRequest<BreakdownProduct>(`${base(id)}/analytics/breakdown`, { query: { ...q(f), product }, signal });
export const fetchRising = (id: string, f: AnalyticsFilters, by: 'issue' | 'product' = 'issue', windowMonths = 12, signal?: AbortSignal) =>
  apiRequest<RisingResponse>(`${base(id)}/analytics/rising`, { query: { ...q(f), by, window_months: windowMonths }, signal });
export const fetchSentimentResults = (id: string, f: AnalyticsFilters, signal?: AbortSignal) =>
  apiRequest<SentimentResults>(`${base(id)}/sentiment`, { query: q(f), signal });
export const fetchRecommendations = (id: string, f: AnalyticsFilters, topN = 10, signal?: AbortSignal) =>
  apiRequest<RecommendationReport>(`${base(id)}/recommendations`, { query: { ...q(f), top_n: topN }, signal });

export const saveReport = (id: string, kind: 'recommendations' | 'summary', title?: string, product?: string) =>
  apiRequest<AnalysisDetail>(`${base(id)}/reports`, { method: 'POST', body: { kind, title: title || null, filters: { products: product ? [product] : [] } } });
export const getAnalysis = (id: string, signal?: AbortSignal) => apiRequest<AnalysisDetail>(`/api/analyses/${id}`, { signal });
export const removeAnalysis = (id: string) => apiRequest<void>(`/api/analyses/${id}`, { method: 'DELETE' });
export const exportAnalysis = (id: string, format: 'csv' | 'md' | 'json') =>
  downloadFile(`/api/analyses/${id}/export`, { format }, `report.${format}`);
