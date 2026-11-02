import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchDashboardSummary, toDashboardSummary, toPredictionResponse } from '@/services/api';
import type { DashboardResponse, NamedCount, PredictResponse } from '@/types/api';
import withSentiment from '@/test/fixtures/dashboard_with_sentiment.json';
import noSentiment from '@/test/fixtures/dashboard_no_sentiment.json';
import products from '@/test/fixtures/products.json';
import predictOk from '@/test/fixtures/predict_ok.json';
import predictInsufficient from '@/test/fixtures/predict_insufficient.json';
import { FakeBackend, DATASET_ID } from '@/test/fakeBackend';

afterEach(() => vi.unstubAllGlobals());
const dash = (d: unknown) => d as DashboardResponse;
const prod = products.items as NamedCount[];

describe('toDashboardSummary (real backend responses)', () => {
  const s = toDashboardSummary(dash(withSentiment), prod);
  it('copies the headline numbers', () => {
    expect(s.total_complaints).toBe(900); expect(s.total_products).toBe(4); expect(s.total_issues).toBe(4);
    expect(s.most_reported_product).toBe(dash(withSentiment).top_products[0].name);
    expect(s.most_frequent_issue).toBe(dash(withSentiment).top_issues[0].name);
    expect(s.date_min).toBe(dash(withSentiment).metrics.date_min); expect(s.date_min).toMatch(/^2014-01-\d\d$/);
  });
  it('maps names to labels and keeps percentages', () => {
    expect(s.top_issues[0]).toEqual({ label: dash(withSentiment).top_issues[0].name, count: dash(withSentiment).top_issues[0].count, percentage: dash(withSentiment).top_issues[0].pct });
    expect(s.product_distribution).toHaveLength(prod.length);
  });
  it('turns the monthly series into chart points and averages complete months only', () => {
    expect(s.monthly_trend).toHaveLength(36);
    expect(s.monthly_trend[0]).toMatchObject({ month: '2014-01', complaints: expect.any(Number) });
    expect(s.avg_complaints_per_month).toBeCloseTo(25, 5);
    expect(s.latest_month_partial).toBe(false);
  });
  it('maps capitalised sentiment labels to the chart keys', () => {
    const c = dash(withSentiment).sentiment!.counts;
    expect(s.sentiment_distribution).toEqual({ positive: c.Positive, negative: c.Negative, neutral: c.Neutral });
  });
});

describe('edge cases the real data does not hit', () => {
  it('sentiment that was never run is null, not zero or "all neutral"', () => {
    expect(toDashboardSummary(dash(noSentiment), prod).sentiment_distribution).toBeNull();
  });
  it('sentiment with no analysed narratives is null too', () => {
    const d = dash(JSON.parse(JSON.stringify(withSentiment)));
    d.sentiment!.analysed = 0;
    expect(toDashboardSummary(d, prod).sentiment_distribution).toBeNull();
  });
  it('excludes a partial last month from the average and flags it', () => {
    const d = dash(JSON.parse(JSON.stringify(noSentiment)));
    d.monthly = [{ month: '2016-01', count: 100, partial: false }, { month: '2016-02', count: 200, partial: false }, { month: '2016-03', count: 10, partial: true }];
    const s = toDashboardSummary(d, prod);
    expect(s.avg_complaints_per_month).toBe(150);
    expect(s.latest_month_partial).toBe(true);
    expect(s.monthly_trend[2].partial).toBe(true);
  });
  it('copes with an empty selection', () => {
    const d = dash(JSON.parse(JSON.stringify(noSentiment)));
    Object.assign(d, { monthly: [], top_products: [], top_issues: [] });
    d.metrics.total_complaints = 0;
    const s = toDashboardSummary(d, []);
    expect(s.avg_complaints_per_month).toBeNull(); expect(s.most_reported_product).toBeNull(); expect(s.latest_month_partial).toBe(false);
  });
});

describe('fetchDashboardSummary', () => {
  it('translates the UI filters into the API query and calls both endpoints', async () => {
    const b = new FakeBackend().on('GET /api/datasets/:id/dashboard', { json: noSentiment }).on('GET /api/datasets/:id/analytics/products', { json: products }).install();
    await fetchDashboardSummary(DATASET_ID, { product: 'Mortgage', start_date: '2016-01-01', end_date: '2016-06-30' });
    const dashCall = b.callsTo('GET', `/api/datasets/${DATASET_ID}/dashboard`)[0];
    expect(Object.fromEntries(dashCall.query)).toEqual({ date_from: '2016-01-01', date_to: '2016-06-30', product: 'Mortgage' });
    expect(b.callsTo('GET', `/api/datasets/${DATASET_ID}/analytics/products`)[0].query.get('limit')).toBe('8');
  });
  it('sends no filter parameters when none are chosen', async () => {
    const b = new FakeBackend().on('GET /api/datasets/:id/dashboard', { json: noSentiment }).on('GET /api/datasets/:id/analytics/products', { json: products }).install();
    await fetchDashboardSummary(DATASET_ID, {});
    expect([...b.callsTo('GET', `/api/datasets/${DATASET_ID}/dashboard`)[0].query.keys()]).toEqual([]);
  });
});

describe('toPredictionResponse', () => {
  it('maps a normal prediction', () => {
    const r = toPredictionResponse(predictOk as PredictResponse);
    expect(r.predicted_product).toBe('Debt collection'); expect(r.message).toBeNull();
    expect(r.top_predictions).toHaveLength(3); expect(r.confidence_level).toMatch(/low|moderate|high/);
  });
  it('turns "insufficient text" into a message and no label', () => {
    const r = toPredictionResponse(predictInsufficient as PredictResponse);
    expect(r.predicted_product).toBeNull(); expect(r.confidence).toBeNull(); expect(r.message).toMatch(/recognis/i);
  });
});
