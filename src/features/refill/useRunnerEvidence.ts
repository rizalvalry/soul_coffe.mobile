import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';

export type GpsCoords = { lat: number; lng: number };
export type Photo = { uri: string; takenAt: string };

export function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([promise, new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms))]);
}

/** Never a hard block (E10) — any denial, error, or timeout resolves to `null`, not a rejection. */
export async function captureGps(): Promise<GpsCoords | null> {
  try {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (!permission.granted) return null;
    const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    return { lat: position.coords.latitude, lng: position.coords.longitude };
  } catch {
    return null;
  }
}

/** Camera only, never the gallery: the handover or damage photo is evidence from this trip. */
export async function capturePhoto(): Promise<Photo | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) {
    throw new Error('Izin kamera ditolak. Aktifkan izin kamera di pengaturan HP.');
  }

  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ['images'],
    quality: 0.6,
    allowsEditing: false,
  });

  if (result.canceled || !result.assets?.[0]) return null;

  return { uri: result.assets[0].uri, takenAt: new Date().toISOString() };
}
