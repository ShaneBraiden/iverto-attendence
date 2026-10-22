/**
 * Where the app points.
 *
 * Resolution order: an `EXPO_PUBLIC_*` variable in the environment beats
 * `expo.extra` in `app.json`. The env var is what a developer sets to aim a dev
 * client somewhere else; the manifest value is what ships in the APK.
 *
 * `API_URL` ends at the version segment (`…/att/v1`), so every path in
 * `endpoints.ts` starts at the surface: `/mobile/today`, `/mobile/me`.
 */
import Constants from 'expo-constants';

type Extra = { apiUrl?: string; supabaseUrl?: string; supabaseAnonKey?: string };

const extra = (Constants.expoConfig?.extra ?? {}) as Extra;

const trimSlash = (s: string) => s.replace(/\/+$/, '');

export const API_URL = trimSlash(
  process.env.EXPO_PUBLIC_API_URL ||
    extra.apiUrl ||
    'https://ivertovm.indiasouthcentral.cloudapp.azure.com/att/v1',
);

/**
 * Supabase Auth. The attendance API has no login route — clients sign in
 * against Supabase directly and send its access token to the API (§13).
 */
export const SUPABASE_URL = trimSlash(process.env.EXPO_PUBLIC_SUPABASE_URL || extra.supabaseUrl || '');
export const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || extra.supabaseAnonKey || '';

/** False when the build has no Supabase project — the sign-in screen says so. */
export const AUTH_CONFIGURED = !!SUPABASE_URL && !!SUPABASE_ANON_KEY;

/** How long a request may hang before it is treated as offline. */
export const REQUEST_TIMEOUT_MS = 20_000;

/** Attachments go up as base64 JSON, up to 5 MB. */
export const UPLOAD_TIMEOUT_MS = 60_000;

/** Server-side upload limit (§9.1). Checked before reading the file. */
export const MAX_UPLOAD_BYTES = 5_242_880;
