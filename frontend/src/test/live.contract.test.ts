// @vitest-environment node
/**
 * Runs the frontend's REAL api.ts functions against a REAL running backend.
 * Skipped unless LIVE_API=1.   LIVE_API=1 VITE_API_BASE_URL=http://127.0.0.1:8000 LIVE_CSV=/path/to.csv npx vitest run src/test/live
 * (Upload by XMLHttpRequest and file downloads need a browser; those paths are covered by the unit tests.)
 */
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as api from '@/services/api';
import { ApiError, setUnauthorizedHandler } from '@/services/apiClient';

const LIVE = process.env.LIVE_API === '1';
const BASE = process.env.VITE_API_BASE_URL ?? '';
const CSV = process.env.LIVE_CSV ?? '';

// Node's fetch has no cookie jar, so keep the session cookie like a browser would.
const jar = new Map<string, string>();
const realFetch = globalThis.fetch;
function jarFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  if (jar.size) headers.set('Cookie', [...jar].map(([k, v]) => `${k}=${v}`).join('; '));
  return realFetch(input, { ...init, headers }).then((res) => {
    for (const line of res.headers.getSetCookie?.() ?? []) {
      const [pair, ...attrs] = line.split(';');
      const [name, value] = pair.split('=');
      const gone = attrs.some((a) => /^\s*max-age=0/i.test(a)) || value === '' || /expires=thu, 01 jan 1970/i.test(line);
      if (gone) jar.delete(name.trim()); else jar.set(name.trim(), value);
    }
    return res;
  });
}

