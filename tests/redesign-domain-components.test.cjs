const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const root = join(__dirname, '..');
const source = (file) => readFileSync(join(root, file), 'utf8');
const jsx = (type, props, key) => ({ type, props, key });
const react = { useEffect() {}, useRef: (current) => ({ current }), useState: (initial) => [initial, () => {}], useCallback: (fn) => fn };
const reanimated = {
  View: 'AnimatedView',
  useSharedValue: (value) => ({ value }),
  useDerivedValue: (fn) => ({ value: fn() }),
  useAnimatedStyle: (fn) => fn(),
  withSequence: (...values) => values.at(-1),
  withSpring: (value) => value,
  withTiming: (value) => value,
  interpolateColor: () => '#007277',
};
const tokens = load('src/theme/tokens.ts');
const theme = {
  ...tokens,
  pressScale: { icon: 0.9, surface: 0.95 },
  entrance: { badgePeak: 1.22 },
  duration: { slower: 400 },
  spring: { bouncy: { reduceMotion: 'system' }, gentle: { reduceMotion: 'system' } },
  timing: { fast: { duration: 140, reduceMotion: 'system' }, base: { duration: 220, reduceMotion: 'system' } },
};
const native = { StyleSheet: { create: (styles) => styles }, View: 'View', TextInput: 'TextInput', Image: 'Image' };
const common = {
  react,
  'react/jsx-runtime': { jsx, jsxs: jsx },
  'react-native': native,
  'react-native-reanimated': reanimated,
  '@expo/vector-icons/MaterialCommunityIcons': 'Icon',
  '@/theme': theme,
  '@/components/ui/Text': { Text: 'Text' },
  '@/components/ui/Touchable': { Touchable: 'Touchable' },
  '@/components/ui/Motion': { enter: () => null, listTransition: null },
};

function load(file, modules = {}, globals = {}) {
  const compiled = ts.transpileModule(source(file), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
    jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } }).outputText;
  const state = { exports: {} };
  vm.runInNewContext(compiled, { ...globals, module: state, exports: state.exports, require: (name) => {
    assert.ok(Object.hasOwn(modules, name), `unexpected import ${name} in ${file}`);
    return modules[name];
  } });
  return state.exports;
}

function find(node, predicate) {
  if (Array.isArray(node)) return node.map((child) => find(child, predicate)).find(Boolean);
  if (!node || typeof node !== 'object') return undefined;
  if (predicate(node)) return node;
  return find(node.props?.children, predicate);
}

function collect(node, predicate, found = []) {
  if (Array.isArray(node)) { node.forEach((child) => collect(child, predicate, found)); return found; }
  if (!node || typeof node !== 'object') return found;
  if (predicate(node)) found.push(node);
  collect(node.props?.children, predicate, found);
  return found;
}

function stepper(value, min, max, changed) {
  const quantity = load('src/components/ui/quantity.ts');
  const { QtyStepper } = load('src/components/ui/QtyStepper.tsx', {
    ...common,
    './Text': { Text: 'Text' },
    './Touchable': { Touchable: 'Touchable' },
    './quantity': quantity,
    './Motion': { enter: () => null },
  });
  return QtyStepper({ value, min, max, onChange: changed });
}

test('QtyStepper keeps exact add, subtract, typed parsing, min and 9.999 clamp', () => {
  const changes = [];
  const tree = stepper(5, 2, 9, (value) => changes.push(value));
  find(tree, (node) => node.props?.accessibilityLabel === 'Kurangi jumlah').props.onPress();
  find(tree, (node) => node.props?.accessibilityLabel === 'Tambah jumlah').props.onPress();
  const input = find(tree, (node) => node.type === 'TextInput');
  input.props.onChangeText('1.250');
  input.props.onChangeText('3 cups');
  input.props.onChangeText('');
  assert.deepEqual(changes, [4, 6, 9, 3, 2]);

  const cap = stepper(9998, 0, 9999, (value) => changes.push(value));
  find(cap, (node) => node.props?.accessibilityLabel === 'Tambah jumlah').props.onPress();
  find(cap, (node) => node.type === 'TextInput').props.onChangeText('10.000');
  assert.deepEqual(changes.slice(-2), [9999, 9999]);
  assert.equal(find(stepper(9999, 0, 9999, () => {}),
    (node) => node.props?.accessibilityLabel === 'Tambah jumlah').props.disabled, true);
  assert.equal(find(stepper(2, 2, 9, () => {}),
    (node) => node.props?.accessibilityLabel === 'Kurangi jumlah').props.disabled, true);
  for (const label of ['Tambah jumlah', 'Kurangi jumlah']) {
    const control = find(tree, (node) => node.props?.accessibilityLabel === label);
    assert.ok(control.props.style[0].width >= 36 && control.props.style[0].height >= 36);
  }
});

