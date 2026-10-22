import { Platform } from 'react-native';
import * as Application from 'expo-application';
import Constants from 'expo-constants';
import * as Device from 'expo-device';

/** SDK 57: Android ID is scoped to this phone, app signing key, and Android user. */
export function loginDeviceIdentity() {
  let deviceId: string | null = null;
  if (Platform.OS === 'android') {
    try {
      deviceId = Application.getAndroidId();
    } catch {
      // The server supplies the update message if binding is enforced.
    }
  }

  return {
    device_id: deviceId,
    device_name: (Device.deviceName ?? Device.modelName ?? 'Android').slice(0, 255),
    model: Device.modelName,
    os_version: Device.osVersion,
    app_version: Constants.nativeAppVersion ?? Constants.expoConfig?.version ?? null,
  };
}
