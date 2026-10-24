const assert = require('node:assert/strict');
const { readFileSync, existsSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const root = join(__dirname, '..');
const read = (path) => readFileSync(join(root, path), 'utf8');
const screen = (name) => read(`app/(app)/barista/${name}.tsx`);
const logic = (name) => {
  const path = `src/features/showcase/use${name}Controller.ts`;
  return screen(name.replace(/^./, (c) => c.toLowerCase())) + (existsSync(join(root, path)) ? read(path) : '');
};

function load(path, modules) {
  const code = ts.transpileModule(read(path), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
    jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, require: (name) => {
    const local = name.match(/^@\/features\/showcase\/(use\w+Controller)$/);
    if (local) return load(`src/features/showcase/${local[1]}.ts`, modules);
    assert.ok(Object.hasOwn(modules, name), `unexpected import ${name} in ${path}`);
    return modules[name];
  } }, { filename: path });
  return module.exports;
}

function mount(name, { queries = {}, states = [], selection = {}, realtime = {} } = {}) {
  const calls = [];
  let stateIndex = 0;
  const state = states.slice();
  const useState = (initial) => {
    const index = stateIndex++;
    if (!(index in state)) state[index] = typeof initial === 'function' ? initial() : initial;
    return [state[index], (next) => {
      state[index] = typeof next === 'function' ? next(state[index]) : next;
      calls.push(['state', index, state[index]]);
    }];
  };
  const theme = new Proxy({}, { get: () => 8 });
  const marker = (name) => name;
  const modules = {
    react: { useState, useMemo: (fn) => fn(), useEffect: (fn) => { calls.push(['effect']); fn(); } },
    'react/jsx-runtime': { jsx: (type, props) => ({ type, props: props ?? {} }),
      jsxs: (type, props) => ({ type, props: props ?? {} }) },
    'react-native': { View: marker('View'), FlatList: marker('FlatList'),
      SectionList: marker('SectionList'), Alert: { alert: (...args) => calls.push(['alert', ...args]) },
      StyleSheet: { create: (styles) => styles } },
    'expo-router': { useRouter: () => ({ push: (route) => calls.push(['navigate', route]) }) },
    '@expo/vector-icons/MaterialCommunityIcons': { default: marker('Icon') },
    'react-native-reanimated': { View: marker('AnimatedView') },
    '@tanstack/react-query': { useQuery: () => queries.kitchens },
    '@/features/showcase/kitchenSelection': { useKitchenSelection: () => selection },
    '@/features/refill/queries': {
      useRefills: (...args) => { calls.push(['refills', ...args]); return queries.refills; },
      useStartPreparing: () => queries.startPreparing,
      useMarkReady: () => queries.markReady,
      useProducts: () => queries.products,
      useKitchenStock: () => queries.kitchenStock,
      useStaffOnShift: () => queries.roster,
    },
    '@/features/realtime/RealtimeProvider': { useRealtimeState: () => realtime },
    '@/features/riderLocation/queries': { useLocations: () => queries.locations },
    '@/features/showcase/queries': {
      useBrewIntoShowcase: () => queries.brew,
      useCarts: () => queries.carts,
      useShowcaseStaff: () => queries.staff,
      useShowcaseStock: () => queries.stock,
      useHandToCart: () => queries.handover,
      useHandoverHistory: () => queries.history,
      useCartAllowance: () => queries.allowance,
      useCreateAllocation: () => queries.allocation,
    },
    '@/features/showcase/quantity': { MAX_PRODUCTION_QTY: 9999 },
    '@/lib/api': { ApiError: class ApiError extends Error {}, request: async () => [] },
    '@/theme': { brand: theme, neutral: theme, radius: theme, semantic: theme,
      space: theme, pressScale: theme },
    '@/components/ui/Motion': { enter: () => ({}) },
  };
  for (const component of ['Screen', 'Text', 'Card', 'Button', 'Banner', 'Input',
    'QtyStepper', 'Badge', 'ConnectionBanner', 'EmptyState', 'Skeleton',
    'ProductThumbnail', 'Touchable', 'Section', 'AnimatedNumber']) {
    modules[`@/components/ui/${component}`] = new Proxy({}, { get: (_target, property) => String(property) });
  }
  modules['@/components/refill/RefillCard'] = { RefillCard: 'RefillCard' };
  const tree = load(`app/(app)/barista/${name}.tsx`, modules).default();
  const nodes = [];
  function visit(value) {
    if (Array.isArray(value)) return value.forEach(visit);
    if (!value || typeof value !== 'object' || !('type' in value)) return;
    if (typeof value.type === 'function') return visit(value.type(value.props));
    nodes.push(value);
    visit(value.props.children);
  }
  visit(tree);
  const find = (type, label) => nodes.find((node) => node.type === type && node.props.label === label);
  return { tree, nodes, find, calls, state };
}

