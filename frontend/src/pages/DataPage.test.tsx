import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { validateFile } from '@/components/data/UploadDropzone';
import { DATASET_ID, FakeXHR, FIXTURE, signedInBackend } from '@/test/fakeBackend';
import { renderApp } from '@/test/render';

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
const detail = FIXTURE.detail as Record<string, unknown> & { cleaning_report: Record<string, unknown> };
const csv = (name = 'complaints.csv', size = 20) => new File([new Uint8Array(size).fill(97)], name, { type: 'text/csv' });
const fileInput = () => screen.getByLabelText('Choose a CSV file');

describe('validateFile (instant browser checks)', () => {
  it.each([
    ['data.xlsx', 10, 500, 'Please choose a .csv file.'],
    ['empty.csv', 0, 500, 'That file is empty.'],
    ['big.csv', 3 * 1048576, 2, 'The limit is 2 MB.'],
  ])('%s', (name, size, max, expected) => {
    expect(validateFile({ name, size } as File, max)).toContain(expected);
  });
  it('accepts a normal CSV in any letter case', () => expect(validateFile({ name: 'DATA.CSV', size: 100 } as File, 500)).toBeNull());
});

describe('upload', () => {
  it('rejects wrong files without contacting the server', async () => {
    vi.stubGlobal('XMLHttpRequest', FakeXHR); FakeXHR.last = null;
    signedInBackend(); renderApp('/app/data');
    const input = await waitFor(fileInput);
    await userEvent.upload(input, new File(['x'], 'notes.txt', { type: 'text/plain' }), { applyAccept: false });
    expect(await screen.findByRole('alert')).toHaveTextContent('Please choose a .csv file.');
    expect(FakeXHR.last).toBeNull();
  });
  it('rejects a file over the limit shown by the server', async () => {
    vi.stubGlobal('XMLHttpRequest', FakeXHR); FakeXHR.last = null;
    signedInBackend().on('GET /api/info', { json: { ...FIXTURE.info, limits: { ...FIXTURE.info.limits, max_upload_mb: 1 } } });
    renderApp('/app/data');
    await screen.findByText(/Up to 1 MB/);
    await userEvent.upload(fileInput(), csv('big.csv', 2 * 1048576), { applyAccept: false });
    expect(await screen.findByRole('alert')).toHaveTextContent('The limit is 1 MB.');
    expect(FakeXHR.last).toBeNull();
  });
  it('shows progress, then selects the new dataset and shows it being cleaned', async () => {
    vi.stubGlobal('XMLHttpRequest', FakeXHR);
    const b = signedInBackend().on('GET /api/datasets', { json: [] });
    renderApp('/app/data');
    await userEvent.upload(await waitFor(fileInput), csv());
    await waitFor(() => expect(FakeXHR.last).not.toBeNull());
    act(() => FakeXHR.last!.progress(40, 100));
    expect(await screen.findByText(/Uploading complaints.csv... 40%/)).toBeInTheDocument();
    b.on('GET /api/datasets', { json: [{ ...FIXTURE.datasets[0], status: 'processing', rows: null, summary: null }] })
     .on('GET /api/datasets/:id', { json: { ...detail, status: 'processing', rows: null, summary: null, cleaning_report: null, profile: null } });
    await act(async () => FakeXHR.last!.respond(201, { ...detail, status: 'processing' }));
    expect(await screen.findByText('Cleaning your data')).toBeInTheDocument();
    expect(FakeXHR.last!.url).toBe('/api/datasets');
  });
  it('shows the server reason when the upload is refused', async () => {
    vi.stubGlobal('XMLHttpRequest', FakeXHR);
    signedInBackend(); renderApp('/app/data');
    await userEvent.upload(await waitFor(fileInput), csv());
    await waitFor(() => expect(FakeXHR.last).not.toBeNull());
    await act(async () => FakeXHR.last!.respond(409, { detail: 'You have reached the limit of 20 datasets. Delete one first.' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('You have reached the limit of 20 datasets');
  });
});

describe('data-quality report', () => {
  it('shows what was found and changed, using the numbers from the server', async () => {
    const report = { ...detail.cleaning_report, rows_in: 900, rows_out: 897, duplicate_ids_removed: 3, invalid_dates: 2, invalid_date_examples: ['not a date'],
      blank_text_to_missing: { narrative: 230 }, exact_duplicate_rows_found: 5, exact_duplicate_rows_removed: 0, notes: ['2 rows have a missing/unreadable date; they are kept but excluded from time-based charts.'] };
    signedInBackend().on('GET /api/datasets/:id', { json: { ...detail, cleaning_report: report } });
    renderApp('/app/data');
    await screen.findByRole('heading', { name: 'Data-quality report' });
    const q = screen;
    expect(q.getByText('Rows read').parentElement).toHaveTextContent('900');
    expect(q.getByText('Rows kept').parentElement).toHaveTextContent('897');
    expect(q.getByText(/3 rows with a repeated complaint ID were removed/)).toBeInTheDocument();
    expect(q.getByText(/5 rows are identical.*they were kept, because different customers/)).toBeInTheDocument();
    expect(q.getByText('not a date')).toBeInTheDocument();
    expect(q.getByText(/Complaint narrative \(230\)/)).toBeInTheDocument();
    expect(q.getByText(/excluded from time-based charts/)).toBeInTheDocument();
    expect(within(q.getByText('Missing values by column').parentElement!).getAllByRole('row').length).toBeGreaterThan(5);
  });
  it('pages through the cleaned preview', async () => {
    const b = signedInBackend().on('GET /api/datasets/:id/preview', (req) => ({ json: { ...FIXTURE.preview, page: Number(req.query.get('page')), total_rows: 900 } }));
    renderApp('/app/data');
    await screen.findByText('Preview of the cleaned data');
    await userEvent.click(await screen.findByRole('button', { name: /next/i }));
    await waitFor(() => expect(b.callsTo('GET', `/api/datasets/${DATASET_ID}/preview`).some((c) => c.query.get('page') === '2')).toBe(true));
  });
});

describe('column mapping', () => {
  const needs = { ...detail, status: 'needs_mapping', rows: null, summary: null, cleaning_report: null, profile: null, mapping: {}, error: 'Some required columns could not be found: date, product, issue.', file_columns: ['Filed on', 'Line of business', 'What went wrong'] };
  const setup = () => signedInBackend().on('GET /api/datasets', { json: [{ ...FIXTURE.datasets[0], status: 'needs_mapping', rows: null, summary: null, error: needs.error }] }).on('GET /api/datasets/:id', { json: needs });
  it('asks for the missing columns and will not submit until they are chosen', async () => {
    const b = setup(); renderApp('/app/data');
    expect(await screen.findByText(/required columns could not be found/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Save and clean data' }));
    expect(await screen.findByText('Choose a column for: Date, Product, Issue.')).toHaveAttribute('role', 'alert');
    expect(b.callsTo('POST', `/api/datasets/${DATASET_ID}/mapping`)).toHaveLength(0);
  });
  it('sends the chosen columns', async () => {
    const b = setup().on('POST /api/datasets/:id/mapping', { json: { ...needs, status: 'processing' } });
    renderApp('/app/data');
    await userEvent.selectOptions(await screen.findByLabelText('Date *'), 'Filed on');
    await userEvent.selectOptions(screen.getByLabelText('Product *'), 'Line of business');
    await userEvent.selectOptions(screen.getByLabelText('Issue *'), 'What went wrong');
    await userEvent.click(screen.getByRole('button', { name: 'Save and clean data' }));
    await waitFor(() => expect(b.callsTo('POST', `/api/datasets/${DATASET_ID}/mapping`)).toHaveLength(1));
    expect(b.callsTo('POST', `/api/datasets/${DATASET_ID}/mapping`)[0].body).toEqual({ mapping: { date: 'Filed on', product: 'Line of business', issue: 'What went wrong' } });
  });
});

describe('deleting and downloading', () => {
  it('asks for confirmation, and only deletes after it', async () => {
    const b = signedInBackend().on('DELETE /api/datasets/:id', { status: 204 });
    renderApp('/app/data');
    await userEvent.click(await screen.findByRole('button', { name: /^Delete$/ }));
    expect(await screen.findByText('Delete this dataset?')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(b.callsTo('DELETE', `/api/datasets/${DATASET_ID}`)).toHaveLength(0);
    await userEvent.click(screen.getByRole('button', { name: /^Delete$/ }));
    b.on('GET /api/datasets', { json: [] });
    await userEvent.click(await screen.findByRole('button', { name: 'Delete permanently' }));
    await waitFor(() => expect(b.callsTo('DELETE', `/api/datasets/${DATASET_ID}`)).toHaveLength(1));
    expect(await screen.findByText('No datasets yet')).toBeInTheDocument();
  });
  it('downloads the cleaned CSV', async () => {
    const b = signedInBackend().on('GET /api/datasets/:id/download/cleaned', { text: 'date,product\n', headers: { 'content-disposition': 'attachment; filename="cleaned_rich.csv"' } });
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} }));
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    renderApp('/app/data');
    await userEvent.click(await screen.findByRole('button', { name: /download cleaned csv/i }));
    await waitFor(() => expect(click).toHaveBeenCalled());
    expect(b.callsTo('GET', `/api/datasets/${DATASET_ID}/download/cleaned`)).toHaveLength(1);
    click.mockRestore();
  });
});

describe('analysis jobs', () => {
  it('starts sentiment, shows progress from the server, and refreshes when finished', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const base = FIXTURE as unknown as { detail: { id: string } };
    const job = (status: string, progress: number) => ({ id: 'j1', dataset_id: base.detail.id, kind: 'sentiment', status, progress, error: null, created_at: '2026-01-01T00:00:00Z', finished_at: null as string | null });
    let current = job('running', 35); let started = false;
    const b = signedInBackend().on('POST /api/datasets/:id/sentiment', () => { started = true; return { status: 202, json: current }; }).on('GET /api/datasets/:id/jobs', () => ({ json: started ? [current] : [] }));
    renderApp('/app/data');
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click((await screen.findAllByRole('button', { name: 'Run' }))[0]);
    expect(await screen.findByText('Working... 35%')).toBeInTheDocument();
    expect(b.callsTo('POST', `/api/datasets/${DATASET_ID}/sentiment`)).toHaveLength(1);
    current = { ...job('done', 100), finished_at: '2026-01-01T00:03:00Z' };
    await act(async () => { await vi.advanceTimersByTimeAsync(2200); });
    expect(await screen.findByText('Finished. Results are ready.')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Run again' })).toHaveLength(1);
  });
  it('explains why it is disabled when there are no narratives', async () => {
    signedInBackend().on('GET /api/datasets', { json: [{ ...FIXTURE.datasets[0], summary: { ...FIXTURE.datasets[0].summary, narratives_present: 0 } }] });
    renderApp('/app/data');
    expect(await screen.findByText(/no complaint narratives, so sentiment and prediction are not possible/i)).toBeInTheDocument();
    for (const btn of screen.getAllByRole('button', { name: 'Run' })) expect(btn).toBeDisabled();
  });
  it('shows a failed job message', async () => {
    signedInBackend().on('GET /api/datasets/:id/jobs', { json: [{ id: 'j', dataset_id: DATASET_ID, kind: 'prediction', status: 'failed', progress: 10, error: 'The prediction model is not available on the server.', created_at: '2026-01-01T00:00:00Z', finished_at: null }] });
    renderApp('/app/data');
    expect(await screen.findByText('The prediction model is not available on the server.')).toBeInTheDocument();
  });
});
