/**
 * The transport. Every call in `endpoints.ts` goes through `request`.
 *
 * What it owns, so nothing above it has to:
 *
 *   • the base URL, the bearer token and the `Idempotency-Key` header
 *   • a timeout, because `fetch` on React Native has none
 *   • refreshing the Supabase session — ahead of expiry when the token is
 *     about to lapse, and once more on a 401, then one retry
 *   • turning every failure into an `ApiError` carrying the HTTP status and
 *     the API's `{ statusCode, code, message, details }` body
 *
 * It never retries a write on its own. Mutations carry an idempotency key, so
 * a person pressing the button again after a timeout is safe; an invisible
 * retry is not the transport's call to make.
 */
import { API_URL, REQUEST_TIMEOUT_MS } from './config';
import { ApiError } from './errors';
import { refreshSession as supabaseRefresh } from './supabase';
import {
  clearSession,
  emitSessionExpired,
  getAccessToken,
  getExpiresAt,
  getRefreshToken,
  setSession,
} from './tokens';

type Method = 'GET' | 'POST' | 'DELETE';
type Query = Record<string, string | number | boolean | null | undefined>;

export type RequestOptions = {
  method?: Method;
  body?: unknown;
  /** Appended as a query string; empty, `undefined` and `null` entries are dropped. */
  query?: Query;
  /** Sent as `Idempotency-Key`. Reuse the same key when the person retries the same submission. */
  idempotencyKey?: string;
  timeoutMs?: number;
  /** Internal: set on the one retry after a refresh, so it cannot loop. */
  _retried?: boolean;
};

export function buildUrl(path: string, query?: Query) {
  const url = `${API_URL}${path.startsWith('/') ? path : `/${path}`}`;
  if (!query) return url;
  const parts: string[] = [];
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === '') continue;
    parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  }
  return parts.length ? `${url}?${parts.join('&')}` : url;
}

async function parse(res: Response): Promise<unknown> {
  if (res.status === 204) return null;
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    /* A proxy or captive portal answering with HTML: its markup is no message
       for a person, so the status fallback below speaks instead. */
    return /^\s*</.test(text) ? null : { message: text.slice(0, 200) };
  }
}

const STATUS_FALLBACK: Record<number, string> = {
  400: 'That request was not accepted.',
  401: 'Your session has ended. Sign in again.',
  403: "Your account doesn't have access to this.",
  404: 'That no longer exists.',
  409: 'That conflicts with something already recorded.',
  413: 'That file is too large to upload.',
  422: 'Some of those details were not valid.',
  429: 'Too many requests. Wait a moment and try again.',
};

const CODE_COPY: Record<string, string> = {
  IDEMPOTENCY_IN_PROGRESS: 'Your earlier attempt is still being processed. Wait a moment, then try again.',
};

/** Unwraps the API's standard error body to one sentence a screen has room for. */
function toError(payload: unknown, status: number): ApiError {
  const body = (payload && typeof payload === 'object' ? payload : {}) as Record<string, unknown>;
  const code = typeof body.code === 'string' ? body.code : typeof body.error === 'string' ? body.error : undefined;
  if (code && CODE_COPY[code]) return new ApiError(CODE_COPY[code], status, code, body.details);

  let message = STATUS_FALLBACK[status] ?? 'The server had a problem. Please try again.';
  const detail = body.message;
  if (typeof detail === 'string' && detail.trim()) {
    message = detail;
  } else if (Array.isArray(detail)) {
    const lines = detail.filter((d): d is string => typeof d === 'string');
    if (lines.length) message = `${lines.join('. ')}.`;
  }
  /* 5xx bodies describe the server, not anything the person can act on. */
  if (status >= 500) message = 'The server had a problem. Please try again in a moment.';
  return new ApiError(message.charAt(0).toUpperCase() + message.slice(1), status, code, body.details);
}

/* -------------------------------------------------------------- Refresh */

/**
 * One refresh at a time, shared by everyone who needed it together. Supabase
 * refresh tokens rotate, so two concurrent refreshes would present a token the
 * first has already spent and end a perfectly healthy session.
 */
let refreshInFlight: Promise<boolean> | null = null;

export async function refreshNow(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    const token = getRefreshToken();
    if (!token) return false;
    try {
      const next = await supabaseRefresh(token);
      /* Signed out while this was in flight: writing the pair back would sign
         the old user in again on the next cold start. */
      if (getRefreshToken() !== token) return false;
      await setSession(next.accessToken, next.refreshToken, next.expiresAt);
      return true;
    } catch (e) {
      /* Offline, rate-limited or Supabase having a bad minute is not an ended
         session — keep the tokens for the next try. Only a refused refresh
         token (4xx) ends it. */
      if (e instanceof ApiError && (e.status === 0 || e.status === 429 || e.status >= 500)) return false;
      await clearSession();
      emitSessionExpired();
      return false;
    }
  })();
  try {
    return await refreshInFlight;
  } finally {
    refreshInFlight = null;
  }
}

/** Refresh a minute before the access token lapses rather than eating a 401 round trip. */
const EXPIRY_MARGIN_MS = 60_000;

/* ----------------------------------------------------------------- Request */

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, query, idempotencyKey, timeoutMs = REQUEST_TIMEOUT_MS, _retried = false } = options;

  if (!getAccessToken() && !getRefreshToken()) {
    throw new ApiError('You are signed out.', 401, 'NO_SESSION');
  }

  const expires = getExpiresAt();
  if (!getAccessToken() || (expires && Date.now() > expires - EXPIRY_MARGIN_MS)) {
    await refreshNow();
    if (!getAccessToken()) {
      if (!getRefreshToken()) throw new ApiError('Your session has ended. Sign in again.', 401, 'SESSION_EXPIRED');
      throw new ApiError('Could not reach the server. Check your connection.', 0, 'NETWORK');
    }
  }

  const headers: Record<string, string> = {
    Accept: 'application/json',
    Authorization: `Bearer ${getAccessToken()}`,
  };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetch(buildUrl(path, query), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (e) {
    throw new ApiError(
      'Could not reach the server. Check your connection.',
      0,
      e instanceof Error && e.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK',
    );
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 401 && !_retried) {
    if (await refreshNow()) return request<T>(path, { ...options, _retried: true });
    if (getRefreshToken()) {
      /* The refresh could not reach Supabase; the session may still be fine. */
      throw new ApiError('Could not reach the server. Check your connection.', 0, 'NETWORK');
    }
    /* `refreshNow` has already cleared the session and told the app. */
    throw new ApiError('Your session has ended. Sign in again.', 401, 'SESSION_EXPIRED');
  }

  const payload = await parse(res);
  if (res.status === 401) {
    /* A token minted seconds ago was refused — the account itself is not let
       in. Ending the session here stops every mounted screen retrying it. */
    await clearSession();
    emitSessionExpired();
    throw toError(payload, 401);
  }
  if (!res.ok) throw toError(payload, res.status);
  return payload as T;
}

export const get = <T>(path: string, query?: Query) => request<T>(path, { method: 'GET', query });

export const post = <T>(path: string, body?: unknown, o?: Omit<RequestOptions, 'method' | 'body'>) =>
  request<T>(path, { ...o, method: 'POST', body: body ?? {} });

export const del = <T>(path: string, o?: Omit<RequestOptions, 'method' | 'body'>) =>
  request<T>(path, { ...o, method: 'DELETE' });

/**
 * A fresh idempotency key (RFC 4122 v4 shape). Hermes has no `crypto.randomUUID`,
 * and a key only needs to be unique per user for the server's 24-hour window.
 */
export function newIdempotencyKey() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}
