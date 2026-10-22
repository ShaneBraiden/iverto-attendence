/**
 * The signed-in session: Supabase tokens in, `/mobile/me` out.
 *
 * `me` drives everything role-shaped — which shell opens, whether the manager
 * tabs exist, whether the forced password change comes first. The role comes
 * from `/me`, never from decoding the JWT: the token is the server's to read.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { router } from 'expo-router';
import { ApiError, getMe, Me, toMe } from '@/lib/api';
import { signInWithPassword, signOut as supabaseSignOut } from '@/lib/api/supabase';
import { unregisterForPush } from '@/lib/push';
import {
  clearSession,
  getAccessToken,
  getRefreshToken,
  loadMe,
  loadSession,
  onSessionExpired,
  saveMe,
  setSession,
} from '@/lib/api/tokens';

type AuthValue = {
  /** Undefined until the cold-start read settles; null when signed out. */
  me: Me | null | undefined;
  ready: boolean;
  signIn: (email: string, password: string) => Promise<Me>;
  signOut: () => Promise<void>;
  /** Re-reads `/me` — after a password change, or a pull to refresh. */
  reloadMe: () => Promise<Me | null>;
  /** The last profile that was signed in — see `useMe`. */
  lastMe: Me | null;
};

const AuthContext = createContext<AuthValue | null>(null);

const APPROVER_ROLES = new Set(['MANAGER', 'HR', 'ADMIN']);

/**
 * The manager routes are open to MANAGER, HR and ADMIN only (mobile API §10);
 * within that, `features` can switch either half off. A missing flag counts as
 * on, so an older API that omits it does not strip a manager of their tabs.
 */
export function canApprove(me: Me | null | undefined) {
  return !!me && APPROVER_ROLES.has(String(me.role)) && me.features?.canApprove !== false;
}

export function canViewTeam(me: Me | null | undefined) {
  return !!me && APPROVER_ROLES.has(String(me.role)) && me.features?.teamView !== false;
}

/** Managers, HR and admins get the approvals queue and live board on top of self-service. */
export function isManager(me: Me | null | undefined) {
  return canApprove(me) || canViewTeam(me);
}

/** Where a signed-in person lands. */
export function homeOf(me: Me) {
  if (me.mustChangePassword) return '/password' as const;
  return isManager(me) ? ('/manager' as const) : ('/employee' as const);
}

/** Back — or, when a link opened the app cold and there is nothing behind, home. */
export function goBack(me: Me | null | undefined) {
  if (router.canGoBack()) router.back();
  else router.replace(me ? homeOf(me) : '/');
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const [ready, setReady] = useState(false);
  const last = useRef<Me | null>(null);
  if (me) last.current = me;

  const endSession = useCallback(async () => {
    /* Before the tokens go: withdrawing the push token is an authenticated call. */
    await unregisterForPush();
    await clearSession();
    setMe(null);
  }, []);

  /* Cold start: tokens off disk, then a fresh `/me`. Offline, the cached copy
     opens the right shell and the screens say "offline" with a retry. */
  useEffect(() => {
    (async () => {
      try {
        if (!(await loadSession())) {
          setMe(null);
          return;
        }
        try {
          const fresh = await getMe();
          await saveMe(fresh);
          setMe(fresh);
        } catch (e) {
          /* Offline, rate-limited or a server mid-deploy is not a refused session:
             open on the cached profile and let the screens offer a retry. */
          const transient = e instanceof ApiError && (e.status === 0 || e.status === 429 || e.status >= 500);
          const cached = transient ? await loadMe<unknown>() : null;
          if (cached && getRefreshToken()) setMe(toMe(cached));
          else await endSession();
        }
      } finally {
        setReady(true);
      }
    })();
  }, [endSession]);

  /* The tokens are already gone here, so the push token can only be dropped on the device. */
  useEffect(
    () =>
      onSessionExpired(() => {
        setMe(null);
        unregisterForPush();
      }),
    [],
  );

  const signIn = useCallback(async (email: string, password: string) => {
    const session = await signInWithPassword(email.trim(), password);
    /* Tokens first: the shell that renders the moment `me` is set will fetch
       straight away, and it must find a token when it does. */
    await setSession(session.accessToken, session.refreshToken, session.expiresAt);
    try {
      const profile = await getMe();
      await saveMe(profile);
      setMe(profile);
      return profile;
    } catch (e) {
      await clearSession();
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
        throw new ApiError(
          "You signed in, but this account isn't set up for Iverto Attendance yet. Ask HR to grant app access.",
          e.status,
          e.code,
        );
      }
      throw e;
    }
  }, []);

  const signOut = useCallback(async () => {
    const token = getAccessToken();
    /* Ahead of the Supabase sign-out, while the session can still make the call. */
    await unregisterForPush();
    /* Best effort: a phone with no signal still gets signed out of the handset. */
    if (token) await supabaseSignOut(token).catch(() => {});
    await endSession();
  }, [endSession]);

  const reloadMe = useCallback(async () => {
    try {
      const fresh = await getMe();
      await saveMe(fresh);
      setMe(fresh);
      return fresh;
    } catch {
      return null;
    }
  }, []);

  const value = useMemo<AuthValue>(
    () => ({ me, ready, signIn, signOut, reloadMe, lastMe: last.current }),
    [me, ready, signIn, signOut, reloadMe],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

/**
 * The signed-in profile, for screens behind the session guard in the root
 * layout. On sign-out those screens can render once more before the guard
 * unmounts them, so this falls back to the profile they were showing.
 */
export function useMe(): Me {
  const { me, lastMe } = useAuth();
  const current = me ?? lastMe;
  if (!current) throw new ApiError('You are signed out.', 401, 'NO_SESSION');
  return current;
}
