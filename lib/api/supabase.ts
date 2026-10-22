/**
 * Supabase Auth, spoken directly over its REST surface (`/auth/v1/*`).
 *
 * The app needs exactly three things from Supabase — sign in with a password,
 * refresh, sign out — so it calls those three routes rather than pulling in
 * `supabase-js` and the URL / storage polyfills it needs on React Native.
 * Everything else goes to the attendance API with the access token this mints.
 */
import { AUTH_CONFIGURED, REQUEST_TIMEOUT_MS, SUPABASE_ANON_KEY, SUPABASE_URL } from './config';
import { ApiError } from './errors';

export interface SupabaseSession {
  accessToken: string;
  refreshToken: string;
  /** Epoch ms, or null if Supabase did not say. */
  expiresAt: number | null;
}

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  expires_at?: number;
};

type AuthErrorBody = {
  error?: string;
  error_code?: string;
  error_description?: string;
  msg?: string;
  message?: string;
};

async function call(path: string, body: unknown, bearer?: string): Promise<Response> {
  if (!AUTH_CONFIGURED) {
    throw new ApiError(
      'This build has no sign-in server configured. Ask your administrator for an updated app.',
      0,
      'AUTH_NOT_CONFIGURED',
    );
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(`${SUPABASE_URL}/auth/v1${path}`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${bearer ?? SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body ?? {}),
      signal: controller.signal,
    });
  } catch (e) {
    throw new ApiError(
      'Could not reach the sign-in server. Check your connection.',
      0,
      e instanceof Error && e.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK',
    );
  } finally {
    clearTimeout(timer);
  }
}

async function toSession(res: Response): Promise<SupabaseSession> {
  const text = await res.text();
  let payload: (TokenResponse & AuthErrorBody) | null = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }

  if (!res.ok || !payload?.access_token || !payload.refresh_token) {
    const code = payload?.error_code ?? payload?.error;
    const raw = payload?.error_description ?? payload?.msg ?? payload?.message ?? '';
    if (code === 'invalid_credentials' || code === 'invalid_grant' || /invalid login credentials/i.test(raw)) {
      throw new ApiError('That email and password do not match. Check them and try again.', 400, 'INVALID_CREDENTIALS');
    }
    if (code === 'email_not_confirmed') {
      throw new ApiError('This account has not been activated yet. Ask HR to activate it.', 400, code);
    }
    if (code === 'user_banned') {
      throw new ApiError('This account has been deactivated. Ask HR if you think this is a mistake.', 403, code);
    }
    if (res.status === 429) {
      throw new ApiError('Too many attempts. Wait a minute and try again.', 429, 'RATE_LIMITED');
    }
    throw new ApiError(raw || 'Sign-in failed. Please try again.', res.status || 500, code);
  }

  const expiresAt = payload.expires_at
    ? payload.expires_at * 1000
    : payload.expires_in
      ? Date.now() + payload.expires_in * 1000
      : null;
  return { accessToken: payload.access_token, refreshToken: payload.refresh_token, expiresAt };
}

export async function signInWithPassword(email: string, password: string) {
  return toSession(await call('/token?grant_type=password', { email, password }));
}

/** Exchanges a refresh token for a new pair. The old refresh token is spent. */
export async function refreshSession(refreshToken: string) {
  return toSession(await call('/token?grant_type=refresh_token', { refresh_token: refreshToken }));
}

/** Revokes this device's session. Best effort — callers clear local state regardless. */
export async function signOut(accessToken: string) {
  await call('/logout?scope=local', {}, accessToken);
}
