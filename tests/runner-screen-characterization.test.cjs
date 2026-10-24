const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const root = join(__dirname, '..');
const plain = (value) => JSON.parse(JSON.stringify(value));
const jsx = (type, props) => ({ type, props: props ?? {} });
const line = (id, qty = 3) => ({ id, product_name: 'Kopi', qty_prepared: qty, is_operational: true });
const refill = (overrides = {}) => ({
  id: 17, code: 'REF-17', staff_name: 'Rider', cart_code: 'CB-3', location_name: 'Taman',
  total_requested: 3, status: 'PICKED_UP', lines: [line(4)],
  can: { claim: true, deliver: true }, ...overrides,
});

function harness(options = {}) {
  const events = [];
  const alerts = [];
  const effects = [];
  const states = new Map();
  const refs = new Map();
  const theme = new Proxy({}, { get: () => '#000' });
  const dims = new Proxy({}, { get: () => 8 });
  let current;
  let index = 0;
  let reportFails = false;
  let deliverFails = !!options.deliverFails;
  let photoId = 30;
  class ApiError extends Error {
    constructor(message, isConflict = false) { super(message); this.isConflict = isConflict; }
  }
  const ready = { data: options.ready ?? [refill()], isLoading: false, isError: false,
    isRefetching: false, refetch: async () => { events.push(['refetch']); } };
  const active = { ...ready, data: options.active ?? [refill()] };
  const claim = { isPending: !!options.claimPending, mutateAsync: async (input) => {
    events.push(['claim', plain(input)]);
    if (options.claimConflict) throw new ApiError('Konflik', true);
  } };
  const upload = { isPending: !!options.uploadPending, mutateAsync: async (input) => {
    events.push(['upload', plain(input)]); return { id: photoId++ };
  } };
  const deliver = { isPending: !!options.deliverPending, mutateAsync: async (input) => {
    events.push(['deliver', plain(input)]);
    if (deliverFails) { deliverFails = false; throw new ApiError('timeout'); }
    return { ledgerPending: false };
  } };
  const report = { isPending: !!options.reportPending, mutateAsync: async (input) => {
    events.push(['incident', plain(input)]);
    if (reportFails) { reportFails = false; throw new ApiError('timeout'); }
  } };
  const react = {
    useEffect: (effect) => effects.push(effect),
    useMemo: (calculate) => calculate(),
    useRef: (value) => {
      const slot = index++;
      if (!refs.has(current)) refs.set(current, []);
      return refs.get(current)[slot] ?? (refs.get(current)[slot] = { current: value });
    },
    useState: (initial) => {
      const owner = current;
      const slot = index++;
      if (!states.has(owner)) states.set(owner, []);
      const values = states.get(owner);
      if (!(slot in values)) values[slot] = typeof initial === 'function' ? initial() : initial;
      return [values[slot], (value) => {
        values[slot] = typeof value === 'function' ? value(values[slot]) : value;
      }];
    },
  };
  const modules = {
    react, 'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
    'react-native': { Alert: { alert: (...args) => alerts.push(args) }, StyleSheet: { create: (s) => s },
      View: 'View', Image: 'Image', FlatList: 'FlatList', Modal: 'Modal', ScrollView: 'ScrollView' },
    '@expo/vector-icons/MaterialCommunityIcons': 'Icon',
    'expo-image-picker': {
      requestCameraPermissionsAsync: async () => ({ granted: true }),
      launchCameraAsync: async () => ({ canceled: false, assets: [{ uri: 'camera://fresh' }] }),
    },
    'expo-location': {
      Accuracy: { Balanced: 3 }, requestForegroundPermissionsAsync: async () => ({ granted: !options.gpsDenied }),
      getCurrentPositionAsync: async () => ({ coords: { latitude: -6.2, longitude: 106.8 } }),
    },
    '@/features/refill/queries': {
      useRefills: (status) => { events.push(['list', status]); return status === 'READY_TO_PICK' ? ready : active; },
      useClaimRefill: () => claim, useUploadHandoverPhoto: () => upload, useDeliverRefill: () => deliver,
    },
    '@/features/incidents/queries': { useReportIncident: () => report },
    '@/features/realtime/RealtimeProvider': { useRealtimeState: () => ({ state: 'connected' }) },
    '@/lib/api': { ApiError },
    '@/theme': { brand: theme, feedback: theme, neutral: theme, radius: dims, semantic: theme, space: dims },
    '@/components/refill/RefillCard': { RefillCard: 'RefillCard' },
  };
  for (const name of ['Screen', 'Text', 'Button', 'ConnectionBanner', 'EmptyState', 'Skeleton',
    'Card', 'Input', 'QtyStepper', 'Badge', 'Banner', 'ProductThumbnail', 'Touchable', 'SignaturePad']) {
    modules[`@/components/ui/${name}`] = new Proxy({}, { get: (_target, prop) => String(prop) });
  }
  const cache = new Map();
  function load(file) {
    if (cache.has(file)) return cache.get(file);
    const source = readFileSync(join(root, file), 'utf8');
    const code = ts.transpileModule(source, { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
      jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
    } }).outputText;
    const module = { exports: {} };
    cache.set(file, module.exports);
    vm.runInNewContext(code, {
      module, exports: module.exports, setTimeout, clearTimeout,
      require: (name) => {
        if (name.startsWith('@/features/refill/useRunner')) {
          return load(`src/features/refill/${name.slice('@/features/refill/'.length)}.ts`);
        }
        assert.ok(Object.hasOwn(modules, name), `unexpected import ${name} in ${file}`);
        return modules[name];
      },
    });
    return module.exports;
  }
  function render(component, props = {}) {
    current = component;
    index = 0;
    return component(props);
  }
  function nodes(tree) {
    const found = [];
    function visit(value) {
      if (Array.isArray(value)) return value.forEach(visit);
      if (!value || typeof value !== 'object' || !('type' in value)) return;
      if (typeof value.type === 'function') return visit(render(value.type, value.props));
      found.push(value);
      visit(value.props.children);
    }
    visit(tree);
    return found;
  }
  const button = (tree, label) => nodes(tree).find((node) => node.type === 'Button' && node.props.label === label);
  return { load, render, nodes, button, events, alerts, effects, ready, active, claim, upload,
    report, failReport: () => { reportFails = true; } };
}

