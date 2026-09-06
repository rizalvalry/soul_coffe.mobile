import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';

/**
 * Getting this device's FCM token, and remembering it across launches.
 *
 * `getDevicePushTokenAsync()` returns the NATIVE FCM token, not an Expo push token. That is the
 * one the Laravel side needs, because the server talks to Firebase directly (FcmClient) rather
 * than through Expo's relay — one less third party in the path of an operational alert, and no
 * dependency on an Expo account for a self-hosted internal app.
 *
 * Every call here can fail for an ordinary reason — an emulator with no Play Services, a build
 * with no `google-services.json`, a user who said no to the permission — so nothing throws. The
 * caller gets `null` and the app carries on with the Pusher socket.
 */

/** The last token we successfully registered, so a re-register is skipped when nothing changed. */
const LAST_TOKEN_KEY = 'soul.push.token.v1';

export type PushAvailability =
  | { status: 'ready'; token: string }
  | { status: 'denied' }
  | { status: 'unsupported'; reason: string };

/** Android 8+ requires a channel before any notification can be shown at all. */
export async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;

  try {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Operasional',
      importance: Notifications.AndroidImportance.HIGH,
      // Matches the FCM message's android.notification block on the server; a channel that does
      // not exist would silently drop the sound and heads-up display.
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#00A3AA',
      sound: 'default',
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
    });
  } catch {
    // A channel that cannot be created only costs presentation, never delivery.
  }
}

/**
 * Asks for the notification permission if it has not been decided yet.
 *
 * Android 13+ shows a system dialog for POST_NOTIFICATIONS; below that the permission is granted
 * at install time and this resolves immediately. A previous "denied" is NOT re-prompted — Android
 * ignores repeat requests anyway, and the app must not nag on every launch.
 */
export async function requestPermission(): Promise<boolean> {
  try {
    const existing = await Notifications.getPermissionsAsync();
    if (existing.granted) return true;
    if (!existing.canAskAgain) return false;

    const asked = await Notifications.requestPermissionsAsync();
    return asked.granted;
  } catch {
    return false;
  }
}

export async function getDeviceToken(): Promise<PushAvailability> {
  if (!Device.isDevice) {
    // An emulator has no Play Services in most images; asking would throw a confusing native error.
    return { status: 'unsupported', reason: 'Emulator tidak mendukung push notification.' };
  }

  await ensureAndroidChannel();

  const granted = await requestPermission();
  if (!granted) return { status: 'denied' };

  try {
    const token = await Notifications.getDevicePushTokenAsync();
    const value = typeof token.data === 'string' ? token.data : String(token.data ?? '');

    if (!value) {
      return { status: 'unsupported', reason: 'Token perangkat kosong.' };
    }

    return { status: 'ready', token: value };
  } catch (e) {
    // The usual cause is a build without google-services.json — see app.config.js. Reported, not
    // thrown: push is optional, the socket is not.
    return {
      status: 'unsupported',
      reason: e instanceof Error ? e.message : 'Firebase belum dikonfigurasi pada build ini.',
    };
  }
}

export function deviceLabel(): string {
  const name = Device.deviceName ?? Device.modelName ?? 'Android';
  return name.slice(0, 120);
}

export async function rememberToken(token: string | null): Promise<void> {
  try {
    if (token) await AsyncStorage.setItem(LAST_TOKEN_KEY, token);
    else await AsyncStorage.removeItem(LAST_TOKEN_KEY);
  } catch {
    // Only costs one redundant registration next launch.
  }
}

export async function rememberedToken(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(LAST_TOKEN_KEY);
  } catch {
    return null;
  }
}