/** Parses the simple, fully quoted CSV the test generator writes. */
function readRows(path: string): Record<string, string>[] {
  const [head, ...lines] = readFileSync(path, 'utf8').trim().split('\n');
  const cols = [...head.matchAll(/[^,]+/g)].map((m) => m[0]);
  return lines.map((l: string) => Object.fromEntries([...l.matchAll(/"([^"]*)"/g)].map((m, i) => [cols[i], m[1]])));
}

describe.skipIf(!LIVE)('frontend api.ts against the real backend', () => {
  const rows = LIVE ? readRows(CSV) : [];
  let datasetId = '';
  const email = `contract-${Date.now()}@example.com`;
  const password = 'a long contract passphrase';

  beforeAll(() => { globalThis.fetch = jarFetch as typeof fetch; });
  afterAll(() => { globalThis.fetch = realFetch; setUnauthorizedHandler(null); });

  it('is pointed at an absolute URL', () => expect(BASE).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/));

  it('registers and recognises the session', async () => {
    const u = await api.registerUser({ email, password, display_name: 'Contract Test' });
    expect(u).toMatchObject({ email, display_name: 'Contract Test' });
    expect((await api.getMe()).id).toBe(u.id);
  });

  it('uploads a CSV and the dataset becomes ready with the right numbers', async () => {
    const form = new FormData();
    form.append('file', new Blob([readFileSync(CSV)], { type: 'text/csv' }), 'contract.csv');
    const res = await jarFetch(`${BASE}/api/datasets`, { method: 'POST', body: form });
    expect(res.status).toBe(201);
    datasetId = ((await res.json()) as { id: string }).id;
    let d = await api.getDataset(datasetId);
    for (let i = 0; i < 40 && d.status !== 'ready'; i++) { await new Promise((r) => setTimeout(r, 500)); d = await api.getDataset(datasetId); }
    expect(d.status).toBe('ready');
    expect(d.rows).toBe(rows.length);
    expect(d.cleaning_report!.rows_in).toBe(rows.length);
    expect(d.required_fields).toEqual(['date', 'product', 'issue']);
    expect((await api.listDatasets()).map((x) => x.id)).toContain(datasetId);
  });

  it('filter options match the data', async () => {
    const f = await api.fetchFilterOptions(datasetId);
    expect(f.products).toEqual([...new Set(rows.map((r) => r['Product']))].sort());
    expect(f.sentiment_available).toBe(false);
  });

  it('dashboard summary (through the adapter) equals an independent count of the CSV', async () => {
    const s = await api.fetchDashboardSummary(datasetId, {});
    expect(s.total_complaints).toBe(rows.length);
    expect(s.total_products).toBe(new Set(rows.map((r) => r['Product'])).size);
    expect(s.total_issues).toBe(new Set(rows.map((r) => r['Issue'])).size);
    const issueCounts = new Map<string, number>();
    rows.forEach((r) => issueCounts.set(r['Issue'], (issueCounts.get(r['Issue']) ?? 0) + 1));
    const top = [...issueCounts].sort((a, b) => b[1] - a[1])[0];
    expect(s.top_issues[0]).toMatchObject({ label: top[0], count: top[1] });
    expect(s.monthly_trend.reduce((n, m) => n + m.complaints, 0)).toBe(rows.length);
    expect(s.sentiment_distribution).toBeNull();
    expect(s.narrative_pct).toBeCloseTo((100 * rows.filter((r) => r['Consumer complaint narrative'] !== '').length) / rows.length, 1);
  });

  it('product and date filters give the same numbers as counting the CSV', async () => {
    const mort = rows.filter((r) => r['Product'] === 'Mortgage').length;
    expect((await api.fetchDashboardSummary(datasetId, { product: 'Mortgage' })).total_complaints).toBe(mort);
    const in2016 = rows.filter((r) => r['Date received'].endsWith('/2016')).length;
    expect((await api.fetchDashboardSummary(datasetId, { start_date: '2016-01-01', end_date: '2016-12-31' })).total_complaints).toBe(in2016);
  });

  it('sentiment runs as a job and then appears in the dashboard', async () => {
    const job = await api.startSentiment(datasetId);
    expect(['queued', 'running', 'done']).toContain(job.status);
    let jobs = await api.listJobs(datasetId);
    for (let i = 0; i < 80 && jobs[0].status !== 'done' && jobs[0].status !== 'failed'; i++) { await new Promise((r) => setTimeout(r, 500)); jobs = await api.listJobs(datasetId); }
    expect(jobs[0]).toMatchObject({ kind: 'sentiment', status: 'done', progress: 100 });
    const s = await api.fetchDashboardSummary(datasetId, {});
    const withText = rows.filter((r) => r['Consumer complaint narrative'] !== '').length;
    const d = s.sentiment_distribution!;
    expect(d.positive + d.negative + d.neutral).toBe(withText);          // missing text is not counted as anything
    expect((await api.fetchFilterOptions(datasetId)).sentiment_available).toBe(true);
  });

  it('single prediction, model card and info', async () => {
    const p = await api.predictComplaint({ text: 'A debt collector keeps calling me about a debt that is not mine' });
    expect(p.predicted_product).toBe('Debt collection');
    expect(p.confidence).toBeGreaterThan(0); expect(p.top_predictions.length).toBe(3); expect(p.message).toBeNull();
    const none = await api.predictComplaint({ text: 'zzzz qqqq 12345' });
    expect(none.predicted_product).toBeNull(); expect(none.message).toBeTruthy();
    const m = await api.fetchModelCard();
    expect(m.evaluation.accuracy).toBeCloseTo(0.8502, 4); expect(m.classes).toHaveLength(12);
    expect((await api.fetchInfo()).privacy.storage.length).toBeGreaterThan(0);
    expect((await api.fetchHealth()).status).toBe('ok');
  });

  it('preview pages come back with the columns the table expects', async () => {
    const p = await api.previewDataset(datasetId, 2, 10);
    expect(p).toMatchObject({ page: 2, page_size: 10, total_rows: rows.length });
    expect(Object.keys(p.rows[0])).toEqual(expect.arrayContaining(['date', 'product', 'issue', 'narrative', 'complaint_id']));
  });

  it('re-mapping re-cleans the file and discards the stale sentiment', async () => {
    await api.saveMapping(datasetId, { issue: 'Issue' });
    let d = await api.getDataset(datasetId);
    for (let i = 0; i < 40 && d.status !== 'ready'; i++) { await new Promise((r) => setTimeout(r, 500)); d = await api.getDataset(datasetId); }
    expect(d.status).toBe('ready');
    expect((await api.fetchDashboardSummary(datasetId, {})).sentiment_distribution).toBeNull();
  });

  it('errors arrive as readable ApiError messages', async () => {
    const err = await api.getDataset('00000000-0000-0000-0000-000000000000').catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 404, message: 'Dataset not found.' });
    const bad = await api.predictComplaint({ text: '   ' }).catch((e) => e);
    expect(bad).toMatchObject({ status: 422 }); expect(bad.message).not.toMatch(/\[object/);
  });

  it('deletes the dataset, signs out, and then a protected call is rejected with 401', async () => {
    await api.removeDataset(datasetId);
    expect(await api.listDatasets()).toEqual([]);
    await api.logoutUser();
    let called = 0; setUnauthorizedHandler(() => { called++; });
    const err = await api.listDatasets().catch((e) => e);
    expect(err).toMatchObject({ status: 401 }); expect(called).toBe(1);
    await api.loginUser({ email, password });
    await api.deleteAccount(password);
    expect(await api.getMe().catch((e) => e.status)).toBe(401);
  });
});