const flush = () => new Promise(setImmediate);

test('ready list claims exact id, keeps pending/permission disabled, and refetches after a losing 409', async () => {
  const app = harness({ claimConflict: true });
  const screen = app.load('app/(app)/rider/available.tsx').default;
  const tree = app.render(screen);
  const list = app.nodes(tree).find((node) => node.type === 'FlatList');
  const card = list.props.renderItem({ item: refill(), index: 0 });
  assert.equal(app.button(card, 'Ambil').props.disabled, false);
  assert.equal(app.button(card, 'Ambil').props.loading, false);
  app.button(card, 'Ambil').props.onPress();
  await flush();
  assert.deepEqual(app.events.map((event) => event[0]), ['list', 'claim', 'refetch']);
  assert.deepEqual(app.events[1], ['claim', { id: 17 }]);
  assert.equal(app.alerts[0][0], 'Sudah diambil runner lain.');
  assert.equal(app.nodes(card).find((node) => node.type === 'RefillCard').props.showCost, false);
  for (const variant of [harness({ claimPending: true }), harness({ ready: [refill({ can: { claim: false } })] })]) {
    const listTree = variant.render(variant.load('app/(app)/rider/available.tsx').default);
    const row = variant.nodes(listTree).find((node) => node.type === 'FlatList')
      .props.renderItem({ item: variant.ready.data[0], index: 0 });
    assert.equal(variant.button(row, 'Ambil').props.loading, variant.claim.isPending);
    assert.equal(variant.button(row, 'Ambil').props.disabled, !variant.ready.data[0].can.claim);
  }
});

function openSheet(app, action) {
  const screen = app.load('app/(app)/rider/active.tsx').default;
  const initial = app.render(screen);
  const list = app.nodes(initial).find((node) => node.type === 'FlatList');
  const row = list.props.renderItem({ item: app.active.data[0] });
  app.button(row, action).props.onPress();
  const rerendered = app.render(screen);
  const modal = app.nodes(rerendered).find((node) => node.type === 'Modal' && node.props.children);
  assert.ok(modal, `${action} opens modal`);
  return { row, sheet: modal.props.children.type, props: modal.props.children.props };
}

test('delivery uploads photo first, submits exact lines and unavailable GPS, then retries unchanged without reupload', async () => {
  const app = harness({ gpsDenied: true, deliverFails: true });
  const { sheet, props } = openSheet(app, 'Selesaikan Pengiriman');
  let tree = app.render(sheet, props);
  for (const effect of app.effects.splice(0)) effect();
  await flush();
  tree = app.render(sheet, props);
  const stepper = app.nodes(tree).find((node) => node.type === 'QtyStepper');
  assert.equal(stepper.props.value, 3);
  assert.equal(stepper.props.max, 3);
  assert.equal(app.button(tree, 'Konfirmasi Pengiriman').props.disabled, true);
  app.button(tree, 'Ambil Foto').props.onPress();
  await flush();
  tree = app.render(sheet, props);
  assert.equal(app.button(tree, 'Konfirmasi Pengiriman').props.disabled, false);
  app.button(tree, 'Konfirmasi Pengiriman').props.onPress();
  await flush();
  app.button(tree, 'Konfirmasi Pengiriman').props.onPress();
  await flush();
  assert.deepEqual(app.events.filter((event) => ['upload', 'deliver'].includes(event[0])).map((event) => event[0]),
    ['upload', 'deliver', 'deliver']);
  assert.deepEqual(app.events.find((event) => event[0] === 'upload')[1],
    { uri: 'camera://fresh', takenAt: app.events.find((event) => event[0] === 'upload')[1].takenAt });
  assert.deepEqual(app.events.filter((event) => event[0] === 'deliver').map((event) => event[1]), [
    { id: 17, handoverMediaId: 30, lines: [{ line_id: 4, qty_received: 3 }], gps: null },
    { id: 17, handoverMediaId: 30, lines: [{ line_id: 4, qty_received: 3 }], gps: null },
  ]);
  assert.equal(app.alerts.at(-1)[0], 'Pengiriman Selesai');
});

