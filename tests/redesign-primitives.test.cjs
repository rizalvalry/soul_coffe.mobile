const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const root = join(__dirname, '..');
const springCalls = [];
const jsx = (type, props) => ({ type, props: props ?? {} });
const react = {
  useCallback: (fn) => fn,
  useEffect: (fn) => fn(),
  useState: (initial) => [initial, () => {}],
  forwardRef: (render) => (props) => render(props, null),
};
const native = {
  StyleSheet: { create: (styles) => styles },
  Pressable: 'Pressable', View: 'View', TextInput: 'TextInput',
  ActivityIndicator: 'ActivityIndicator',
};
const animated = {
  View: 'AnimatedView',
  createAnimatedComponent: () => 'AnimatedPressable',
  useSharedValue: (value) => ({ value }),
  useAnimatedStyle: (fn) => fn(),
  withSpring: (target, config) => { springCalls.push({ target, config }); return { target, config }; },
  withTiming: (target, config) => ({ target, config }),
  withSequence: (...steps) => steps,
  withRepeat: (step) => step,
  cancelAnimation() {},
  interpolateColor: () => '#007277',
  Easing: { inOut: () => {}, in: () => {}, out: () => {}, quad: () => {} },
};
const theme = {
  accent: { 50: '#FFF1D6', 300: '#FFB547', 600: '#5C3B00' },
  brand: { 50: '#E3F3F2', 200: '#B3E3E6', 300: '#8CD6D9', 500: '#00A3AA', 700: '#007277' },
  feedback: {
    dangerFg: '#B42318', dangerBg: '#FDECEC', dangerBorder: '#F3B6B0',
    warningFg: '#5C3B00', warningBg: '#FFF1D6', warningBorder: '#F6D48D',
    infoFg: '#2952CC', infoBg: '#E4EEFF', infoBorder: '#B4C9F8',
    successFg: '#11694F', successBg: '#DDF3EC', successBorder: '#A4D9C6',
  },
  neutral: { 0: '#fff', 100: '#F4F0E9', 500: '#5F6B70', 600: '#4A565B' },
  semantic: { text: '#1F2A2E', textMuted: '#5F6B70', textSubtle: '#5F6B70',
    surfaceSunken: '#F4F0E9', primaryDisabled: '#D8D0C6', primary: '#007277' },
  radius: { md: 14, lg: 20, card: 24, pill: 999 },
  shadow: { card: { elevation: 1 } },
  space: { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, '2xl': 24, '3xl': 32 },
  touch: { minTarget: 48, buttonHeight: 52, inputHeight: 52 },
  pressScale: { surface: 0.95, control: 0.95, icon: 0.9 },
  spring: { press: { name: 'press' }, bouncy: { name: 'bouncy' } },
  timing: { fast: { duration: 140 }, base: { duration: 220 }, ambient: { duration: 400 } },
  type: { body: { fontSize: 14, lineHeight: 21, fontFamily: 'Plus Jakarta Sans' } },
  statusColor: { SUBMITTED: { fg: '#5C3B00', bg: '#FFF1D6', border: '#F6D48D' } },
};

function load(file, extra = {}) {
  const code = ts.transpileModule(readFileSync(join(root, file), 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
    jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } }).outputText;
  const modules = {
    react, 'react/jsx-runtime': { jsx, jsxs: jsx }, 'react-native': native,
    'react-native-reanimated': animated,
    '@expo/vector-icons/MaterialCommunityIcons': 'Icon',
    '@/theme': theme, './Text': { Text: 'AppText' }, './Touchable': { Touchable: 'Touchable' },
    './Motion': { enter: (...args) => args, exit: () => 'exit' },
    '@/features/realtime/RealtimeProvider': {},
    ...extra,
  };
  const state = { exports: {} };
  vm.runInNewContext(code, { module: state, exports: state.exports, require: (name) => {
    assert.ok(Object.hasOwn(modules, name), `unexpected import: ${name}`);
    return modules[name];
  } });
  return state.exports;
}