test('Produksi keeps kitchen selection persistence, menu order and retry controls', async () => {
  const picks = [];
  const query = { data: [{ id: 2, name: 'Dapur A' }], isError: false, refetch: async () => {} };
  const app = mount('index', { queries: { kitchens: query }, selection: {
    kitchenId: 2, loaded: true, load: async () => picks.push('load'),
    select: async (id) => picks.push(id),
  } });
  assert.deepEqual(app.nodes.filter((node) => node.type === 'Button').map((node) => node.props.label),
    ['Dapur dipilih', 'Buka Absen Rider', 'Brew', 'Add Stock', 'Alokasi Tambahan',
      'Permintaan Refill', 'Siapkan Pesanan', 'Stok Dapur']);
  await app.find('Button', 'Dapur dipilih').props.onPress();
  assert.deepEqual(picks, ['load', 2]);
});

test('request queue stays realtime and Finance approval alone enables Siapkan', async () => {
  const refills = { data: [
    { id: 1, status: 'SUBMITTED', can: { start_preparing: false } },
    { id: 2, status: 'APPROVED', can: { start_preparing: true } },
    { id: 3, status: 'PREPARING', can: { start_preparing: false } },
  ], isLoading: false, isError: false, isRefetching: false };
  const app = mount('requests', { queries: { refills,
    startPreparing: { isPending: true, mutateAsync: async ({ id }) => app.calls.push(['start', id]) },
  }, realtime: { state: 'connected' } });
  const list = app.nodes.find((node) => node.type === 'SectionList');
  assert.deepEqual(Array.from(list.props.sections, (section) => section.key),
    ['SUBMITTED', 'APPROVED', 'PREPARING']);
  assert.deepEqual(JSON.parse(JSON.stringify(app.calls.find((call) => call[0] === 'refills').slice(1))),
    [['SUBMITTED', 'APPROVED', 'PREPARING'], true]);
  const submitted = list.props.renderItem({ item: refills.data[0], index: 0 });
  const approved = list.props.renderItem({ item: refills.data[1], index: 1 });
  const button = (item) => item.props.children[1];
  assert.equal(button(submitted).props.disabled, true);
  assert.equal(button(approved).props.disabled, false);
  assert.equal(button(approved).props.loading, true);
  await button(approved).props.onPress();
  assert.ok(app.calls.some((call) => call[0] === 'start' && call[1] === 2));
  assert.doesNotMatch(logic('Requests'), /setInterval|refetchInterval/);
});

test('preparing card starts at approved quantity and sends exact ready input with shortfall', async () => {
  const refill = { id: 4, code: 'REF-4', status: 'PREPARING', cart_code: '0018', staff_name: 'Rider',
    lines: [{ id: 10, product_name: 'Kopi', qty_approved: 5, is_operational: true }] };
  const app = mount('preparing', { queries: {
    refills: { data: [refill], isLoading: false, isError: false, isRefetching: false },
    markReady: { isPending: false, mutateAsync: async (input) => app.calls.push(['ready', input]) },
  }, states: [{ 10: 3 }, ' Kurang stok ', null] });
  const list = app.nodes.find((node) => node.type === 'FlatList');
  const card = list.props.renderItem({ item: refill });
  const all = [];
  const walk = (node) => { if (Array.isArray(node)) return node.forEach(walk);
    if (!node || typeof node !== 'object') return;
    if (typeof node.type === 'function') return walk(node.type(node.props));
    all.push(node); walk(node.props?.children); };
  walk(card);
  const stepper = all.find((node) => node.type === 'QtyStepper');
  assert.equal(stepper.props.value, 3);
  assert.equal(stepper.props.max, 5);
  assert.equal(all.find((node) => node.type === 'Input').props.value, ' Kurang stok ');
  await all.find((node) => node.type === 'Button' && node.props.label === 'Siap Diambil').props.onPress();
  assert.deepEqual(JSON.parse(JSON.stringify(app.calls.find((call) => call[0] === 'ready')[1])),
    { id: 4, lines: [{ line_id: 10, qty_prepared: 3 }], shortfallReason: 'Kurang stok' });
});

