const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const root = join(__dirname, '..');
const plain = (value) => JSON.parse(JSON.stringify(value));
const jsx = (type, props) => ({ type, props: props ?? {} });

function load(file, modules) {
  const source = readFileSync(join(root, file), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
    jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } }).outputText;
  const state = { exports: {} };
  vm.runInNewContext(code, { module: state, exports: state.exports, require: (name) => {
    if (name === '@/features/refill/useNewRefillController') {
      return load('src/features/refill/useNewRefillController.ts', modules);
    }
    if (name === '@/features/refill/useRefillDetailController') {
      return load('src/features/refill/useRefillDetailController.ts', modules);
    }
    assert.ok(Object.hasOwn(modules, name), `unexpected import ${name} in ${file}`);
    return modules[name];
  } });
  return state.exports;
}

function nodes(tree) {
  const found = [];
  function visit(value) {
    if (Array.isArray(value)) return value.forEach(visit);
    if (!value || typeof value !== 'object' || !('type' in value)) return;
    if (typeof value.type === 'function') return visit(value.type(value.props));
    found.push(value);
    visit(value.props.children);
  }
  visit(tree);
  return found;
}

const find = (tree, type, label) => nodes(tree).find((node) => node.type === type && node.props.label === label);
const flush = () => new Promise(setImmediate);

function setupNew({ role = 'STAFF', cartId = 3, attendance = { staff_window_open: true, has_clocked_in: true },
  qty = { 4: 2 }, photo = { uri: 'photo://fresh', takenAt: '2026-10-24T03:00:00Z' },
  gps = null, uploadPending = false, submitPending = false, failOnce = false } = {}) {
  const events = [];
  const submitted = [];
  const states = [qty, photo, null, gps, gps ? 'granted' : 'unavailable', null, null, ' Butuh es '];
  const updates = [];
  let stateIndex = 0;
  let attempts = 0;
  let releaseUpload;
  const uploadHeld = new Promise((resolve) => { releaseUpload = resolve; });
  const user = { role, cartId, cartCode: 'CB-3' };
  const color = new Proxy({}, { get: () => '#000' });
  const size = new Proxy({}, { get: () => 8 });
  class ApiError extends Error {}
  const react = {
    useCallback: (fn) => fn, useEffect: () => {}, useMemo: (fn) => fn(),
    useRef: (value) => ({ current: value }),
    useState: () => {
      const index = stateIndex++;
      return [states[index], (value) => { updates[index] = value; states[index] = value; }];
    },
  };
  const query = { data: [{ id: 4, name: 'Kopi' }], isLoading: false, isError: false,
    isRefetching: false, refetch: async () => {} };
  const modules = {
    react, 'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-native': { Image: 'Image', View: 'View', StyleSheet: { create: (styles) => styles } },
    'expo-router': { useFocusEffect: () => {}, useRouter: () => ({ back() {}, push() {}, replace: (path) => events.push(['navigate', path]) }) },
    'expo-image-picker': { requestCameraPermissionsAsync: async () => ({ granted: true }),
      launchCameraAsync: async () => ({ canceled: false, assets: [{ uri: 'photo://camera' }] }) },
    'expo-location': { LocationAccuracy: { Balanced: 1 } },
    '@expo/vector-icons/MaterialCommunityIcons': 'Icon',
    'expo-status-bar': { StatusBar: 'StatusBar' },
    'react-native-reanimated': { View: 'AnimatedView' },
    '@/features/auth/store': { useAuth: (select) => select({ session: { user },
      refreshUser: async () => {}, cartRefreshStatus: 'ready', cartRefreshError: null }) },
    '@/features/refill/queries': {
      useProducts: () => query,
      useUploadEvidence: () => ({ isPending: uploadPending, mutateAsync: async (input) => {
        events.push(['upload', plain(input)]);
        await uploadHeld;
        return { id: 12 };
      } }),
      useSubmitRefill: () => ({ isPending: submitPending, mutateAsync: async (input) => {
        events.push(['submit', plain(input)]);
        submitted.push(plain(input));
        if (failOnce && ++attempts === 1) throw new Error('timeout');
        return { id: 17 };
      } }),
    },
    '@/features/showcase/queries': { useAttendanceStatus: (enabled) => {
      events.push(['attendance-enabled', enabled]);
      return { data: attendance, refetch: async () => {} };
    } },
    '@/features/showcase/riderDayGate': {
      DAY_NOT_OPEN_MESSAGE: 'Absen belum dibuka', NO_CART_TODAY_MESSAGE: 'Belum ada Coffee Bike',
      isDayNotOpen: () => false, isNoCartToday: () => false,
      riderDayGate: (value) => !value?.staff_window_open ? 'closed' : !value.has_clocked_in ? 'attendance' : 'ready',
      riderGateMessage: (gate) => gate === 'closed' ? 'Absen belum dibuka' : gate === 'attendance' ? 'Buka Absen dulu' : null,
    },
    '@/lib/api': { ApiError },
    '@/theme': { brand: color, neutral: color, semantic: color, radius: size, space: size, shadow: { card: {} } },
  };
  for (const name of ['Screen', 'Text', 'Button', 'Card', 'Badge', 'Banner', 'EmptyState',
    'Skeleton', 'AnimatedNumber', 'Section', 'Input']) {
    modules[`@/components/ui/${name}`] = new Proxy({}, { get: (_target, prop) => String(prop) });
  }
  modules['@/components/ui/Motion'] = { enter: () => ({}) };
  modules['@/components/refill/ProductPickerCard'] = { ProductPickerCard: 'ProductPickerCard' };
  const screen = load('app/(app)/staff/refill/new.tsx', modules).default;
  return { tree: screen(), events, submitted, updates, releaseUpload };
}