test('RefillCard keeps official status, integer rupiah and colors only its status/product presentation', () => {
  const { RefillCard, formatRupiah } = load('src/components/refill/RefillCard.tsx', {
    ...common,
    '@/components/ui/Badge': { StatusBadge: 'StatusBadge' },
    './RefillCard': {},
  });
  const refill = { id: 1, code: 'REF-1', status: 'SUBMITTED', submitted_at: null,
    staff_name: 'Budi', cart_code: 'CB-1', total_requested: 2, location_name: null,
    gps_unavailable: false, out_of_hours: false, total_cost: 12500,
    lines: [{ id: 7, product_name: 'Soul Matcha', qty_requested: 2 }] };
  const card = RefillCard({ refill, showCost: true });
  assert.equal(formatRupiah(12500), 'Rp 12.500');
  assert.equal(find(card, (node) => node.type === 'StatusBadge').props.status, 'SUBMITTED');
  assert.equal(card.props.style[1].borderLeftColor, tokens.statusColor.SUBMITTED.fg);
  assert.equal(find(card, (node) => node.props?.style?.[1]?.backgroundColor === '#E2F2DC').props.children.props.children.join(''), 'Soul Matcha · diminta 2');
  assert.ok(JSON.stringify(card).includes('Rp 12.500'));
  assert.ok(!JSON.stringify(RefillCard({ refill, showCost: false })).includes('Rp 12.500'));
});

test('ProductPickerCard keeps full name, qty callbacks, CMS image source and product fallback color', () => {
  const changes = [];
  const { ProductPickerCard } = load('src/components/refill/ProductPickerCard.tsx', {
    ...common,
    '@/domain/productImages': { productImageSource: (item) => item.image_url ? { uri: item.image_url } : null },
  });
  const product = { name: 'Butterscotch SeaSalt Cream', unit: 'cups' };
  const card = ProductPickerCard({ product, value: 1, max: 2, onChange: (value) => changes.push(value) });
  const name = find(card, (node) => node.props?.accessibilityLabel === product.name);
  assert.equal(name.props.numberOfLines, 2);
  assert.equal(name.props.ellipsizeMode, 'tail');
  find(card, (node) => node.props?.accessibilityLabel === `Kurangi ${product.name}`).props.onPress();
  find(card, (node) => node.props?.accessibilityLabel === `Tambah ${product.name}` && node.props?.style?.[0]?.width === 40).props.onPress();
  assert.deepEqual(changes, [0, 2]);
  assert.ok(JSON.stringify(card).includes(tokens.productColor[product.name].bg));
  const url = 'https://cms.example.test/products/new.jpg';
  const withPhoto = ProductPickerCard({ product: { ...product, image_url: url }, value: 0,
    max: 2, onChange: () => {} });
  assert.equal(find(withPhoto, (node) => node.type === 'Image').props.source.uri, url);
  const capped = ProductPickerCard({ product, value: 2, max: 2, onChange: () => {} });
  assert.equal(find(capped, (node) => node.props?.accessibilityLabel === `Tambah ${product.name}`).props.disabled, true);
  const cupChanges = [];
  const ninetyNine = ProductPickerCard({ product, value: 99, max: 100,
    onChange: (value) => cupChanges.push(value) });
  find(ninetyNine, (node) => node.props?.accessibilityLabel === `Tambah ${product.name}` &&
    node.props?.style?.[0]?.width === 40).props.onPress();
  const hundred = ProductPickerCard({ product, value: 100, max: 100,
    onChange: (value) => cupChanges.push(value) });
  assert.equal(find(hundred, (node) => node.props?.accessibilityLabel === `Tambah ${product.name}`).props.disabled, true);
  find(hundred, (node) => node.props?.accessibilityLabel === `Tambah ${product.name}` &&
    node.props?.style?.[0]?.width === 40).props.onPress();
  const zero = ProductPickerCard({ product, value: 0, max: 100,
    onChange: (value) => cupChanges.push(value) });
  assert.equal(find(zero, (node) => node.props?.accessibilityLabel === `Kurangi ${product.name}`), undefined);
  assert.deepEqual(cupChanges, [100]);
  assert.equal(Number.isInteger(cupChanges[0]), true);
});

