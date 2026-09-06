import { request } from '@/lib/api';

/**
 * Device registration for push (docs/04 §Push).
 *
 * Both calls go through `lib/api.ts` so they inherit the bearer token, the `{ data: … }`
 * unwrapping, and the 401 re-probe every other endpoint uses. Neither is worth failing a screen
 * over: push is an addition to the Pusher socket, never the only path a notification takes.
 */
export type DeviceRegistration = {
  id: number;
  platform: string;
  registered_at: string | null;
};

export function registerDevice(token: string, deviceName: string): Promise<DeviceRegistration> {
  return request<DeviceRegistration>('/me/devices', {
    method: 'POST',
    body: { token, platform: 'android', device_name: deviceName },
  });
}

export function unregisterDevice(token: string): Promise<void> {
  return request<void>('/me/devices', { method: 'DELETE', body: { token } });
}
