export type ApiErrorKind = 'network' | 'http' | 'parse';

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status?: number;
  constructor(message: string, kind: ApiErrorKind, status?: number) {
    super(message);
    this.name = 'ApiError';
    this.kind = kind;
    this.status = status;
  }
}

type QueryValue = string | number | boolean | null | undefined | Array<string | number>;

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  query?: Record<string, QueryValue>;
  body?: unknown;
  signal?: AbortSignal;
  /** false for login/register/me: a 401 there is an answer, not a signed-out session. */
  authRequired?: boolean;
}

// Normally empty: the page and the API share one origin, so relative URLs and same-origin cookies just work.
export const API_BASE_URL = ((import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '').replace(/\/+$/, '');
const CREDENTIALS: RequestCredentials = API_BASE_URL ? 'include' : 'same-origin';

let unauthorizedHandler: (() => void) | null = null;
export function setUnauthorizedHandler(handler: (() => void) | null): void {
  unauthorizedHandler = handler;
}

export function buildUrl(path: string, query?: Record<string, QueryValue>): string {
  const params = new URLSearchParams();
  Object.entries(query ?? {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    (Array.isArray(value) ? value : [value]).forEach((v) => {
      if (v !== '') params.append(key, String(v));
    });
  });
  const qs = params.toString();
  return `${API_BASE_URL}${path}${qs ? `?${qs}` : ''}`;
}

/** FastAPI sends `detail` as a string for our errors and as a list of {msg} objects for validation errors. */
export function detailMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object' || !('detail' in payload)) return null;
  const detail = (payload as { detail: unknown }).detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    const msgs = detail
      .map((d) => (d && typeof d === 'object' && 'msg' in d ? String((d as { msg: unknown }).msg) : null))
      .filter((m): m is string => Boolean(m))
      .map((m) => m.replace(/^Value error, /, ''));
    return msgs.length ? msgs.join(' ') : null;
  }
  return null;
}

async function failure(response: Response, authRequired: boolean): Promise<ApiError> {
  let message: string | null = null;
  try {
    message = detailMessage(await response.json());
  } catch {
    message = null;
  }
  if (response.status === 401 && authRequired) unauthorizedHandler?.();
  return new ApiError(message ?? `The server returned an error (status ${response.status}).`, 'http', response.status);
}

function networkError(error: unknown): never {
  if (error instanceof DOMException && error.name === 'AbortError') throw error;
  throw new ApiError('Could not reach the server. Check your connection and try again.', 'network');
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', query, body, signal, authRequired = true } = options;
  let response: Response;
  try {
    response = await fetch(buildUrl(path, query), {
      method,
      credentials: CREDENTIALS,
      headers: { Accept: 'application/json', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch (error) {
    return networkError(error);
  }
  if (!response.ok) throw await failure(response, authRequired);
  if (response.status === 204) return undefined as T;
  try {
    return (await response.json()) as T;
  } catch {
    throw new ApiError('The server sent a response that could not be read.', 'parse', response.status);
  }
}

/** Upload one file with a progress callback (fetch cannot report upload progress, XMLHttpRequest can). */
export function uploadFile<T>(path: string, file: File, onProgress?: (percent: number) => void, signal?: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', buildUrl(path));
    xhr.withCredentials = Boolean(API_BASE_URL);
    xhr.setRequestHeader('Accept', 'application/json');
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(Math.round((100 * event.loaded) / event.total));
    };
    xhr.onerror = () => reject(new ApiError('Could not reach the server. Check your connection and try again.', 'network'));
    xhr.onabort = () => reject(new DOMException('Upload cancelled', 'AbortError'));
    xhr.onload = () => {
      let payload: unknown = null;
      try {
        payload = JSON.parse(xhr.responseText);
      } catch {
        payload = null;
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        if (payload === null) reject(new ApiError('The server sent a response that could not be read.', 'parse', xhr.status));
        else resolve(payload as T);
        return;
      }
      if (xhr.status === 401) unauthorizedHandler?.();
      reject(new ApiError(detailMessage(payload) ?? `The upload failed (status ${xhr.status}).`, 'http', xhr.status));
    };
    signal?.addEventListener('abort', () => xhr.abort());
    const form = new FormData();
    form.append('file', file);
    xhr.send(form);
  });
}

export function filenameFromDisposition(header: string | null, fallback: string): string {
  const match = header?.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i);
  return match ? decodeURIComponent(match[1]) : fallback;
}

/** Download a file the API produces (cleaned CSV, report export) through the browser's save dialog. */
export async function downloadFile(path: string, query?: Record<string, QueryValue>, fallbackName = 'download'): Promise<void> {
  let response: Response;
  try {
    response = await fetch(buildUrl(path, query), { credentials: CREDENTIALS });
  } catch (error) {
    return networkError(error);
  }
  if (!response.ok) throw await failure(response, true);
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filenameFromDisposition(response.headers.get('content-disposition'), fallbackName);
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