test('AnimatedNumber stops its JS roll when Reduce Motion turns on', async () => {
  let refIndex = 0;
  const cancelled = [];
  const displayed = [];
  const { AnimatedNumber } = load('src/components/ui/AnimatedNumber.tsx', {
    ...common,
    react: { ...react,
      useEffect: (effect) => { effect(); },
      useRef: (initial) => ({ current: refIndex++ === 0 ? 1 : initial }),
      useState: (initial) => [initial, (value) => displayed.push(value)],
    },
    'react-native': { AccessibilityInfo: {
      addEventListener: () => ({ remove() {} }),
      isReduceMotionEnabled: async () => true,
    } },
    './Text': { Text: 'Text' },
  }, {
    requestAnimationFrame: () => 42,
    cancelAnimationFrame: (id) => cancelled.push(id),
  });
  const number = AnimatedNumber({ value: 7 });
  assert.equal(number.props.accessibilityLabel, '7');
  await Promise.resolve();
  assert.deepEqual(cancelled, [42]);
  assert.deepEqual(displayed, [7]);
});

test('RefillTimeline keeps forward and terminal status order', () => {
  const statuses = ['SUBMITTED', 'APPROVED', 'PREPARING', 'READY_TO_PICK', 'PICKED_UP', 'DELIVERED', 'CLOSED', 'REJECTED', 'CANCELLED', 'EXPIRED'];
  const { RefillTimeline } = load('src/components/refill/RefillTimeline.tsx', {
    ...common,
    '@/components/ui/Badge': { statusLabel: Object.fromEntries(statuses.map((status) => [status, status])) },
    './RefillCard': { formatTime: () => '11:00' },
  });
  const refill = { status: 'PREPARING', status_history: [], staff_name: 'Budi', finance_name: 'Rina',
    barista_name: 'Dapur', rider_name: null, submitted_at: null, decided_at: null,
    prepared_at: null, picked_up_at: null, delivered_at: null };
  const labels = (value) => collect(RefillTimeline({ refill: value }),
    (node) => node.type === 'Text' && statuses.includes(node.props.children)).map((node) => node.props.children);
  assert.deepEqual(labels(refill), ['SUBMITTED', 'APPROVED', 'PREPARING']);
  assert.deepEqual(labels({ ...refill, status: 'REJECTED' }), ['SUBMITTED', 'REJECTED']);
  assert.deepEqual(labels({ ...refill, status: 'EXPIRED', status_history: [
    { to_status: 'SUBMITTED', actor_role: 'STAFF', created_at: null },
    { to_status: 'APPROVED', actor_role: 'FINANCE', created_at: null },
    { to_status: 'EXPIRED', actor_role: 'SYSTEM', created_at: null },
  ] }), ['SUBMITTED', 'APPROVED', 'EXPIRED']);
});

