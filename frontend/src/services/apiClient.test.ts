import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, apiRequest, buildUrl, detailMessage, downloadFile, filenameFromDisposition, setUnauthorizedHandler, uploadFile } from '@/services/apiClient';
import { FakeXHR } from '@/test/fakeBackend';

const respond = (status: number, body?: unknown, init: ResponseInit = {}) =>
  vi.fn(async () => new Response(body === undefined ? null : JSON.stringify(body), { status, ...init }));

afterEach(() => { vi.unstubAllGlobals(); setUnauthorizedHandler(null); });

describe('detailMessage', () => {
  it('reads our own string errors', () => expect(detailMessage({ detail: 'Nope.' })).toBe('Nope.'));
  it('joins FastAPI validation messages and strips the technical prefix', () => {
    expect(detailMessage({ detail: [{ msg: 'Value error, Name cannot be blank.' }, { msg: 'Field required' }] })).toBe('Name cannot be blank. Field required');
  });
  it('returns null for anything else', () => {
    expect(detailMessage(null)).toBeNull();
    expect(detailMessage({})).toBeNull();
    expect(detailMessage({ detail: 42 })).toBeNull();
  });
});

describe('buildUrl', () => {
  it('skips empty values and repeats list values', () => {
    expect(buildUrl('/api/x', { a: '', b: undefined, c: null, d: 'z', e: ['1', '2'], f: 0 })).toBe('/api/x?d=z&e=1&e=2&f=0');
  });
  it('encodes special characters', () => expect(buildUrl('/api/x', { q: 'a b&c' })).toBe('/api/x?q=a+b%26c'));
  it('adds no ? without params', () => expect(buildUrl('/api/x')).toBe('/api/x'));
});

describe('apiRequest', () => {
  it('sends JSON with same-origin credentials and parses the answer', async () => {
    const f = respond(200, { ok: 1 }); vi.stubGlobal('fetch', f);
    expect(await apiRequest('/api/x', { method: 'POST', body: { a: 1 } })).toEqual({ ok: 1 });
    const [, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.credentials).toBe('same-origin');
    expect(init.method).toBe('POST');
    expect(init.body).toBe('{"a":1}');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
  });
  it('returns undefined for 204', async () => {
    vi.stubGlobal('fetch', respond(204));
    expect(await apiRequest('/api/x', { method: 'DELETE' })).toBeUndefined();
  });
  it('turns an HTTP error into an ApiError with the server message', async () => {
    vi.stubGlobal('fetch', respond(409, { detail: 'You have reached the limit.' }));
    await expect(apiRequest('/api/x')).rejects.toMatchObject({ name: 'ApiError', kind: 'http', status: 409, message: 'You have reached the limit.' });
  });
  it('gives a generic message when the error body is not JSON', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>boom</html>', { status: 502 })));
    await expect(apiRequest('/api/x')).rejects.toMatchObject({ status: 502, message: expect.stringContaining('502') });
  });
  it('reports a lost connection plainly', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    await expect(apiRequest('/api/x')).rejects.toMatchObject({ kind: 'network', message: expect.stringContaining('Could not reach the server') });
  });
  it('flags an unreadable success body', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('not json', { status: 200 })));
    await expect(apiRequest('/api/x')).rejects.toMatchObject({ kind: 'parse' });
  });
  it('lets aborts through untouched', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new DOMException('aborted', 'AbortError'); }));
    await expect(apiRequest('/api/x')).rejects.toMatchObject({ name: 'AbortError' });
  });
  it('calls the unauthorized handler on 401 only when a session is required', async () => {
    const handler = vi.fn(); setUnauthorizedHandler(handler);
    vi.stubGlobal('fetch', respond(401, { detail: 'Not signed in.' }));
    await expect(apiRequest('/api/datasets')).rejects.toBeInstanceOf(ApiError);
    expect(handler).toHaveBeenCalledTimes(1);
    await expect(apiRequest('/api/auth/login', { method: 'POST', body: {}, authRequired: false })).rejects.toBeInstanceOf(ApiError);
    expect(handler).toHaveBeenCalledTimes(1);          // a wrong password is an answer, not a signed-out session
  });
});

