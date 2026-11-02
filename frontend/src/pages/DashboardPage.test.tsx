import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DATASET_ID, FIXTURE, signedInBackend } from '@/test/fakeBackend';
import { renderApp } from '@/test/render';
import withSentiment from '@/test/fixtures/dashboard_with_sentiment.json';

afterEach(() => vi.unstubAllGlobals());
const dash = (over: Record<string, unknown>) => ({ ...FIXTURE.dashboardNo, ...over });

describe('dashboard', () => {
  it('shows the real totals from the server', async () => {
    signedInBackend(); renderApp('/app');
    const kpi = (label: string) => screen.getByText(label).parentElement!.parentElement!;
    await screen.findByText('Total Complaints');
    await waitFor(() => expect(kpi('Total Complaints')).toHaveTextContent('900'));
    expect(kpi('Total Products')).toHaveTextContent('4');
    expect(kpi('Total Issues')).toHaveTextContent('4');
    expect(kpi('Avg. Complaints / Month')).toHaveTextContent('25');
    expect(kpi('Avg. Complaints / Month')).toHaveTextContent('Complete months only');
  });
  it('names the most reported product and issue from the data, not from fixed text', async () => {
    signedInBackend().on('GET /api/datasets/:id/dashboard', { json: dash({ top_products: [{ name: 'Zebra Loans', count: 5, pct: 100 }], top_issues: [{ name: 'Stripes fade', count: 5, pct: 100 }] }) });
    renderApp('/app');
    expect(await screen.findByText('Zebra Loans', { selector: 'p, span, div' })).toBeInTheDocument();
    expect(screen.getAllByText('Stripes fade').length).toBeGreaterThan(0);
  });
  it('says plainly that sentiment has not been run, instead of showing zeros', async () => {
    signedInBackend(); renderApp('/app');
    expect(await screen.findByText('Sentiment has not been run for this dataset yet.')).toBeInTheDocument();
    expect(screen.getByText(/never counted as neutral/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /run sentiment analysis/i })).toHaveAttribute('href', '/app/data');
  });
  it('shows the sentiment split once it exists', async () => {
    signedInBackend().on('GET /api/datasets/:id/dashboard', { json: withSentiment });
    renderApp('/app');
    expect(await screen.findByText('Positive')).toBeInTheDocument();
    expect(screen.getByText('Negative')).toBeInTheDocument();
    expect(screen.queryByText('Sentiment has not been run for this dataset yet.')).toBeNull();
  });
  it('warns when the latest month is incomplete', async () => {
    const monthly = [{ month: '2016-04', count: 100, partial: false }, { month: '2016-05', count: 30, partial: true }];
    signedInBackend().on('GET /api/datasets/:id/dashboard', { json: dash({ monthly, metrics: { ...FIXTURE.dashboardNo.metrics, date_max: '2016-05-18' } }) });
    renderApp('/app');
    expect(await screen.findByText(/latest month is incomplete/i)).toHaveTextContent('18');
  });
  it('requests filtered data when a product is chosen', async () => {
    const b = signedInBackend(); renderApp('/app');
    await screen.findByText('Total Complaints');
    await userEvent.selectOptions(screen.getByLabelText('Product'), 'Mortgage');
    await waitFor(() => expect(b.callsTo('GET', `/api/datasets/${DATASET_ID}/dashboard`).some((c) => c.query.get('product') === 'Mortgage')).toBe(true));
  });
  it('offers the products that exist in this dataset', async () => {
    signedInBackend(); renderApp('/app');
    const select = await screen.findByLabelText('Product');
    await waitFor(() => expect(within(select).getAllByRole('option').length).toBe(FIXTURE.filters.products.length + 1));
  });
  it('lists saved reports, or says there are none', async () => {
    signedInBackend(); const { unmount } = renderApp('/app');
    expect(await screen.findByText(FIXTURE.analyses[0].title!)).toBeInTheDocument();
    unmount();
    signedInBackend().on('GET /api/analyses', { json: [] }); renderApp('/app');
    expect(await screen.findByText(/have not saved any reports yet/i)).toBeInTheDocument();
  });
  it('never shows raw complaint text', async () => {
    signedInBackend(); renderApp('/app'); await screen.findByText('Total Complaints');
    expect(screen.queryByText(/Recent Complaints/i)).toBeNull();
  });
});

