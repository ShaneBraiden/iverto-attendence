/**
 * Where the Supabase session lives.
 *
 * Supabase refresh tokens rotate: presenting one mints a new pair and retires
 * the old one. So the new pair is persisted **before** it is used, and the
 * in-memory mirror is written only after the keystore write succeeds — a crash
 * in between can never strand the app holding a token the server has spent.
 *
 * The pair is mirrored in memory because every request needs the access token
 * and `SecureStore` is an async native call.
 */
import * as SecureStore from 'expo-secure-store';

const ACCESS_KEY = 'att.access';
const REFRESH_KEY = 'att.refresh';
const EXPIRES_KEY = 'att.expiresAt';
const ME_KEY = 'att.me';

let access: string | null = null;
let refresh: string | null = null;
/** Epoch ms the access token stops being valid, when Supabase said. */
let expiresAt: number | null = null;

/** Read the stored session off disk. Called once, at cold start. */
export async function loadSession(): Promise<boolean> {
  try {
    const [a, r, e] = await Promise.all([
      SecureStore.getItemAsync(ACCESS_KEY),
      SecureStore.getItemAsync(REFRESH_KEY),
      SecureStore.getItemAsync(EXPIRES_KEY),
    ]);
    if (!r) return false;
    access = a;
    refresh = r;
    expiresAt = e ? Number(e) : null;
    return true;
  } catch {
    /* An unreadable keystore entry is a signed-out user, not a crash. */
    return false;
  }
}

export async function setSession(accessToken: string, refreshToken: string, expires: number | null) {
  await Promise.all([
    SecureStore.setItemAsync(ACCESS_KEY, accessToken),
    SecureStore.setItemAsync(REFRESH_KEY, refreshToken),
    expires ? SecureStore.setItemAsync(EXPIRES_KEY, String(expires)) : SecureStore.deleteItemAsync(EXPIRES_KEY),
  ]);
  access = accessToken;
  refresh = refreshToken;
  expiresAt = expires;
}

export async function clearSession() {
  access = null;
  refresh = null;
  expiresAt = null;
  await Promise.all(
    [ACCESS_KEY, REFRESH_KEY, EXPIRES_KEY, ME_KEY].map((k) => SecureStore.deleteItemAsync(k).catch(() => {})),
  );
}

export const getAccessToken = () => access;
export const getRefreshToken = () => refresh;
export const getExpiresAt = () => expiresAt;

/**
 * The last `/mobile/me`, cached beside the tokens so a cold start with no
 * signal still opens the right shell — the screens then say "offline" and
 * offer a retry, which is the truth, instead of a blank sign-in form.
 */
export async function saveMe(me: unknown) {
  await SecureStore.setItemAsync(ME_KEY, JSON.stringify(me)).catch(() => {});
}

export async function loadMe<T>(): Promise<T | null> {
  try {
    const raw = await SecureStore.getItemAsync(ME_KEY);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------- Session expiry */

type Listener = () => void;
const listeners = new Set<Listener>();

/**
 * Fires when the session is over and no retry will help — the refresh token
 * was itself refused. `AuthProvider` subscribes and signs the user out; the
 * transport stays ignorant of navigation.
 */
export function onSessionExpired(fn: Listener) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function emitSessionExpired() {
  listeners.forEach((fn) => fn());
}