function nodes(tree) {
  const found = [];
  const visit = (value) => {
    if (Array.isArray(value)) return value.forEach(visit);
    if (!value || typeof value !== 'object' || !('type' in value)) return;
    found.push(value);
    visit(value.props.children);
  };
  visit(tree);
  return found;
}

function renderRoot(tree) {
  let current = tree;
  while (typeof current.type === 'function') current = current.type(current.props);
  return current;
}

function tapNative(pressable) {
  if (pressable.props.disabled) return;
  pressable.props.onPressIn?.({});
  pressable.props.onPress?.({});
  pressable.props.onPressOut?.({});
}

test('Button keeps disabled/loading inert and announces busy state with a visible loader', () => {
  const { Touchable } = load('src/components/ui/Touchable.tsx');
  const { Button, IconButton } = load('src/components/ui/Button.tsx', { './Touchable': { Touchable } });
  let presses = 0;
  const props = { label: 'Kirim', onPress: () => presses++ };
  const ready = Button(props);
  assert.equal(ready.props.disabled, false);
  assert.equal(ready.props.springBack, 'press');
  assert.equal(ready.props.accessibilityRole, 'button');
  assert.equal(ready.props.accessibilityLabel, 'Kirim');
  tapNative(renderRoot(ready));
  assert.equal(presses, 1);
  for (const state of [{ disabled: true }, { loading: true }]) {
    const button = Button({ ...props, ...state });
    assert.equal(button.props.disabled, true);
    assert.equal(button.props.accessibilityState.disabled, true);
    assert.equal(button.props.accessibilityState.busy, Boolean(state.loading));
    tapNative(renderRoot(button));
    if (state.loading) {
      assert.ok(nodes(button).some((node) => node.type === 'ActivityIndicator'));
      assert.ok(nodes(button).some((node) => node.type === 'AppText' && node.props.children === 'Kirim'));
    }
  }
  assert.equal(presses, 1);
  const compactIcon = IconButton({ icon: 'close', label: 'Tutup', size: 20 });
  assert.equal(compactIcon.props.accessibilityRole, 'button');
  assert.equal(compactIcon.props.accessibilityLabel, 'Tutup');
  assert.ok(compactIcon.props.style[1].width >= theme.touch.minTarget);
  assert.ok(compactIcon.props.style[1].height >= theme.touch.minTarget);
});

test('Input passes controlled text, keyboard type, error, and accessible label through', () => {
  const { Input } = load('src/components/ui/Input.tsx');
  let changed;
  const tree = Input({ label: 'Jumlah', value: '7', keyboardType: 'number-pad',
    onChangeText: (text) => { changed = text; }, error: 'Isi angka yang benar' });
  const input = nodes(tree).find((node) => node.type === 'TextInput');
  assert.equal(input.props.value, '7');
  assert.equal(input.props.keyboardType, 'number-pad');
  assert.equal(input.props.accessibilityLabel, 'Jumlah');
  input.props.onChangeText('8');
  assert.equal(changed, '8');
  assert.ok(nodes(tree).some((node) => node.type === 'AppText'
    && node.props.children === 'Isi angka yang benar'));
});

test('Touchable calls onPress once per tap and uses bouncy return only for ordinary surfaces', () => {
  const { Touchable } = load('src/components/ui/Touchable.tsx');
  let presses = 0;
  springCalls.length = 0;
  const tap = Touchable({ onPress: () => presses++ });
  tapNative(tap);
  assert.equal(presses, 1);
  assert.equal(springCalls[0].config.name, 'press');
  assert.equal(springCalls[1].config.name, 'bouncy');
  const submit = Touchable({ springBack: 'press', onPress: () => presses++ });
  tapNative(submit);
  assert.equal(presses, 2);
  assert.equal(springCalls[3].config.name, 'press');
  const inert = Touchable({ disabled: true, onPress: () => presses++ });
  assert.equal(inert.props.disabled, true);
  assert.equal(inert.props.onPressIn, undefined);
  tapNative(inert);
  assert.equal(presses, 2);
});

