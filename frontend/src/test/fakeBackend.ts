import { vi } from 'vitest';
import user from './fixtures/user.json';
import datasets from './fixtures/datasets.json';
import detail from './fixtures/dataset_detail.json';
import filters from './fixtures/filters.json';
import dashboardNo from './fixtures/dashboard_no_sentiment.json';
import products from './fixtures/products.json';
import preview from './fixtures/preview.json';
import health from './fixtures/health.json';
import info from './fixtures/info.json';
import model from './fixtures/model.json';
import analyses from './fixtures/analyses.json';

export interface FakeRequest { method: string; path: string; query: URLSearchParams; body: unknown }
export interface FakeResponse { status?: number; json?: unknown; headers?: Record<string, string>; text?: string }
export type Handler = FakeResponse | ((req: FakeRequest) => FakeResponse | Promise<FakeResponse>);

/** A stand-in for the server: answers fetch() from a route table and records every call. Unknown routes fail loudly. */
export class FakeBackend {
  calls: FakeRequest[] = [];
  private routes: { method: string; re: RegExp; handler: Handler; key: string }[] = [];

  on(route: string, handler: Handler): this {
    const [method, path] = route.split(' ');
    const re = new RegExp('^' + path.replace(/:[a-z]+/g, '[^/]+') + '$');
    this.routes.unshift({ method, re, handler, key: route });   // later registrations win
    return this;
  }

  callsTo(method: string, pathPattern: string | RegExp): FakeRequest[] {
    return this.calls.filter((c) => c.method === method && (typeof pathPattern === 'string' ? c.path === pathPattern : pathPattern.test(c.path)));
  }

  install(): this {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), 'http://localhost');
      const method = (init?.method ?? 'GET').toUpperCase();
      let body: unknown;
      if (typeof init?.body === 'string') { try { body = JSON.parse(init.body); } catch { body = init.body; } }
      const req: FakeRequest = { method, path: url.pathname, query: url.searchParams, body };
      this.calls.push(req);
      const route = this.routes.find((r) => r.method === method && r.re.test(url.pathname));
      if (!route) throw new Error(`Unmocked request: ${method} ${url.pathname}`);
      const res = typeof route.handler === 'function' ? await route.handler(req) : route.handler;
      const status = res.status ?? 200;
      if (status === 204) return new Response(null, { status });
      const payload = res.text ?? JSON.stringify(res.json ?? {});
      return new Response(payload, { status, headers: { 'content-type': res.text ? 'text/csv' : 'application/json', ...(res.headers ?? {}) } });
    }));
    return this;
  }
}

export const FIXTURE = { user, datasets, detail, filters, dashboardNo, products, preview, health, info, model, analyses };
export const DATASET_ID = (detail as { id: string }).id;

/** A signed-in backend with one ready dataset, ready to be tweaked per test. */
export function signedInBackend(): FakeBackend {
  const b = new FakeBackend();
  b.on('GET /api/auth/me', { json: user })
    .on('GET /api/health', { json: health })
    .on('GET /api/info', { json: info })
    .on('GET /api/model', { json: model })
    .on('GET /api/datasets', { json: datasets })
    .on('GET /api/datasets/:id', { json: detail })
    .on('GET /api/datasets/:id/filters', { json: filters })
    .on('GET /api/datasets/:id/dashboard', { json: dashboardNo })
    .on('GET /api/datasets/:id/analytics/products', { json: products })
    .on('GET /api/datasets/:id/preview', { json: preview })
    .on('GET /api/datasets/:id/jobs', { json: [] })
    .on('GET /api/analyses', { json: analyses });
  return b.install();
}

export function anonymousBackend(): FakeBackend {
  const b = new FakeBackend();
  b.on('GET /api/auth/me', { status: 401, json: { detail: 'Not signed in.' } }).on('GET /api/health', { json: health });
  return b.install();
}

/** Minimal XMLHttpRequest so upload progress and results can be scripted. */
export class FakeXHR {
  static last: FakeXHR | null = null;
  upload: { onprogress: ((e: { lengthComputable: boolean; loaded: number; total: number }) => void) | null } = { onprogress: null };
  onload: (() => void) | null = null; onerror: (() => void) | null = null; onabort: (() => void) | null = null;
  status = 0; responseText = ''; method = ''; url = ''; sent: FormData | null = null; headers: Record<string, string> = {}; withCredentials = false;
  constructor() { FakeXHR.last = this; }
  open(method: string, url: string) { this.method = method; this.url = url; }
  setRequestHeader(k: string, v: string) { this.headers[k] = v; }
  send(body: FormData) { this.sent = body; }
  abort() { this.onabort?.(); }
  progress(loaded: number, total: number) { this.upload.onprogress?.({ lengthComputable: true, loaded, total }); }
  respond(status: number, json: unknown) { this.status = status; this.responseText = JSON.stringify(json); this.onload?.(); }
  fail() { this.onerror?.(); }
}
