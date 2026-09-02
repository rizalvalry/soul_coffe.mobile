import { useCallback, useRef, useState } from 'react';
import { Image, Modal, Pressable, StyleSheet, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { File, Paths } from 'expo-file-system';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Text } from './Text';
import { Button } from './Button';
import { brand, feedback, neutral, radius, semantic, space, touch } from '@/theme';

export type SignatureResult = {
  /** file:// uri — useDeliverRefill() uploads multipart and needs a uri, not a data URL. */
  uri: string;
  strokeCount: number;
};

export type SignaturePadProps = {
  onSigned: (result: SignatureResult) => void;
  /** Fired when the pad is cleared, so the caller can drop any previously captured result. */
  onClear?: () => void;
};

const MIN_STROKES = 3;

/**
 * Self-contained HTML canvas rendered through react-native-webview — no native module linking
 * needed (docs/02 §13.2 originally specced `react-native-signature-canvas`, which is itself a
 * thin WebView wrapper; this inlines the same idea without the extra dependency).
 *
 * A "stroke segment" is one continuous press-drag-release that actually moved the pointer. A
 * bare tap never increments the count, which is what makes E24 (a single accidental dot) fail
 * the ≥3 check instead of slipping through as three taps.
 *
 * Three things make it track a finger accurately, and all three were missing before:
 *
 *  - The canvas is sized from its own measured box on every layout change, not once at script
 *    time. The old code ran `resize()` immediately, while the WebView viewport was often still
 *    0×0 or pre-rotation, so the backing store and the CSS box disagreed and every touch landed
 *    at the wrong place — the "imprecise pen" that made this unusable with a fingertip.
 *  - Strokes are kept as points and re-rendered after a resize, instead of being lost or
 *    stretched. `setTransform` replaces `scale`, which used to compound on each call.
 *  - Pointer capture keeps a stroke alive when the finger strays outside the canvas, and each
 *    segment is drawn as a quadratic through touch midpoints, so a slow finger produces a smooth
 *    line rather than a visible chain of straight hops.
 */