test('new refill preserves camera evidence, exact submit input, upload order and one upload after timeout', async () => {
  const app = setupNew({ failOnce: true });
  const picker = nodes(app.tree).find((node) => node.type === 'ProductPickerCard');
  assert.equal(picker.props.value, 2);
  assert.equal(picker.props.max, 100);
  assert.equal(picker.props.disabled, false);
  const submit = find(app.tree, 'Button', 'Kirim Request');
  assert.equal(submit.props.disabled, false);
  assert.equal(submit.props.loading, false);
  submit.props.onPress();
  submit.props.onPress();
  assert.deepEqual(app.events.filter((event) => event[0] === 'upload').length, 1);
  app.releaseUpload();
  await flush();
  submit.props.onPress();
  await flush();
  assert.deepEqual(app.events.filter((event) => event[0] !== 'attendance-enabled').map((event) => event[0]),
    ['upload', 'submit', 'submit', 'navigate']);
  assert.deepEqual(app.submitted, [
    { cartId: 3, evidenceMediaId: 12, gps: null, lines: [{ product_id: 4, qty_requested: 2 }], note: 'Butuh es' },
    { cartId: 3, evidenceMediaId: 12, gps: null, lines: [{ product_id: 4, qty_requested: 2 }], note: 'Butuh es' },
  ]);
});

test('new refill keeps Absen gate, pending controls, missing photo and zero quantity validation', async () => {
  for (const attendance of [
    { staff_window_open: false, has_clocked_in: false },
    { staff_window_open: true, has_clocked_in: false },
  ]) {
    const app = setupNew({ attendance });
    assert.equal(find(app.tree, 'Button', 'Kirim Request').props.disabled, true);
    assert.equal(nodes(app.tree).find((node) => node.type === 'ProductPickerCard').props.disabled, true);
    find(app.tree, 'Button', 'Kirim Request').props.onPress();
    await flush();
    assert.equal(app.events.some((event) => event[0] === 'upload'), false);
    assert.match(app.updates[6], /Absen/);
    if (attendance.staff_window_open) assert.ok(find(app.tree, 'Button', 'Buka Absen'));
  }
  for (const pending of [{ uploadPending: true }, { submitPending: true }]) {
    const app = setupNew(pending);
    assert.equal(find(app.tree, 'Button', 'Kirim Request').props.loading, true);
    assert.equal(find(app.tree, 'Button', 'Kirim Request').props.disabled, true);
    assert.equal(nodes(app.tree).find((node) => node.type === 'ProductPickerCard').props.disabled, true);
  }
  const empty = setupNew({ qty: {} });
  find(empty.tree, 'Button', 'Kirim Request').props.onPress();
  await flush();
  assert.equal(empty.updates[6], 'Pilih minimal satu produk');
  const missingPhoto = setupNew({ photo: null });
  find(missingPhoto.tree, 'Button', 'Kirim Request').props.onPress();
  await flush();
  assert.equal(missingPhoto.updates[6], 'Foto bukti wajib diambil langsung dari kamera');
});

test('new refill captures evidence from the camera and keeps the 100 cup line limit', async () => {
  const app = setupNew({ photo: null, qty: { 4: 99 } });
  const picker = nodes(app.tree).find((node) => node.type === 'ProductPickerCard');
  assert.equal(picker.props.max, 100);
  find(app.tree, 'Button', 'Ambil Foto').props.onPress();
  await flush();
  assert.equal(app.updates[1].uri, 'photo://camera');
  assert.match(app.updates[1].takenAt, /^\d{4}-\d{2}-\d{2}T/);
});

