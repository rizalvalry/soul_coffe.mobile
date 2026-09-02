import { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { File, Paths } from 'expo-file-system';
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
 */
function buildHtml(): string {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
<style>
  html, body { margin: 0; padding: 0; height: 100%; background: ${neutral[0]}; overflow: hidden; }
  canvas { display: block; width: 100%; height: 100%; touch-action: none; }
</style>
</head>
<body>
<canvas id="pad"></canvas>
<script>
  var canvas = document.getElementById('pad');
  var ctx = canvas.getContext('2d');
  var strokeCount = 0;
  var drawing = false;
  var moved = false;
  var lastX = 0;
  var lastY = 0;

  function resize() {
    var ratio = window.devicePixelRatio || 1;
    canvas.width = window.innerWidth * ratio;
    canvas.height = window.innerHeight * ratio;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '${brand[700]}';
  }
  resize();

  function pos(e) {
    var t = e.touches && e.touches.length ? e.touches[0] : e;
    var rect = canvas.getBoundingClientRect();
    return { x: t.clientX - rect.left, y: t.clientY - rect.top };
  }
  function start(e) {
    e.preventDefault();
    drawing = true;
    moved = false;
    var p = pos(e);
    lastX = p.x; lastY = p.y;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  }
  function move(e) {
    if (!drawing) return;
    e.preventDefault();
    var p = pos(e);
    var dist = Math.hypot(p.x - lastX, p.y - lastY);
    if (dist > 1.5) moved = true;
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    lastX = p.x; lastY = p.y;
  }
  function end(e) {
    if (!drawing) return;
    drawing = false;
    if (moved) strokeCount += 1;
  }

  canvas.addEventListener('touchstart', start, { passive: false });
  canvas.addEventListener('touchmove', move, { passive: false });
  canvas.addEventListener('touchend', end, { passive: false });
  canvas.addEventListener('touchcancel', end, { passive: false });
  canvas.addEventListener('mousedown', start);
  canvas.addEventListener('mousemove', move);
  canvas.addEventListener('mouseup', end);

  function clearPad() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    strokeCount = 0;
  }
  function finishPad() {
    var valid = strokeCount >= ${MIN_STROKES};
    var base64 = valid ? canvas.toDataURL('image/png').split(',')[1] : null;
    window.ReactNativeWebView.postMessage(JSON.stringify({
      type: 'result',
      valid: valid,
      strokeCount: strokeCount,
      base64: base64,
    }));
  }
  window.__soulSignature = { clearPad: clearPad, finishPad: finishPad };
</script>
</body>
</html>`;
}

const html = buildHtml();

type PadMessage = {
  type: 'result';
  valid: boolean;
  strokeCount: number;
  base64: string | null;
};

function isPadMessage(value: unknown): value is PadMessage {
  return !!value && typeof value === 'object' && (value as { type?: unknown }).type === 'result';
}

export function SignaturePad({ onSigned, onClear }: SignaturePadProps) {
  const ref = useRef<WebView>(null);
  const [error, setError] = useState<string | null>(null);

  const handleMessage = (event: WebViewMessageEvent) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(event.nativeEvent.data);
    } catch {
      setError('Gagal memproses tanda tangan. Coba lagi.');
      return;
    }
    if (!isPadMessage(parsed)) return;

    if (!parsed.valid || !parsed.base64) {
      setError('Tanda tangan belum lengkap');
      return;
    }

    try {
      const file = new File(Paths.cache, `signature-${Date.now()}.png`);
      file.create({ overwrite: true });
      file.write(parsed.base64, { encoding: 'base64' });
      setError(null);
      onSigned({ uri: file.uri, strokeCount: parsed.strokeCount });
    } catch {
      setError('Gagal menyimpan tanda tangan di perangkat.');
    }
  };

  const clear = () => {
    ref.current?.injectJavaScript('window.__soulSignature.clearPad(); true;');
    setError(null);
    onClear?.();
  };

  const done = () => {
    ref.current?.injectJavaScript('window.__soulSignature.finishPad(); true;');
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.canvasBox}>
        <WebView
          ref={ref}
          originWhitelist={['*']}
          source={{ html }}
          onMessage={handleMessage}
          scrollEnabled={false}
          bounces={false}
          style={styles.webview}
        />
      </View>

      <Text
        variant="caption"
        color={error ? feedback.dangerFg : semantic.textMuted}
        style={styles.hint}
      >
        {error ?? 'Minta staff menandatangani di area ini'}
      </Text>

      <View style={styles.row}>
        <Button label="Hapus" variant="secondary" fullWidth={false} onPress={clear} style={styles.button} />
        <Button label="Selesai" variant="primary" fullWidth={false} onPress={done} style={styles.button} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  canvasBox: {
    height: touch.tileMinHeight * 2.5,
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: brand[300],
    overflow: 'hidden',
    backgroundColor: neutral[0],
  },
  webview: { flex: 1, backgroundColor: 'transparent' },
  hint: { minHeight: 18 },
  row: { flexDirection: 'row', gap: space.sm, justifyContent: 'flex-end' },
  button: { paddingHorizontal: space.xl },
});
