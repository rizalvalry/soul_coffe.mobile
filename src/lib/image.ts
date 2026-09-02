import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

/**
 * Evidence photos are re-encoded on the device before they are uploaded.
 *
 * `launchCameraAsync({ quality: 0.6 })` re-compresses but does NOT resize: on a current Android
 * phone it still hands back a full-sensor JPEG of 3-8 MB. That payload is what made
 * `POST /media/evidence` fail in the field — see the docblock on `uploadFileWithStatus()` for the
 * transport defect it triggers. Shrinking the body to ~1 MB cuts the upload window on a cellular
 * uplink from minutes to seconds, which is the single most effective mitigation available to the
 * client, and it keeps every photo comfortably under the server's `max:5120` rule.
 *
 * Re-encoding also normalises EXIF orientation, because the manipulator decodes to a bitmap and
 * writes the rotation into the pixels rather than into a tag the server never reads.
 */
const TARGET_BYTES = 1024 * 1024;

/** Longest-edge ceilings, tried in order. 1600px keeps a frozen-cart photo legible for the
 *  Barista reviewing it — the evidence has to be *readable*, not merely small. */
const EDGE_STEPS = [1600, 1280, 1024] as const;

/** Quality ladder tried at each edge before stepping the dimensions down. */
const QUALITY_STEPS = [0.7, 0.55, 0.4] as const;

export type CompressedImage = {
  uri: string;
  bytes: number;
  width: number;
  height: number;
  /** False when every attempt stayed above the target and the smallest candidate was kept. */
  withinTarget: boolean;
};

function sizeOf(uri: string): number {
  try {
    return new File(uri).size ?? 0;
  } catch {
    return 0;
  }
}

/** Intermediates pile up in the cache directory across retakes, so every candidate we do not
 *  return is removed. A failure here must never surface — it is housekeeping, not the task. */
function discard(uri: string | null): void {
  if (!uri) return;
  try {
    new File(uri).delete();
  } catch {
    // The OS reclaims the cache directory on its own; nothing to recover here.
  }
}

/**
 * Re-encodes `uri` to a JPEG of at most ~1 MB and returns the new file.
 *
 * Never throws: if the manipulator is unavailable the original URI is returned unchanged, so a
 * staff member is never blocked from submitting by an optimisation. The caller learns which
 * happened from `withinTarget`.
 */
export async function compressForUpload(uri: string): Promise<CompressedImage> {
  let best: { uri: string; bytes: number; width: number; height: number } | null = null;

  try {
    const context = ImageManipulator.manipulate(uri);
    const original = await context.renderAsync();
    const longestEdge = Math.max(original.width, original.height);
    const isLandscape = original.width >= original.height;

    for (const edge of EDGE_STEPS) {
      for (const compress of QUALITY_STEPS) {
        context.reset();
        // Never upscale — enlarging a small photo adds bytes and no detail.
        if (longestEdge > edge) {
          context.resize(isLandscape ? { width: edge } : { height: edge });
        }

        const rendered = await context.renderAsync();
        const saved = await rendered.saveAsync({ compress, format: SaveFormat.JPEG });
        const bytes = sizeOf(saved.uri);

        if (bytes > 0 && bytes <= TARGET_BYTES) {
          discard(best?.uri ?? null);
          return {
            uri: saved.uri,
            bytes,
            width: saved.width,
            height: saved.height,
            withinTarget: true,
          };
        }

        // Keep the smallest candidate seen so far as the fallback for a photo that simply will
        // not compress far enough (rare, but a noisy high-ISO frame can do it).
        if (!best || (bytes > 0 && bytes < best.bytes)) {
          discard(best?.uri ?? null);
          best = { uri: saved.uri, bytes, width: saved.width, height: saved.height };
        } else {
          discard(saved.uri);
        }
      }

      // A photo already at or below this edge cannot get smaller by resizing to the next one
      // down only through dimensions — but the quality ladder above has already been exhausted,
      // so continue to the smaller edge.
    }
  } catch {
    discard(best?.uri ?? null);
    const bytes = sizeOf(uri);
    return { uri, bytes, width: 0, height: 0, withinTarget: bytes > 0 && bytes <= TARGET_BYTES };
  }

  if (best) {
    return { ...best, withinTarget: best.bytes <= TARGET_BYTES };
  }

  const bytes = sizeOf(uri);
  return { uri, bytes, width: 0, height: 0, withinTarget: bytes > 0 && bytes <= TARGET_BYTES };
}
