const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const root = join(__dirname, '..');

function loadTs(file, modules = {}, globals = {}) {
  const source = readFileSync(join(root, file), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
    jsx: ts.JsxEmit.ReactJSX,
    esModuleInterop: true,
  } }).outputText;
  const state = { exports: {} };
  vm.runInNewContext(code, {
    ...globals,
    module: state,
    exports: state.exports,
    require: (name) => {
      assert.ok(Object.hasOwn(modules, name), `unexpected import: ${name}`);
      return modules[name];
    },
  });
  return state.exports;
}

const plain = (value) => JSON.parse(JSON.stringify(value));
const tokens = loadTs('src/theme/tokens.ts');

test('v2 palette, product colors, radii, shadow and type scale match the visual brief', () => {
  const { semantic, brand, accent, feedback, productColor, radius, shadow, type, fontFamily } = tokens;
  assert.equal(semantic.bg, '#FBF8F3');
  assert.equal(semantic.surface, '#FFFFFF');
  assert.equal(semantic.text, '#1F2A2E');
  assert.equal(semantic.textMuted, '#5F6B70');
  assert.equal(semantic.border, '#ECE7DF');
  assert.equal(semantic.surfaceSunken, '#F4F0E9');
  assert.equal(brand[700], '#007277');
  assert.equal(semantic.primary, brand[700]);
  assert.equal(accent[300], '#FFB547');
  assert.equal(feedback.successFg, '#11694F');
  assert.equal(feedback.dangerFg, '#B42318');
  assert.equal(feedback.infoFg, '#2952CC');
  assert.equal(feedback.purpleFg, '#6B35B8');
  assert.equal(Object.keys(productColor).length, 10);
  assert.deepEqual(plain(productColor['Soul Latte']), { bg: '#F8E6D4', fg: '#8A5A2B' });
  assert.deepEqual(plain(productColor['Cytrus Cold Brew']), { bg: '#FFF2C7', fg: '#7A5C00' });
  assert.equal(radius.lg, 20);
  assert.equal(radius.card, 24);
  assert.equal(radius.hero, 28);
  assert.equal(radius.pill, 999);
  assert.deepEqual(plain(shadow.card.shadowOffset), { width: 0, height: 6 });
  assert.equal(shadow.card.shadowRadius, 18);
  assert.deepEqual(plain([type.display.fontSize, type.display.fontWeight]), [20, '800']);
  assert.deepEqual(plain([type.h1.fontSize, type.h1.fontWeight]), [18, '800']);
  assert.deepEqual(plain([type.h2.fontSize, type.h2.fontWeight]), [15, '800']);
  assert.deepEqual(plain([type.body.fontSize, type.body.fontWeight]), [14, '700']);
  assert.deepEqual(plain([type.caption.fontSize, type.caption.fontWeight]), [12, '500']);
  assert.deepEqual(plain([type.label.fontSize, type.label.fontWeight]), [11, '700']);
  assert.equal(type.micro.fontSize, 10);
  assert.equal(type.display.fontFamily, fontFamily.extraBold);
  assert.equal(type.body.fontFamily, fontFamily.bold);
  assert.equal(type.caption.fontFamily, fontFamily.medium);
});