function setupDetail({ role = 'STAFF', status = 'SUBMITTED', canCancel = true, pending = false,
  attendance = { staff_window_open: true, has_clocked_in: true } } = {}) {
  const sent = [];
  const alerts = [];
  const refill = { id: 17, code: 'REF-17', cart_code: 'CB-3', staff_name: 'Rider',
    status, can: { cancel: canCancel }, lines: [], total_requested: 2 };
  const color = new Proxy({}, { get: () => '#000' });
  const react = { useCallback: (fn) => fn, useState: () => [null, () => {}] };
  const modules = {
    react, 'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-native': { Image: 'Image', View: 'View', StyleSheet: { create: (styles) => styles },
      Alert: { alert: (...args) => alerts.push(args) } },
    'expo-router': { useLocalSearchParams: () => ({ id: '17' }),
      useRouter: () => ({ back() {}, push() {} }) },
    '@expo/vector-icons/MaterialCommunityIcons': 'Icon',
    'react-native-reanimated': { View: 'AnimatedView' },
    '@/features/auth/store': { useAuth: (select) => select({ session: { user: { role } } }) },
    '@/features/refill/queries': { useRefill: () => ({ data: refill, isRefetching: false, refetch: async () => {} }),
      useCancelRefill: () => ({ isPending: pending, mutateAsync: async (input) => sent.push(plain(input)) }) },
    '@/features/showcase/queries': { useAttendanceStatus: () => ({ data: attendance, refetch: async () => {} }) },
    '@/features/showcase/riderDayGate': {
      DAY_NOT_OPEN_MESSAGE: 'Absen belum dibuka', isDayNotOpen: () => false,
      riderDayGate: (value) => !value.staff_window_open ? 'closed' : !value.has_clocked_in ? 'attendance' : 'ready',
      riderGateMessage: (gate) => gate === 'ready' ? null : 'Absen dulu',
    },
    '@/lib/api': { ApiError: class ApiError extends Error {} },
    '@/theme': { brand: color, feedback: color, neutral: color, radius: color, semantic: color, space: color },
    '@/components/refill/RefillTimeline': { RefillTimeline: 'RefillTimeline' },
    '@/components/refill/RefillCard': { formatRupiah: (n) => `Rp ${n}` },
  };
  for (const name of ['Screen', 'Text', 'Button', 'Card', 'Badge', 'EmptyState',
    'Banner', 'Skeleton', 'ProductThumbnail', 'Section']) {
    modules[`@/components/ui/${name}`] = new Proxy({}, { get: (_target, prop) => String(prop) });
  }
  modules['@/components/ui/Motion'] = { enter: () => ({}) };
  const screen = load('app/(app)/staff/requests/[id].tsx', modules).default;
  return { tree: screen(), sent, alerts };
}

test('refill detail keeps official status badge and server-controlled cancel for owner and SUBMITTED only', async () => {
  const active = setupDetail();
  assert.equal(nodes(active.tree).find((node) => node.type === 'StatusBadge').props.status, 'SUBMITTED');
  const cancel = find(active.tree, 'Button', 'Batalkan Permintaan');
  assert.equal(cancel.props.disabled, false);
  assert.equal(cancel.props.loading, false);
  cancel.props.onPress();
  assert.deepEqual(active.alerts[0].slice(0, 2),
    ['Batalkan permintaan?', 'Permintaan yang dibatalkan tidak dapat diproses kembali.']);
  active.alerts[0][2][1].onPress();
  await flush();
  assert.deepEqual(active.sent, [{ id: 17 }]);
  for (const options of [
    { status: 'APPROVED', canCancel: false }, { status: 'EXPIRED', canCancel: false },
    { role: 'FINANCE', canCancel: false },
  ]) {
    const app = setupDetail(options);
    assert.equal(find(app.tree, 'Button', 'Batalkan Permintaan'), undefined);
    assert.equal(nodes(app.tree).find((node) => node.type === 'StatusBadge').props.status, options.status ?? 'SUBMITTED');
  }
  const pending = setupDetail({ pending: true });
  assert.equal(find(pending.tree, 'Button', 'Batalkan Permintaan').props.loading, true);
  assert.equal(find(pending.tree, 'Button', 'Batalkan Permintaan').props.disabled, true);
  const gated = setupDetail({ attendance: { staff_window_open: false, has_clocked_in: false } });
  assert.equal(find(gated.tree, 'Button', 'Batalkan Permintaan').props.disabled, true);
});
