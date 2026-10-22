/**
 * `app.json` plus the one thing it cannot say statically: where Firebase's
 * `google-services.json` is, if anywhere.
 *
 * The file is git-ignored like every other per-project credential here, so a
 * fresh clone has none — and pointing `android.googleServicesFile` at a missing
 * file fails prebuild outright. So it is wired in only when it exists:
 *
 *   • `GOOGLE_SERVICES_JSON` — a path, which is what an EAS file environment
 *     variable expands to on a build server
 *   • `./google-services.json` beside this file, for local builds
 *
 * Without either the app still builds and runs; it just cannot get an FCM
 * token, so push stays off and the in-app inbox is all there is.
 */
const fs = require('fs');
const path = require('path');

function googleServicesFile() {
  if (process.env.GOOGLE_SERVICES_JSON) return process.env.GOOGLE_SERVICES_JSON;
  return fs.existsSync(path.join(__dirname, 'google-services.json')) ? './google-services.json' : undefined;
}

module.exports = ({ config }) => {
  const file = googleServicesFile();
  if (!file) return config;
  return { ...config, android: { ...config.android, googleServicesFile: file } };
};