describe('downloads', () => {
  it('reads the file name from Content-Disposition', () => {
    expect(filenameFromDisposition('attachment; filename="cleaned_my file.csv"', 'x')).toBe('cleaned_my file.csv');
    expect(filenameFromDisposition("attachment; filename*=UTF-8''r%C3%A9sum%C3%A9.csv", 'x')).toBe('résumé.csv');
    expect(filenameFromDisposition(null, 'fallback.csv')).toBe('fallback.csv');
  });
  it('saves the response through a temporary link', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('a,b\n1,2\n', { status: 200, headers: { 'content-disposition': 'attachment; filename="cleaned_x.csv"' } })));
    const create = vi.fn(() => 'blob:fake'); const revoke = vi.fn();
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke }));
    const clicked: string[] = [];
    const orig = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) { clicked.push(this.download); };
    await downloadFile('/api/datasets/1/download/cleaned');
    HTMLAnchorElement.prototype.click = orig;
    expect(clicked).toEqual(['cleaned_x.csv']);
    expect(revoke).toHaveBeenCalledWith('blob:fake');
    expect(document.querySelector('a[download]')).toBeNull();
  });
  it('surfaces a failed download', async () => {
    vi.stubGlobal('fetch', respond(409, { detail: 'The dataset is not ready (status: processing).' }));
    await expect(downloadFile('/api/x')).rejects.toMatchObject({ message: 'The dataset is not ready (status: processing).' });
  });
});

describe('uploadFile', () => {
  const file = () => new File(['a,b\n1,2'], 'x.csv', { type: 'text/csv' });
  it('reports progress and resolves with the parsed answer', async () => {
    vi.stubGlobal('XMLHttpRequest', FakeXHR);
    const seen: number[] = [];
    const p = uploadFile<{ id: string }>('/api/datasets', file(), (n) => seen.push(n));
    const x = FakeXHR.last!;
    expect(x.method).toBe('POST'); expect(x.url).toBe('/api/datasets'); expect((x.sent!.get('file') as File).name).toBe('x.csv');
    x.progress(50, 100); x.progress(100, 100); x.respond(201, { id: 'abc' });
    expect(await p).toEqual({ id: 'abc' });
    expect(seen).toEqual([50, 100]);
  });
  it('shows the server reason for a rejected upload', async () => {
    vi.stubGlobal('XMLHttpRequest', FakeXHR);
    const p = uploadFile('/api/datasets', file());
    FakeXHR.last!.respond(413, { detail: 'File is too large. The limit is 500 MB.' });
    await expect(p).rejects.toMatchObject({ status: 413, message: 'File is too large. The limit is 500 MB.' });
  });
  it('ends the session on 401', async () => {
    vi.stubGlobal('XMLHttpRequest', FakeXHR);
    const handler = vi.fn(); setUnauthorizedHandler(handler);
    const p = uploadFile('/api/datasets', file());
    FakeXHR.last!.respond(401, { detail: 'Not signed in.' });
    await expect(p).rejects.toBeInstanceOf(ApiError);
    expect(handler).toHaveBeenCalled();
  });
  it('handles a network failure and a cancel', async () => {
    vi.stubGlobal('XMLHttpRequest', FakeXHR);
    const a = uploadFile('/api/datasets', file()); FakeXHR.last!.fail();
    await expect(a).rejects.toMatchObject({ kind: 'network' });
    const ctl = new AbortController(); const b = uploadFile('/api/datasets', file(), undefined, ctl.signal); ctl.abort();
    await expect(b).rejects.toMatchObject({ name: 'AbortError' });
  });
});
