import { registerDevice, unregisterDevice } from './api';
import { deviceLabel, getDeviceToken, rememberedToken, rememberToken } from './device';

/**
 * The registration lifecycle: one device token, kept in step with who is signed in.
 *
 * Three rules this file exists to hold:
 *
 *  1. **Register after sign-in, not at launch.** `POST /me/devices` needs a bearer token, and
 *     registering before the session is restored would just 401.
 *  2. **Unregister BEFORE the session is revoked.** Sign-out revokes the Sanctum token, and after
 *     that the delete call can no longer authenticate — the row would be orphaned and the next
 *     person to use this phone would receive the previous user's notifications.
 *  3. **Never throw.** Every function here is called from an auth transition. A push failure must
 *     not be able to block a sign-in or trap somebody in a signed-in state.
 */

export type PushStatus = 'idle' | 'registered' | 'denied' | 'unavailable';

let lastStatus: PushStatus = 'idle';
let inFlight: Promise<PushStatus> | null = null;

export function pushStatus(): PushStatus {
  return lastStatus;
}

/**
 * Ensures this device is registered against the CURRENT session.
 *
 * Safe to call repeatedly — on sign-in, on app foreground, after a token rotation. Concurrent
 * calls share one attempt, because two sign-in paths (password and PIN) can both land here within
 * the same frame.
 */
export function syncRegistration(): Promise<PushStatus> {
  if (inFlight) return inFlight;

  inFlight = (async (): Promise<PushStatus> => {
    try {
      const availability = await getDeviceToken();

      if (availability.status === 'denied') {
        lastStatus = 'denied';
        return lastStatus;
      }

      if (availability.status === 'unsupported') {
        // Logged once rather than surfaced: on a build without google-services.json this is the
        // expected state, and an error banner would be telling the user about our deployment.
        console.warn('[push] tidak tersedia:', availability.reason);
        lastStatus = 'unavailable';
        return lastStatus;
      }

      // The server upserts on the token, so re-sending the same one is cheap and it also refreshes
      // `last_seen_at`. It is sent even when unchanged because the account behind it may have
      // changed — a shared handset must move the token to whoever signed in now.
      await registerDevice(availability.token, deviceLabel());
      await rememberToken(availability.token);

      lastStatus = 'registered';
      return lastStatus;
    } catch (e) {
      console.warn('[push] pendaftaran gagal:', e instanceof Error ? e.message : e);
      lastStatus = 'unavailable';
      return lastStatus;
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

/**
 * Called on a deliberate sign-out, while the session is still valid.
 *
 * The remembered token is used rather than asking the OS for it again: the fetch can be slow or
 * fail on a phone that is already offline, and the value we registered is the value the server
 * knows about.
 */
export async function releaseRegistration(): Promise<void> {
  try {
    const token = await rememberedToken();
    if (!token) return;

    await unregisterDevice(token);
  } catch {
    // Offline, or the token was already reclaimed by another account on this phone. Either way
    // the local clear below is what keeps this device honest.
  } finally {
    await rememberToken(null);
    lastStatus = 'idle';
  }
}