test('NotificationBell preserves unread count and inbox target; NewsSlider preserves both news targets', () => {
  const routes = [];
  const router = { push: (path) => routes.push(path) };
  const { NotificationBell } = load('src/components/ui/NotificationBell.tsx', {
    ...common,
    'expo-router': { useRouter: () => router },
    './Button': { IconButton: 'IconButton' },
    './Badge': { CountBadge: 'CountBadge' },
    '@/features/refill/queries': { useNotifications: () => ({ data: [{}, {}, {}] }) },
  });
  const bell = NotificationBell();
  find(bell, (node) => node.type === 'IconButton').props.onPress();
  assert.equal(find(bell, (node) => node.type === 'CountBadge').props.count, 3);

  class Value { interpolate() { return 1; } }
  const post = { id: 17, title: 'Kabar baru', excerpt: 'Info', cover_url: null,
    accent_color: null, kicker: null, tags: [], is_read: false };
  const sliderModules = {
    ...common,
    'react-native': { ...native, AccessibilityInfo: {},
      Pressable: 'Pressable', useWindowDimensions: () => ({ width: 390 }),
      Animated: { Value, FlatList: 'FlatList', event: () => () => {} } },
    'expo-router': { useRouter: () => router },
    '@/features/news/queries': { useNewsFeed: (highlighted) => {
      assert.equal(highlighted, true); return { data: [post] };
    } },
  };
  const { NewsSlider } = load('src/components/news/NewsSlider.tsx', sliderModules);
  const slider = NewsSlider();
  find(slider, (node) => node.props?.accessibilityLabel === 'Lihat semua artikel').props.onPress();
  const flatList = find(slider, (node) => node.type === 'FlatList');
  const item = flatList.props.renderItem({ item: post, index: 0 });
  const article = find(item, (node) => typeof node.type === 'function').type(find(item, (node) => typeof node.type === 'function').props);
  find(article, (node) => node.props?.accessibilityLabel === post.title).props.onPress();
  assert.deepEqual(routes, ['/notifications', '/news', '/news/17']);
  const { NewsSlider: reducedSlider } = load('src/components/news/NewsSlider.tsx', {
    ...sliderModules,
    react: { ...react, useState: (initial) => [typeof initial === 'boolean' ? true : initial, () => {}] },
  });
  const reducedList = find(reducedSlider(), (node) => node.type === 'FlatList');
  const reducedItem = reducedList.props.renderItem({ item: post, index: 0 });
  assert.equal(Object.hasOwn(reducedItem.props.style, 'transform'), false);
  assert.equal(Object.hasOwn(reducedItem.props.style, 'opacity'), false);
  assert.match(source('src/components/ui/NotificationBell.tsx'), /spring\.bouncy/);
});

test('NewsSlider follows the system Reduce Motion query and change event', async () => {
  let reduced = false;
  let motionListener;
  class Value { interpolate() { return 1; } }
  const post = { id: 2, title: 'Info', excerpt: null, cover_url: null,
    accent_color: null, kicker: null, tags: [], is_read: true };
  const { NewsSlider } = load('src/components/news/NewsSlider.tsx', {
    ...common,
    react: { ...react, useEffect: (effect) => { effect(); },
      useState: (initial) => typeof initial === 'boolean' ? [reduced, (next) => { reduced = next; }] : [initial, () => {}] },
    'react-native': { ...native, Pressable: 'Pressable', useWindowDimensions: () => ({ width: 390 }),
      Animated: { Value, FlatList: 'FlatList', event: () => () => {} },
      AccessibilityInfo: {
        addEventListener: (name, listener) => { assert.equal(name, 'reduceMotionChanged'); motionListener = listener; return { remove() {} }; },
        isReduceMotionEnabled: async () => true,
      } },
    'expo-router': { useRouter: () => ({ push() {} }) },
    '@/features/news/queries': { useNewsFeed: () => ({ data: [post] }) },
  });
  NewsSlider();
  await Promise.resolve();
  assert.equal(reduced, true);
  const itemStyle = () => find(NewsSlider(), (node) => node.type === 'FlatList')
    .props.renderItem({ item: post, index: 0 }).props.style;
  assert.equal(Object.hasOwn(itemStyle(), 'transform'), false);
  motionListener(false);
  assert.equal(Object.hasOwn(itemStyle(), 'transform'), true);
});

test('NotificationBell count pop uses system-aware timing and spring tokens', () => {
  const configs = [];
  const { NotificationBell } = load('src/components/ui/NotificationBell.tsx', {
    ...common,
    react: { ...react, useRef: () => ({ current: 0 }), useEffect: (effect) => { effect(); } },
    'react-native-reanimated': { ...reanimated,
      withTiming: (value, config) => { configs.push(config); return value; },
      withSpring: (value, config) => { configs.push(config); return value; },
    },
    'expo-router': { useRouter: () => ({ push() {} }) },
    './Button': { IconButton: 'IconButton' },
    './Badge': { CountBadge: 'CountBadge' },
    '@/features/refill/queries': { useNotifications: () => ({ data: [{}] }) },
  });
  const bell = NotificationBell();
  assert.equal(find(bell, (node) => node.type === 'CountBadge').props.count, 1);
  assert.deepEqual(configs.map((config) => config.reduceMotion), ['system', 'system']);
});
