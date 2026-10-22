/**
 * Push notifications over FCM (mobile API §3.1, §3.2).
 *
 * What the API stores is the device's raw FCM registration token, not an Expo
 * push token: the server sends with `firebase-admin` straight to FCM.
 * `expo-notifications` supplies that token, the Android 13+ permission prompt,
 * the channel, foreground display and taps. Firebase itself is configured at
 * build time by `google-services.json` (see `app.config.js`); a build without
 * one still runs — getting a token fails, and the in-app inbox carries on alone.
 *
 * Android only. On iOS `getDevicePushTokenAsync` returns an APNs token, which
 * FCM will not accept, so iOS needs the Firebase SDK before it can join in.
 */
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { router } from 'expo-router';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { colors } from '@/theme';
import { registerPushDevice, unregisterPushDevice } from '@/lib/api';
import { notificationTarget } from '@/lib/requests';

const ENABLED = Platform.OS === 'android';

/**
 * Also set as `defaultChannel` on the `expo-notifications` plugin in app.json,
 * so a push the server sends without an `android.notification.channelId`
 * lands here too. The two must stay the same string.
 */
export const PUSH_CHANNEL_ID = 'default';

/** The token the API last accepted for this phone, so sign-out can withdraw it. */
const TOKEN_KEY = 'att.pushToken';

/** A phone with no signal must not hold up signing out for the full request timeout. */
const UNREGISTER_TIMEOUT_MS = 5_000;

/* A push that arrives while the app is open is shown like any other; Firebase
   only draws it by itself while the app is in the background. */
if (ENABLED) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

/* --------------------------------------------------------- Registration */

/**
 * Android 13+ asks for the notification permission only once a channel
 * exists, so this runs before the prompt. Re-creating a channel is a no-op
 * apart from its name — a person's own changes to it in Settings are kept.
 */
async function ensureChannel() {
  await Notifications.setNotificationChannelAsync(PUSH_CHANNEL_ID, {
    name: 'Attendance updates',
    description: 'Approvals, roster changes and reminders',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: colors.primary,
  });
}

/** Asks at most as often as Android allows; a refusal is kept until the person changes it in Settings. */
async function permitted() {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  return (await Notifications.requestPermissionsAsync()).granted;
}

async function sendToken(token: string) {
  const previous = await SecureStore.getItemAsync(TOKEN_KEY).catch(() => null);
  await registerPushDevice(token, 'android');
  await SecureStore.setItemAsync(TOKEN_KEY, token).catch(() => {});
  /* FCM rotated the token while the app was closed; the old one is dead weight on the server. */
  if (previous && previous !== token) unregisterPushDevice(previous).catch(() => {});
}

/**
 * Registers this phone for the signed-in account. Safe to call on every
 * start — the server keys devices on the token — and that is how a token
 * reaches the server again after the person turns notifications back on.
 */
export async function registerForPush() {
  if (!ENABLED) return;
  try {
    await ensureChannel();
    /* No permission, no registration: the server would only push into the void. */
    if (!(await permitted())) return;
    const { data } = await Notifications.getDevicePushTokenAsync();
    if (typeof data === 'string' && data) await sendToken(data);
  } catch (e) {
    /* No google-services.json in this build, no Play services, or offline.
       Push is an extra — the inbox still works — so nothing to tell the person. */
    if (__DEV__) console.warn('[push] not registered:', e);
  }
}

/**
 * Stops pushes to this phone. Call it while the session is still valid —
 * the unregister route needs it. When the call cannot be made (offline, or the
 * session already ended), deleting the FCM token on the device still makes the
 * server's copy useless, so the next person on this phone never receives the
 * last person's notifications.
 */
export async function unregisterForPush() {
  if (!ENABLED) return;
  const token = await SecureStore.getItemAsync(TOKEN_KEY).catch(() => null);
  if (!token) return;
  /* Forget it first, so an expiry fired by the call below finds nothing left to do. */
  await SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => {});
  await unregisterPushDevice(token, UNREGISTER_TIMEOUT_MS).catch(() => {});
  await Notifications.unregisterForNotificationsAsync().catch(() => {});
  /* What is still in the tray belongs to the account that just left. */
  Notifications.clearLastNotificationResponse();
  await Notifications.dismissAllNotificationsAsync().catch(() => {});
}

/* ------------------------------------------------------------------ Taps */

type Payload = Record<string, unknown>;

const objectOf = (v: unknown): Payload | null => {
  if (typeof v === 'string') {
    try {
      v = JSON.parse(v);
    } catch {
      return null;
    }
  }
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Payload) : null;
};

/**
 * A push's FCM `data` map, read into the inbox row's `type` + `data`. FCM data
 * values are strings only, so the server may flatten the row (`id`, `date` at
 * the top level) or JSON-encode it under `data`; both are read.
 */
function payloadOf(n: Notifications.Notification) {
  const trigger = n.request.trigger as { remoteMessage?: { data?: Payload } } | null;
  const raw: Payload = { ...(trigger?.remoteMessage?.data ?? {}), ...(n.request.content.data ?? {}) };
  const data = { ...raw, ...(objectOf(raw.data) ?? {}) };
  return { type: typeof raw.type === 'string' ? raw.type : '', data };
}

/**
 * Keeps the signed-in phone registered and opens what a tapped push is about.
 * Mounted once, in the root layout, with the signed-in user's id — null while
 * signed out or still on the forced password change. A tap made then waits
 * here until someone signs in, since the screen it points at is not reachable
 * before that.
 */
export function usePush(userId: string | null, manager: boolean) {
  const signedIn = userId !== null;

  useEffect(() => {
    if (!ENABLED || !signedIn) return;
    registerForPush();
    const sub = Notifications.addPushTokenListener(({ data }) => {
      if (typeof data === 'string' && data) sendToken(data).catch(() => {});
    });
    return () => sub.remove();
  }, [signedIn, userId]);

  useEffect(() => {
    if (!ENABLED || !signedIn) return;
    const open = (response: Notifications.NotificationResponse) => {
      if (response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
      /* Handled once: this effect re-runs, and the last response outlives it. */
      Notifications.clearLastNotificationResponse();
      router.push(notificationTarget(payloadOf(response.notification), manager) ?? '/notifications');
    };
    /* A tap that launched the app, or that arrived before anyone was signed in. */
    const last = Notifications.getLastNotificationResponse();
    if (last) open(last);
    const sub = Notifications.addNotificationResponseReceivedListener(open);
    return () => sub.remove();
  }, [signedIn, manager]);
}
