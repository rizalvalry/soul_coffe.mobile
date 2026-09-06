const fs = require('fs');
const path = require('path');

const base = require('./app.json');

/**
 * Everything real lives in app.json. This file exists for one reason: `google-services.json` is a
 * Firebase credential and is NOT in git, and Expo's prebuild fails outright when
 * `android.googleServicesFile` points at a file that is not there.
 *
 * So the key is added only when the file exists. Consequences, deliberately:
 *
 *   - file present  → the google-services gradle plugin is applied, FCM initialises, and
 *     `getDevicePushTokenAsync()` returns a real token. Push works.
 *   - file absent   → the APK still builds and every other feature is untouched. The push
 *     registration reports "unavailable" once, in the log, and the app keeps using the Pusher
 *     socket plus its 10-second poll. Nothing crashes, nothing is silently broken.
 *
 * Getting the file: Firebase console → Project settings → Your apps → Android app registered with
 * the package name below → Download google-services.json → drop it in this directory. No code
 * change is needed afterwards, which is the point of doing it this way rather than editing
 * app.json by hand at deploy time.
 */
module.exports = ({ config }) => {
  const expo = { ...base.expo, ...config };
  const googleServices = path.join(__dirname, 'google-services.json');

  if (fs.existsSync(googleServices)) {
    expo.android = { ...expo.android, googleServicesFile: './google-services.json' };
  }

  return expo;
};