function buildHtml(): string {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
<style>
  html, body { margin: 0; padding: 0; height: 100%; background: ${neutral[0]}; overflow: hidden;
               -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; }
  canvas { display: block; width: 100%; height: 100%; touch-action: none; }
</style>
</head>
<body>
<canvas id="pad"></canvas>
<script>
  var canvas = document.getElementById('pad');
  var ctx = canvas.getContext('2d');
  var strokes = [];      // committed strokes, each an array of {x, y} in CSS pixels
  var current = null;
  var moved = false;

  function applyStyle() {
    ctx.lineWidth = 3.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '${brand[700]}';
  }

  /** Draws one stroke with quadratic segments through the midpoints of consecutive samples. */
  function drawStroke(points) {
    if (!points.length) return;
    if (points.length === 1) {
      ctx.beginPath();
      ctx.arc(points[0].x, points[0].y, ctx.lineWidth / 2, 0, Math.PI * 2);
      ctx.fillStyle = ctx.strokeStyle;
      ctx.fill();
      return;
    }
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (var i = 1; i < points.length - 1; i++) {
      var mx = (points[i].x + points[i + 1].x) / 2;
      var my = (points[i].y + points[i + 1].y) / 2;
      ctx.quadraticCurveTo(points[i].x, points[i].y, mx, my);
    }
    var last = points[points.length - 1];
    ctx.lineTo(last.x, last.y);
    ctx.stroke();
  }

  function redraw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    applyStyle();
    for (var i = 0; i < strokes.length; i++) drawStroke(strokes[i]);
    if (current) drawStroke(current);
  }

  /** Sizes the backing store to the element's real box; safe to call any number of times. */
  function fit() {
    var rect = canvas.getBoundingClientRect();
    var w = Math.round(rect.width);
    var h = Math.round(rect.height);
    if (w <= 0 || h <= 0) return;

    var ratio = window.devicePixelRatio || 1;
    var nextW = Math.round(w * ratio);
    var nextH = Math.round(h * ratio);
    if (canvas.width === nextW && canvas.height === nextH) return;

    canvas.width = nextW;
    canvas.height = nextH;
    // setTransform, not scale: scale multiplies onto whatever transform is already in place, so
    // calling it twice silently doubled every coordinate.
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    redraw();
  }

  window.addEventListener('resize', fit);
  if (window.ResizeObserver) new ResizeObserver(fit).observe(canvas);
  fit();
  // The WebView can report a zero-height box on the first frame; a second pass once layout has
  // settled is what guarantees the canvas is not left mis-scaled.
  requestAnimationFrame(fit);
  setTimeout(fit, 120);

  function pointAt(e) {
    var rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  canvas.addEventListener('pointerdown', function (e) {
    e.preventDefault();
    // Capture keeps the stroke coming to us even if the finger slides off the canvas edge.
    if (canvas.setPointerCapture) { try { canvas.setPointerCapture(e.pointerId); } catch (err) {} }
    current = [pointAt(e)];
    moved = false;
    redraw();
  }, { passive: false });

  canvas.addEventListener('pointermove', function (e) {
    if (!current) return;
    e.preventDefault();
    var p = pointAt(e);
    var prev = current[current.length - 1];
    if (Math.hypot(p.x - prev.x, p.y - prev.y) > 1.2) moved = true;
    current.push(p);
    redraw();
  }, { passive: false });

  function finishStroke(e) {
    if (!current) return;
    if (e && e.pointerId != null && canvas.releasePointerCapture) {
      try { canvas.releasePointerCapture(e.pointerId); } catch (err) {}
    }
    // A stationary tap is not a stroke — E24 depends on this staying true.
    if (moved) strokes.push(current);
    current = null;
    redraw();
  }

  canvas.addEventListener('pointerup', finishStroke, { passive: false });
  canvas.addEventListener('pointercancel', finishStroke, { passive: false });
  canvas.addEventListener('pointerleave', finishStroke, { passive: false });

  function post(payload) {
    window.ReactNativeWebView.postMessage(JSON.stringify(payload));
  }

  function clearPad() {
    strokes = [];
    current = null;
    redraw();
    post({ type: 'strokes', strokeCount: 0 });
  }

  function undoStroke() {
    strokes.pop();
    redraw();
    post({ type: 'strokes', strokeCount: strokes.length });
  }

  function finishPad() {
    var valid = strokes.length >= ${MIN_STROKES};
    post({
      type: 'result',
      valid: valid,
      strokeCount: strokes.length,
      base64: valid ? canvas.toDataURL('image/png').split(',')[1] : null,
    });
  }

  // Keeps the RN side's stroke counter in step so the Selesai button can be disabled honestly
  // rather than failing after the fact.
  var reportAfterEnd = function () { post({ type: 'strokes', strokeCount: strokes.length }); };
  canvas.addEventListener('pointerup', reportAfterEnd);
  canvas.addEventListener('pointercancel', reportAfterEnd);

  window.__soulSignature = { clearPad: clearPad, finishPad: finishPad, undoStroke: undoStroke };
</script>
</body>
</html>`;
}

const html = buildHtml();

type PadMessage =
  | { type: 'result'; valid: boolean; strokeCount: number; base64: string | null }
  | { type: 'strokes'; strokeCount: number };

function isPadMessage(value: unknown): value is PadMessage {
  if (!value || typeof value !== 'object') return false;
  const type = (value as { type?: unknown }).type;
  return type === 'result' || type === 'strokes';
}

/**
 * The signature field.
 *
 * Signing happens in a full-screen modal rather than in a small box inline on a scrolling page.
 * A pad a few centimetres tall, competing with the parent ScrollView for the same drag gesture,
 * is what made a fingertip signature so hard to produce. The modal gives the whole screen to the
 * canvas and nothing else, and it can only be closed by its own buttons — a signature lost to an
 * accidental backdrop tap or a stray back-swipe means starting the whole delivery over.
 */
export function SignaturePad({ onSigned, onClear }: SignaturePadProps) {
  const ref = useRef<WebView>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [strokeCount, setStrokeCount] = useState(0);
  const [preview, setPreview] = useState<string | null>(null);

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(event.nativeEvent.data);
      } catch {
        setError('Gagal memproses tanda tangan. Coba lagi.');
        return;
      }
      if (!isPadMessage(parsed)) return;

      if (parsed.type === 'strokes') {
        setStrokeCount(parsed.strokeCount);
        if (parsed.strokeCount > 0) setError(null);
        return;
      }

      if (!parsed.valid || !parsed.base64) {
        setError(`Paraf belum lengkap — buat minimal ${MIN_STROKES} goresan.`);
        return;
      }

      try {
        const file = new File(Paths.cache, `signature-${Date.now()}.png`);
        file.create({ overwrite: true });
        file.write(parsed.base64, { encoding: 'base64' });
        setError(null);
        setPreview(file.uri);
        setOpen(false);
        onSigned({ uri: file.uri, strokeCount: parsed.strokeCount });
      } catch {
        setError('Gagal menyimpan tanda tangan di perangkat.');
      }
    },
    [onSigned],
  );

  const clear = useCallback(() => {
    ref.current?.injectJavaScript('window.__soulSignature.clearPad(); true;');
    setError(null);
  }, []);

  const undo = useCallback(() => {
    ref.current?.injectJavaScript('window.__soulSignature.undoStroke(); true;');
  }, []);

  const done = useCallback(() => {
    ref.current?.injectJavaScript('window.__soulSignature.finishPad(); true;');
  }, []);

  const openPad = useCallback(() => {
    setStrokeCount(0);
    setError(null);
    setOpen(true);
  }, []);

  const cancel = useCallback(() => {
    setOpen(false);
    setError(null);
  }, []);

  const discard = useCallback(() => {
    setPreview(null);
    setStrokeCount(0);
    onClear?.();
  }, [onClear]);

  return (
    <View style={styles.wrap}>
      {preview ? (
        <View style={styles.previewBlock}>
          <View style={styles.previewBox}>
            <Image source={{ uri: preview }} style={styles.preview} resizeMode="contain" />
          </View>
          <View style={styles.row}>
            <Button
              label="Ulangi Paraf"
              icon="draw"
              variant="secondary"
              fullWidth={false}
              onPress={openPad}
              style={styles.button}
            />
            <Button
              label="Hapus"
              icon="close"
              variant="ghost"
              fullWidth={false}
              onPress={discard}
              style={styles.button}
            />
          </View>
        </View>
      ) : (
        <Pressable
          onPress={openPad}
          accessibilityRole="button"
          accessibilityLabel="Buka area paraf staff"
          style={({ pressed }) => [styles.trigger, pressed && styles.triggerPressed]}
        >
          <MaterialCommunityIcons name="draw" size={30} color={brand[600]} />
          <Text variant="bodyStrong" color={brand[700]}>
            Ketuk untuk Paraf
          </Text>
          <Text variant="caption" color={semantic.textMuted} center>
            Area paraf akan terbuka satu layar penuh agar mudah ditulis dengan jari.
          </Text>
        </Pressable>
      )}

      {error && !open ? (
        <Text variant="caption" color={feedback.dangerFg}>
          {error}
        </Text>
      ) : null}

      <Modal
        visible={open}
        animationType="slide"
        presentationStyle="fullScreen"
        // Android's back gesture routes here. Swallowing it is deliberate: the only ways out are
        // Batal and Simpan, so a half-drawn signature cannot be lost by accident.
        onRequestClose={() => undefined}
      >
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <View style={styles.modalHeaderText}>
              <Text variant="h3">Paraf Staff</Text>
              <Text variant="caption" color={semantic.textMuted}>
                {strokeCount >= MIN_STROKES
                  ? 'Paraf siap disimpan.'
                  : `Minimal ${MIN_STROKES} goresan — saat ini ${strokeCount}.`}
              </Text>
            </View>
            <Pressable
              onPress={cancel}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Tutup area paraf tanpa menyimpan"
              style={styles.closeButton}
            >
              <MaterialCommunityIcons name="close" size={24} color={semantic.textMuted} />
            </Pressable>
          </View>

          <View style={styles.canvasBox}>
            <WebView
              ref={ref}
              originWhitelist={['*']}
              source={{ html }}
              onMessage={handleMessage}
              scrollEnabled={false}
              bounces={false}
              overScrollMode="never"
              style={styles.webview}
            />
          </View>

          <Text
            variant="caption"
            color={error ? feedback.dangerFg : semantic.textMuted}
            center
            style={styles.hint}
          >
            {error ?? 'Minta staff menandatangani di area putih di atas.'}
          </Text>

          <View style={styles.modalActions}>
            <Button
              label="Undo"
              icon="undo"
              variant="ghost"
              fullWidth={false}
              onPress={undo}
              disabled={strokeCount === 0}
              style={styles.button}
            />
            <Button
              label="Hapus"
              icon="eraser"
              variant="secondary"
              fullWidth={false}
              onPress={clear}
              disabled={strokeCount === 0}
              style={styles.button}
            />
            <Button
              label="Simpan"
              icon="check"
              variant="primary"
              fullWidth={false}
              onPress={done}
              disabled={strokeCount < MIN_STROKES}
              style={styles.button}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },

  trigger: {
    minHeight: touch.tileMinHeight,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: brand[300],
    backgroundColor: brand[50],
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
    padding: space.lg,
  },
  triggerPressed: { opacity: 0.7 },

  previewBlock: { gap: space.sm },
  previewBox: {
    height: touch.tileMinHeight * 1.6,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: semantic.border,
    backgroundColor: neutral[0],
    overflow: 'hidden',
  },
  preview: { flex: 1 },

  modal: { flex: 1, backgroundColor: semantic.bg, padding: space.lg, gap: space.md },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: space.md,
    paddingTop: space['3xl'],
  },
  modalHeaderText: { flex: 1, gap: space.xxs },
  closeButton: {
    width: touch.minTarget,
    height: touch.minTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },

  canvasBox: {
    flex: 1,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: brand[300],
    overflow: 'hidden',
    backgroundColor: neutral[0],
  },
  webview: { flex: 1, backgroundColor: 'transparent' },

  hint: { minHeight: 18 },
  modalActions: { flexDirection: 'row', gap: space.sm, justifyContent: 'flex-end' },
  row: { flexDirection: 'row', gap: space.sm, justifyContent: 'flex-end' },
  button: { paddingHorizontal: space.lg },
});