test('muted and subtle small text clear 4.5:1 against card and page backgrounds', () => {
  function luminance(hex) {
    const channels = hex.slice(1).match(/../g).map((value) => parseInt(value, 16) / 255);
    const [red, green, blue] = channels.map((value) => value <= 0.04045
      ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    return red * 0.2126 + green * 0.7152 + blue * 0.0722;
  }
  for (const foreground of [tokens.semantic.textMuted, tokens.semantic.textSubtle]) {
    for (const background of [tokens.semantic.bg, tokens.semantic.surface]) {
      const a = luminance(foreground);
      const b = luminance(background);
      const contrast = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      assert.ok(contrast >= 4.5, `${foreground} on ${background}: ${contrast.toFixed(2)}:1`);
    }
  }
});

test('every refill status keeps its previous semantic color role', () => {
  const { statusColor, feedback, brand, neutral } = tokens;
  assert.deepEqual(plain(Object.keys(statusColor)), [
    'SUBMITTED', 'APPROVED', 'REJECTED', 'PREPARING', 'READY_TO_PICK',
    'PICKED_UP', 'DELIVERED', 'CLOSED', 'CANCELLED', 'EXPIRED',
  ]);
  const role = {
    SUBMITTED: [feedback.warningFg, feedback.warningBg],
    APPROVED: [brand[700], brand[50]],
    REJECTED: [feedback.dangerFg, feedback.dangerBg],
    PREPARING: [feedback.infoFg, feedback.infoBg],
    READY_TO_PICK: [feedback.purpleFg, feedback.purpleBg],
    PICKED_UP: [feedback.infoFg, feedback.infoBg],
    DELIVERED: [feedback.successFg, feedback.successBg],
    CLOSED: [neutral[600], neutral[100]],
    CANCELLED: [neutral[500], neutral[100]],
    EXPIRED: [neutral[500], neutral[100]],
  };
  for (const [status, colors] of Object.entries(role)) {
    assert.deepEqual(plain([statusColor[status].fg, statusColor[status].bg]), colors, status);
  }
});

test('primary controls and steppers retain their minimum touch targets', () => {
  assert.ok(tokens.touch.buttonHeight >= 44);
  assert.ok(tokens.touch.minTarget >= 44);
  assert.ok(tokens.touch.stepperMinTarget >= 36);
  assert.ok(tokens.touch.minTarget - 8 >= 36); // ProductPickerCard compact stepper
});

test('motion stays short, bouncy, staggered, and system reduced-motion aware', () => {
  const reduceMotion = 'system';
  const identity = (value) => value;
  const { Easing, ReduceMotion } = {
    Easing: { bezier: () => identity, out: () => identity, in: () => identity, cubic: identity, linear: identity },
    ReduceMotion: { System: reduceMotion },
  };
  const motion = loadTs('src/theme/motion.ts', { 'react-native-reanimated': { Easing, ReduceMotion } });
  for (const [name, milliseconds] of Object.entries(motion.duration)) {
    assert.ok(milliseconds < 450, `duration.${name}`);
  }
  for (const [name, config] of Object.entries(motion.timing)) {
    assert.ok(config.duration < 450, `timing.${name}`);
    assert.equal(config.reduceMotion, reduceMotion, `timing.${name}`);
  }
  for (const [name, config] of Object.entries(motion.spring)) {
    assert.equal(config.reduceMotion, reduceMotion, `spring.${name}`);
  }
  assert.ok(motion.spring.bouncy.damping < motion.spring.gentle.damping);
  assert.equal(motion.pressScale.surface, 0.95);
  assert.equal(motion.entrance.rise, 14);
  assert.equal(motion.entrance.badgePeak, 1.22);
  assert.equal(motion.staggerDelay(1), 40);
  assert.equal(motion.staggerDelay(8), 320);
  assert.equal(motion.staggerDelay(20), 320);
});

test('font failure releases the native splash and renders the app shell', () => {
  let fonts = [false, null];
  let hideCalls = 0;
  let fontSources;
  const element = (type, props, key) => ({ type, props, key });
  const layout = loadTs('app/_layout.tsx', {
    react: {
      useCallback: (callback) => callback,
      useEffect: (callback) => { callback(); },
      useState: () => [true, () => {}],
    },
    'react/jsx-runtime': { jsx: element, jsxs: element },
    'react-native': { StyleSheet: { absoluteFill: {} }, View: 'View' },
    'expo-router': { Stack: 'Stack' },
    'expo-font': { useFonts: (sources) => { fontSources = sources; return fonts; } },
    'expo-status-bar': { StatusBar: 'StatusBar' },
    'expo-splash-screen': { preventAutoHideAsync() {}, hideAsync() { hideCalls++; } },
    '@expo-google-fonts/plus-jakarta-sans/500Medium': { PlusJakartaSans_500Medium: 500 },
    '@expo-google-fonts/plus-jakarta-sans/700Bold': { PlusJakartaSans_700Bold: 700 },
    '@expo-google-fonts/plus-jakarta-sans/800ExtraBold': { PlusJakartaSans_800ExtraBold: 800 },
    'react-native-safe-area-context': { SafeAreaProvider: 'SafeAreaProvider' },
    '@tanstack/react-query': { QueryClientProvider: 'QueryClientProvider' },
    '@/components/brand/AppSplash': { AppSplash: 'AppSplash' },
    '@/features/auth/store': { useAuth: (selector) => selector({
      restore() {}, status: 'unauthenticated', session: null,
    }) },
    '@/features/onboarding/store': { useOnboarding: (selector) => selector({
      load() {}, status: 'loaded',
    }) },
    '@/theme': { fontFamily: tokens.fontFamily, semantic: tokens.semantic },
    '@/lib/queryClient': { getQueryClient: () => ({}) },
  }, { setTimeout: () => 1, clearTimeout() {} }).default;

  const loading = layout();
  assert.match(JSON.stringify(loading), /AppSplash/);
  assert.match(JSON.stringify(loading), /"type":"Stack"/);
  assert.equal(hideCalls, 0);
  assert.deepEqual(plain(fontSources), {
    PlusJakartaSans_500Medium: 500,
    PlusJakartaSans_700Bold: 700,
    PlusJakartaSans_800ExtraBold: 800,
  });

  fonts = [false, new Error('font unavailable')];
  const failed = layout();
  assert.doesNotMatch(JSON.stringify(failed), /AppSplash/);
  assert.match(JSON.stringify(failed), /"type":"Stack"/);
  assert.equal(hideCalls, 1);
});