describe('when there is nothing to show', () => {
  it('invites the user to upload when they have no datasets', async () => {
    signedInBackend().on('GET /api/datasets', { json: [] }); renderApp('/app');
    expect(await screen.findByText('No data yet')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /upload data/i })).toHaveAttribute('href', '/app/data');
  });
  it('explains a dataset that is still being cleaned', async () => {
    signedInBackend().on('GET /api/datasets', { json: [{ ...FIXTURE.datasets[0], status: 'processing', rows: null, summary: null }] }); renderApp('/app');
    expect(await screen.findByText(/is not ready/)).toBeInTheDocument();
    expect(screen.getByText(/being cleaned/i)).toBeInTheDocument();
  });
  it('shows a failed dataset with the reason', async () => {
    signedInBackend().on('GET /api/datasets', { json: [{ ...FIXTURE.datasets[0], status: 'failed', error: 'The CSV contains a header but no data rows.' }] }); renderApp('/app');
    expect(await screen.findByText('The CSV contains a header but no data rows.')).toBeInTheDocument();
  });
  it('shows an error with a working retry when the server fails', async () => {
    let fail = true;
    const b = signedInBackend().on('GET /api/datasets/:id/dashboard', () => (fail ? { status: 500, json: { detail: 'Something went wrong on the server.' } } : { json: FIXTURE.dashboardNo }));
    renderApp('/app');
    expect(await screen.findByText('Something went wrong on the server.')).toBeInTheDocument();
    fail = false;
    await userEvent.click(screen.getByRole('button', { name: /retry|try again/i }));
    expect(await screen.findByText('Total Complaints')).toBeInTheDocument();
    expect(b.callsTo('GET', `/api/datasets/${DATASET_ID}/dashboard`).length).toBeGreaterThan(1);
  });
  it('shows zero results for a filter that matches nothing instead of crashing', async () => {
    signedInBackend().on('GET /api/datasets/:id/dashboard', { json: dash({ monthly: [], top_products: [], top_issues: [], metrics: { ...FIXTURE.dashboardNo.metrics, total_complaints: 0, unique_products: 0, unique_issues: 0 } }) });
    renderApp('/app');
    expect(await screen.findByText(/No monthly data for this selection/)).toBeInTheDocument();
  });
});

describe('dataset switcher', () => {
  it('switches datasets, remembers the choice and reloads the dashboard for the new one', async () => {
    const second = { ...FIXTURE.datasets[0], id: '11111111-1111-1111-1111-111111111111', original_filename: 'second.csv' };
    const b = signedInBackend().on('GET /api/datasets', { json: [FIXTURE.datasets[0], second] });
    renderApp('/app');
    const select = await screen.findByLabelText('Dataset');
    await userEvent.selectOptions(select, second.id);
    await waitFor(() => expect(b.callsTo('GET', `/api/datasets/${second.id}/dashboard`).length).toBeGreaterThan(0));
    expect(localStorage.getItem('complainiq.dataset')).toBe(second.id);
  });
  it('falls back to a valid dataset when the remembered one no longer exists', async () => {
    localStorage.setItem('complainiq.dataset', '99999999-9999-9999-9999-999999999999');
    const b = signedInBackend(); renderApp('/app');
    await screen.findByText('Total Complaints');
    expect(b.callsTo('GET', `/api/datasets/${DATASET_ID}/dashboard`).length).toBeGreaterThan(0);
    expect(b.calls.some((c) => c.path.includes('9999'))).toBe(false);
  });
});

describe('remembering the chosen dataset', () => {
  const second = { ...FIXTURE.datasets[0], id: '22222222-2222-2222-2222-222222222222', original_filename: 'second.csv' };
  it('chooseSelected keeps a valid stored choice, otherwise prefers the newest ready dataset', async () => {
    const { chooseSelected } = await import('@/context/DatasetContext');
    const a = { ...FIXTURE.datasets[0], id: 'a', status: 'processing' } as never;
    const b = { ...FIXTURE.datasets[0], id: 'b', status: 'ready' } as never;
    const c = { ...FIXTURE.datasets[0], id: 'c', status: 'ready' } as never;
    expect(chooseSelected([a, b, c], 'c')).toBe('c');            // remembered
    expect(chooseSelected([a, b, c], 'gone')).toBe('b');         // remembered one was deleted -> first READY one
    expect(chooseSelected([a, b, c], null)).toBe('b');
    expect(chooseSelected([a], null)).toBe('a');                 // nothing ready -> still pick something to show its status
    expect(chooseSelected([], 'x')).toBeNull();
  });
  it('opens the remembered dataset after a reload instead of the first one', async () => {
    localStorage.setItem('complainiq.dataset', second.id);
    const b = signedInBackend().on('GET /api/datasets', { json: [FIXTURE.datasets[0], second] });
    renderApp('/app');
    await screen.findByText('Total Complaints');
    expect(b.callsTo('GET', `/api/datasets/${second.id}/dashboard`).length).toBeGreaterThan(0);
    expect(b.callsTo('GET', `/api/datasets/${DATASET_ID}/dashboard`)).toHaveLength(0);
    expect((screen.getByLabelText('Dataset') as HTMLSelectElement).value).toBe(second.id);
  });
});
