# Iverto Attendance

Expo (SDK 54) app for employees and managers, backed by the Iverto Attendance
mobile API (`/v1/mobile/*`, see `../mobile_api.md`).

## Configuration

| Setting | `app.json` → `expo.extra` | Env override (dev) |
| --- | --- | --- |
| API base URL (ends at `/v1`) | `apiUrl` | `EXPO_PUBLIC_API_URL` |
| Supabase project URL | `supabaseUrl` | `EXPO_PUBLIC_SUPABASE_URL` |
| Supabase anon (public) key | `supabaseAnonKey` | `EXPO_PUBLIC_SUPABASE_ANON_KEY` |

`apiUrl` defaults to `https://ivertovm.indiasouthcentral.cloudapp.azure.com/att/v1`.

The API has no login route: the app signs in against **Supabase Auth**
(`/auth/v1/token`) and sends the access token as `Authorization: Bearer …`.
Until `supabaseUrl` and `supabaseAnonKey` are set, the sign-in button stays
disabled and the screen says why. Never put the service-role key in the app.

## Push notifications (FCM)

Android only. The app registers the device's raw FCM token with
`POST /mobile/push-devices` after sign-in (and on every launch), withdraws it on
sign-out, and opens the request or day a tapped push is about (`lib/push.ts`).
Server-side contract: `../fcm_server_changes.md`.

Firebase is configured by `google-services.json` (project `iverto-attend`),
which is git-ignored. `app.config.js` wires it in when it is present — beside
`app.json` locally, or via the `GOOGLE_SERVICES_JSON` path on EAS. Without it
the app still builds; push just stays off.

## Layout

- `lib/api/` — transport (`http.ts`: auth header, refresh, timeouts,
  `Idempotency-Key`), Supabase auth (`supabase.ts`), token storage
  (`tokens.ts`, SecureStore), and one function per endpoint (`endpoints.ts`).
- `lib/auth.tsx` — session provider; `/mobile/me` decides the shell.
- `app/_layout.tsx` — route guards: sign-in → forced password change → shells.

## Running

```sh
npm install
npx expo run:android   # native modules changed: secure-store, location, document-picker, file-system
```

The local `android/` folder (git-ignored) is generated — regenerate it with
`npx expo prebuild --platform android --clean` after native modules change and before a release build.

Play Store bundle (targets API 36 / Android 16, min API 24):

```sh
npx expo prebuild --platform android
cd android && ./gradlew bundleRelease   # → app/build/outputs/bundle/release/app-release.aab
```

It is signed with the **upload key** (`IVERTO_UPLOAD_*` in the user-level
`~/.gradle/gradle.properties`); Play App Signing re-signs it with Google's
deployment key. Bump `version` and `android.versionCode` in `app.json` for every upload.