test('Brew keeps zero guard, 9,999 cap and exact positive lines', async () => {
  const app = mount('brew', { states: [{ 1: 9999, 2: 0 }, null], queries: {
    products: { data: [{ id: 1, is_sellable: true, name: 'Kopi' }] },
    brew: { isPending: false, mutateAsync: async (input) => app.calls.push(['brew', input]) },
  } });
  assert.equal(app.nodes.find((node) => node.type === 'QtyStepper').props.max, 9999);
  assert.equal(app.find('Button', 'Catat Brew').props.disabled, false);
  await app.find('Button', 'Catat Brew').props.onPress();
  assert.deepEqual(JSON.parse(JSON.stringify(app.calls.find((call) => call[0] === 'brew')[1])),
    { lines: [{ product_id: 1, qty: 9999 }] });
});

test('Add Stock keeps roster, stock cap and allowance override semantics', async () => {
  const app = mount('add-stock', { states: [1, 7, { 3: 4 }, '20000', ' Butuh es ', null], queries: {
    carts: { data: [{ id: 1, code: '0018', status: 'active' }] },
    staff: { data: [{ id: 7, name: 'A', assigned_cart_id: null }] },
    products: { data: [{ id: 3, name: 'Kopi', sort_order: 1 }] },
    stock: { data: [{ product_id: 3, on_hand: 5 }] },
    allowance: { data: { amount_minor: 20000 } }, history: { data: [] },
    handover: { isPending: false, mutateAsync: async (input) => {
      app.calls.push(['handover', input]); return { cart_code: '0018', staff_name: 'A' };
    } },
  } });
  assert.equal(app.nodes.find((node) => node.type === 'QtyStepper').props.max, 5);
  assert.equal(app.find('Button', 'Kirim ke Coffee Bike').props.disabled, false);
  await app.find('Button', 'Kirim ke Coffee Bike').props.onPress();
  await new Promise(setImmediate);
  assert.deepEqual(JSON.parse(JSON.stringify(app.calls.find((call) => call[0] === 'handover')[1])),
    { cartId: 1, staffId: 7, lines: [{ product_id: 3, qty: 4 }], note: 'Butuh es' });
  assert.ok(app.calls.some((call) => call[0] === 'alert' && call[1] === 'Stock terkirim'));
});

test('Allocation uses roster location, stock ceiling and correction reason', async () => {
  const app = mount('allocations', { states: [7, null, { 3: 4 }, ' Sudah isi sebelumnya ', null], queries: {
    roster: { data: [{ staff_id: 7, cart_id: 1, cart_code: '0018', staff_name: 'A',
      location_id: 9, has_allocation: true }] },
    products: { data: [{ id: 3, name: 'Kopi', is_sellable: true }] },
    kitchenStock: { data: [{ product_id: 3, on_hand: 5 }] }, locations: { data: [] },
    allocation: { isPending: false, mutateAsync: async (input) => app.calls.push(['allocation', input]) },
  } });
  assert.equal(app.nodes.find((node) => node.type === 'QtyStepper').props.max, 5);
  assert.equal(app.find('Button', 'Catat Alokasi').props.disabled, false);
  await app.find('Button', 'Catat Alokasi').props.onPress();
  const input = JSON.parse(JSON.stringify(app.calls.find((call) => call[0] === 'allocation')[1]));
  assert.match(input.operatingDate, /^\d{4}-\d{2}-\d{2}$/);
  delete input.operatingDate;
  assert.deepEqual(input, { cartId: 1, staffId: 7, locationId: 9,
    lines: [{ product_id: 3, qty_issued: 4 }], correctionReason: 'Sudah isi sebelumnya' });
});

test('kitchen mutation hooks retain exact method, path, body and saved operation slots', () => {
  const source = read('src/features/showcase/queries.ts');
  for (const [slot, path] of [['brew', 'showcase/brew'], ['hand-to-cart', 'showcase/hand-to-cart'],
    ['allocation', 'allocations']]) {
    assert.match(source, new RegExp(`kitchenOperationKey\\('${slot}', body\\)`));
    assert.match(source, new RegExp(`request<[^>]+>\\('/${path}'`));
  }
  assert.match(source, /method: 'POST',\s*idempotencyKey: operation\.key/);
  assert.match(source, /const body = \{ lines: input\.lines\.filter\(\(line\) => line\.qty > 0\) \}/);
  assert.match(source, /cart_id: input\.cartId, staff_id: input\.staffId/);
  assert.match(source, /operating_date: input\.operatingDate/);
  assert.match(source, /void operation\.clear\(\)\.catch/);
});