test('Banner and ConnectionBanner preserve their messages and accessibility roles', () => {
  const { Banner } = load('src/components/ui/Banner.tsx');
  const danger = Banner({ message: 'Coba lagi' });
  assert.equal(danger.props.accessibilityRole, 'alert');
  assert.ok(nodes(danger).some((node) => node.type === 'AppText' && node.props.children === 'Coba lagi'));
  const { ConnectionBanner } = load('src/components/ui/ConnectionBanner.tsx');
  assert.equal(ConnectionBanner({ state: 'connected' }), null);
  for (const [state, message] of [
    ['connecting', 'Menyambungkan realtime'],
    ['disconnected', 'Realtime tidak tersambung — tarik untuk memperbarui data'],
  ]) {
    const banner = ConnectionBanner({ state });
    assert.equal(banner.props.accessibilityRole, 'text');
    assert.ok(nodes(banner).some((node) => node.type === 'AppText' && node.props.children === message));
  }
});

test('status badge wraps its complete label in a narrow 360 dp layout', () => {
  const { StatusBadge } = load('src/components/ui/Badge.tsx');
  const badge = StatusBadge({ status: 'SUBMITTED' });
  const label = nodes(badge).find((node) => node.type === 'AppText');
  assert.equal(badge.props.accessibilityLabel, 'Menunggu Approval Finance');
  assert.equal(label.props.children, 'MENUNGGU APPROVAL FINANCE');
  assert.equal(label.props.numberOfLines, undefined);
  const [base] = badge.props.style;
  assert.equal(base.maxWidth, '100%');
  assert.equal(base.flexShrink, 1);
  assert.equal(label.props.style.flexShrink, 1);
  assert.equal(label.props.style.minWidth, 0);
  assert.ok(360 - 2 * 16 - 2 * base.paddingHorizontal > 0);
});

test('card motion helper springs 14 dp upward without double-animating nested Cards', () => {
  const calls = [];
  const builder = () => {
    const result = {};
    for (const method of ['delay', 'duration', 'easing', 'springify', 'damping',
      'stiffness', 'mass', 'withInitialValues', 'reduceMotion']) {
      result[method] = (value) => { calls.push([method, value]); return result; };
    }
    return result;
  };
  const animation = { ...animated, FadeInDown: builder(), FadeInUp: builder(),
    FadeIn: builder(), FadeOut: builder(), ZoomIn: builder(), LinearTransition: builder(),
    ReduceMotion: { System: 'system' } };
  const motionTheme = { ...theme, duration: { slow: 320, fast: 140, base: 220 },
    easing: { decelerate: 'decelerate', standard: 'standard' }, entrance: { rise: 14 },
    staggerDelay: (index) => Math.min(index * 40, 320),
    spring: { bouncy: { damping: 12, stiffness: 200, mass: 0.9 } } };
  const { enter } = load('src/components/ui/Motion.tsx', {
    'react-native-reanimated': animation, '@/theme': motionTheme,
  });
  enter('below', 2);
  assert.ok(calls.some(([method, value]) => method === 'delay' && value === 80));
  assert.ok(calls.some(([method, value]) => method === 'springify'));
  assert.ok(calls.some(([method, value]) => method === 'withInitialValues'
    && value.transform[0].translateY === 14));
  assert.ok(calls.some(([method, value]) => method === 'reduceMotion' && value === 'system'));
  calls.length = 0;
  enter('below', 20);
  assert.ok(calls.some(([method, value]) => method === 'delay' && value === 320));
  const { Card } = load('src/components/ui/Card.tsx');
  const card = Card({ children: 'Konten' });
  assert.equal(card.type, 'View');
  assert.equal(card.props.entering, undefined);
  assert.equal(card.props.style[0].borderRadius, 24);
});