test('delivery optional signature and PIN keep their exact input, proof reset, and disabled conditions', async () => {
  for (const [label, expected] of [
    ['Paraf rider', { method: 'staff_signature', uri: 'signature://png', strokeCount: 3 }],
    ['PIN rider', { method: 'pin_fallback', staffPin: '123456' }],
  ]) {
    const app = harness();
    const { sheet, props } = openSheet(app, 'Selesaikan Pengiriman');
    let tree = app.render(sheet, props);
    app.button(tree, 'Ambil Foto').props.onPress();
    await flush();
    tree = app.render(sheet, props);
    const proofChoice = app.nodes(tree).find((node) => node.type === 'Touchable' && node.props.accessibilityLabel === label);
    proofChoice.props.onPress();
    tree = app.render(sheet, props);
    assert.equal(app.button(tree, 'Konfirmasi Pengiriman').props.disabled, true);
    if (label === 'Paraf rider') {
      app.nodes(tree).find((node) => node.type === 'SignaturePad').props.onSigned(expected);
    } else {
      app.nodes(tree).find((node) => node.type === 'Input').props.onChangeText('12x34567');
    }
    tree = app.render(sheet, props);
    assert.equal(app.button(tree, 'Konfirmasi Pengiriman').props.disabled, false);
    app.button(tree, 'Konfirmasi Pengiriman').props.onPress();
    await flush();
    assert.deepEqual(app.events.find((event) => event[0] === 'deliver')[1].signature, expected);
  }
  const pending = harness({ uploadPending: true });
  const opened = openSheet(pending, 'Selesaikan Pengiriman');
  const tree = pending.render(opened.sheet, opened.props);
  assert.equal(pending.button(tree, 'Konfirmasi Pengiriman').props.disabled, true);
  assert.equal(pending.button(tree, 'Konfirmasi Pengiriman').props.loading, true);
});

test('incident keeps photo/quantity gate, exact body, and legacy product visibility', async () => {
  const app = harness();
  const { sheet, props } = openSheet(app, 'Laporkan Insiden');
  let tree = app.render(sheet, props);
  assert.equal(app.button(tree, 'Kirim Laporan').props.disabled, true);
  app.button(tree, 'Ambil Foto').props.onPress();
  await flush();
  tree = app.render(sheet, props);
  assert.equal(app.button(tree, 'Kirim Laporan').props.disabled, true);
  app.nodes(tree).find((node) => node.type === 'QtyStepper').props.onChange(2);
  tree = app.render(sheet, props);
  assert.equal(app.button(tree, 'Kirim Laporan').props.disabled, false);
  app.nodes(tree).find((node) => node.type === 'Input').props.onChangeText('  Jatuh  ');
  tree = app.render(sheet, props);
  app.button(tree, 'Kirim Laporan').props.onPress();
  await flush();
  const body = app.events.find((event) => event[0] === 'incident')[1];
  assert.deepEqual(body, { refillId: 17, photoUri: 'camera://fresh', takenAt: body.takenAt,
    lines: [{ line_id: 4, qty_damaged: 2 }], note: 'Jatuh' });
  assert.equal(app.alerts.at(-1)[0], 'Laporan Terkirim');
  const legacy = harness({ active: [refill({ lines: [{ ...line(4), is_operational: false }] })] });
  const activeScreen = legacy.load('app/(app)/rider/active.tsx').default;
  const list = legacy.nodes(legacy.render(activeScreen)).find((node) => node.type === 'FlatList');
  const row = list.props.renderItem({ item: legacy.active.data[0] });
  assert.equal(legacy.button(row, 'Laporkan Insiden').props.disabled, true);
  assert.equal(legacy.button(row, 'Selesaikan Pengiriman').props.disabled, true);
});

test('ready list uses realtime invalidation and no polling interval', () => {
  const list = readFileSync(join(root, 'src/features/refill/queries.ts'), 'utf8');
  const realtime = readFileSync(join(root, 'src/features/realtime/RealtimeProvider.tsx'), 'utf8');
  assert.match(list, /invalidateQueries\(\{ queryKey: \['refills'\] \}\)/);
  assert.match(realtime, /invalidateRefillData\(client,/);
  assert.doesNotMatch(list, /refetchInterval\s*:/);
});
