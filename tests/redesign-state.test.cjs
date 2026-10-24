const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const root = join(__dirname, '..');
const jsx = (type, props) => ({ type, props: props ?? {} });
const react = { useMemo: (fn) => fn(), useRef: (initial) => ({ current: initial }), useState: (initial) =>
  [typeof initial === 'function' ? initial() : initial, () => {}] };
const theme = { neutral: { 50: '#fff' }, brand: { 600: '#123', 700: '#123' },
  radius: { sm: 4 }, semantic: { textMuted: '#666' }, space: { sm: 8, md: 12, lg: 16 } };
const refill = { id: 9, code: 'REF-9', cart_code: '0009', staff_name: 'Rider',
  status: 'SUBMITTED', can: { claim: true },
  lines: [{ id: 3, product_name: 'Kopi', qty_requested: 3, qty_approved: 3,
    unit_cost: 10000, is_operational: true }] };

function loadModule(file, modules) {
  const code = ts.transpileModule(readFileSync(join(root, file), 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
    jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } }).outputText;
  const state = { exports: {} };
  vm.runInNewContext(code, { module: state, exports: state.exports, __DEV__: false, require: (name) => {
    if (name === '@/features/refill/useNewRefillController' || name.startsWith('@/features/refill/useRunner')
      || name === '@/features/refill/approvalController') {
      return loadModule(`src/features/refill/${name.slice('@/features/refill/'.length)}.ts`, modules);
    }
    if (name === '@/features/showcase/usePreparingController') {
      return loadModule('src/features/showcase/usePreparingController.ts', modules);
    }
    if (name === '@/features/showcase/useAbsenController' || name === '@/features/kitchenReject/useKitchenRejectController') {
      return loadModule(`src/features/${name.slice('@/features/'.length)}.ts`, modules);
    }
    if (name === '@/features/auth/useLoginController') {
      return loadModule('src/features/auth/useLoginController.ts', modules);
    }
    assert.ok(Object.hasOwn(modules, name), `unexpected import: ${name}`);
    return modules[name];
  } });
  return state.exports;
}

function loadScreen(file, modules) { return loadModule(file, modules).default; }

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

function common() {
  return {
    react, 'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-native': { FlatList: 'FlatList', View: 'View', StyleSheet: { create: (styles) => styles },
      Alert: { alert: () => {} } },
    'expo-router': { useRouter: () => ({ back() {} }) },
    '@/components/ui/Screen': { Screen: 'Screen' },
    '@/components/ui/Text': { Text: 'Text' },
    '@/components/ui/Button': { Button: 'Button', IconButton: 'IconButton' },
    '@/components/ui/Card': { Card: 'Card' },
    '@/components/ui/Input': { Input: 'Input' },
    '@/components/ui/QtyStepper': { QtyStepper: 'QtyStepper' },
    '@/components/ui/EmptyState': { EmptyState: 'EmptyState' },
    '@/components/ui/Banner': { Banner: 'Banner' },
    '@/components/ui/Skeleton': { SkeletonList: 'SkeletonList' },
    '@/components/ui/ProductThumbnail': { ProductThumbnail: 'ProductThumbnail' },
    '@/components/ui/ConnectionBanner': { ConnectionBanner: 'ConnectionBanner' },
    '@/components/ui/Section': { MetaRow: 'MetaRow' },
    '@/components/ui/Badge': { StatusBadge: 'StatusBadge' },
    '@/components/refill/RefillCard': { RefillCard: 'RefillCard', formatRupiah: (value) => `Rp ${value}` },
    '@/features/realtime/RealtimeProvider': { useRealtimeState: () => ({ state: 'connected' }) },
    '@/lib/api': { ApiError: class ApiError extends Error {} },
    '@/theme': theme,
  };
}

test('Finance approval disables both decisions during mutation and sends integer quantities', async () => {
  const sent = [];
  const screen = (pending) => loadScreen('app/(app)/finance/approvals.tsx', {
    ...common(),
    '@/features/refill/queries': {
      useRefills: () => ({ data: [refill], isLoading: false, isError: false }),
      useApproveRefill: () => ({ isPending: pending, mutateAsync: async (input) => { sent.push(input); } }),
      useRejectRefill: () => ({ isPending: false }),
    },
  });
  const card = (pending) => {
    const flat = nodes(screen(pending)()).find((node) => node.type === 'FlatList');
    return nodes(flat.props.renderItem({ item: refill, index: 0 }));
  };
  const active = card(false);
  const approve = active.find((node) => node.type === 'Button' && node.props.label === 'Setujui');
  assert.equal(approve.props.disabled, false);
  approve.props.onPress();
  await new Promise(setImmediate);
  assert.deepEqual(JSON.parse(JSON.stringify(sent[0])), { id: 9,
    lines: [{ line_id: 3, qty_approved: 3 }] });
  const pending = card(true);
  assert.equal(pending.find((node) => node.type === 'Button' && node.props.label === 'Setujui').props.loading, true);
  assert.equal(pending.find((node) => node.type === 'Button' && node.props.label === 'Setujui').props.disabled, true);
  assert.equal(pending.find((node) => node.type === 'Button' && node.props.label === 'Tolak').props.disabled, true);
});

test('preparing preserves exact qty payload and exposes pending loading state', async () => {
  const sent = [];
  const screen = (pending) => loadScreen('app/(app)/barista/preparing.tsx', {
    ...common(),
    '@/features/refill/queries': { useRefills: () => ({ data: [refill], isLoading: false, isError: false }),
      useMarkReady: () => ({ isPending: pending, mutateAsync: async (input) => { sent.push(input); } }) },
  });
  const card = (pending) => {
    const flat = nodes(screen(pending)()).find((node) => node.type === 'FlatList');
    return nodes(flat.props.renderItem({ item: refill }));
  };
  const ready = card(false).find((node) => node.type === 'Button' && node.props.label === 'Siap Diambil');
  ready.props.onPress();
  await new Promise(setImmediate);
  assert.deepEqual(JSON.parse(JSON.stringify(sent[0])), { id: 9,
    lines: [{ line_id: 3, qty_prepared: 3 }] });
  const pending = card(true).find((node) => node.type === 'Button' && node.props.label === 'Siap Diambil');
  assert.equal(pending.props.loading, true);
  assert.equal(pending.props.disabled, false);
});

test('Runner claim follows server claim ability and shows pending state', () => {
  const screen = (canClaim, pending) => loadScreen('app/(app)/rider/available.tsx', {
    ...common(),
    '@/features/refill/queries': { useRefills: () => ({ data: [{ ...refill, can: { claim: canClaim } }],
      isLoading: false, isError: false }), useClaimRefill: () => ({ isPending: pending }) },
  });
  const button = (canClaim, pending) => {
    const flat = nodes(screen(canClaim, pending)()).find((node) => node.type === 'FlatList');
    return nodes(flat.props.renderItem({ item: { ...refill, can: { claim: canClaim } }, index: 0 }))
      .find((node) => node.type === 'Button' && node.props.label === 'Ambil');
  };
  assert.equal(button(true, false).props.disabled, false);
  assert.equal(button(false, false).props.disabled, true);
  assert.equal(button(true, true).props.loading, true);
});

test('Reject Dapur compresses before multipart submit and keeps optional kitchen and photo fields', async () => {
  const order = [];
  const initial = [{ 1: 2 }, 'DROPPED', 'pecah',
    { uri: 'reject.jpg', takenAt: '2026-10-24T04:00:00Z' }, null, null, false];
  let stateIndex = 0;
  const screen = loadScreen('app/(app)/kitchen/reject.tsx', {
    ...common(),
    react: { ...react, useEffect: () => {}, useState: () => [initial[stateIndex++], () => {}] },
    'react-native': { ...common()['react-native'], Image: 'Image' },
    'expo-image-picker': {},
    '@tanstack/react-query': { useQueryClient: () => ({ invalidateQueries: async () => {} }),
      useQuery: ({ queryKey }) => queryKey[1] === 'stock'
        ? { data: [{ product_id: 1, product_name: 'Kopi', qty: 5 }], isSuccess: true }
        : { data: [], isSuccess: true } },
    '@/components/ui/Touchable': { Touchable: 'Touchable' },
    '@/features/auth/store': { useAuth: (select) => select({ session: { user: { role: 'FINANCE' } } }) },
    '@/features/refill/queries': { useProducts: () => ({ data: [{ id: 1, name: 'Kopi', is_sellable: true }], isSuccess: true }) },
    '@/features/showcase/kitchenSelection': { useKitchenSelection: () => ({ kitchenId: 4, loaded: true,
      load: async () => {}, select: async () => {} }) },
    '@/features/showcase/operationKey': { kitchenOperationKey: async (path, payload) => {
      order.push(['operation', path, payload]); return { key: 'reject-key', clear: async () => { order.push(['clear']); } };
    } },
    '@/features/kitchenReject/validation': { validateKitchenReject: () => null },
    '@/lib/api': { request: async () => [], uploadFile: async (...args) => {
      order.push(['upload', ...args]); return { id: 7, status: 'RECORDED' };
    } },
    '@/lib/image': { compressForUpload: async (uri) => { order.push(['compress', uri]);
      return { uri: `${uri}.small` }; } },
  });
  const submit = nodes(screen()).find((node) => node.type === 'Button' && node.props.label === 'Kirim reject');
  assert.equal(submit.props.disabled, false);
  submit.props.onPress();
  await new Promise(setImmediate);
  assert.deepEqual(order.map((step) => step[0]), ['compress', 'operation', 'upload', 'clear']);
  assert.equal(order[2][1], '/kitchen-rejects');
  assert.equal(order[2][2].uri, 'reject.jpg.small');
  assert.deepEqual(JSON.parse(JSON.stringify(order[2][3])), {
    lines: '[{"product_id":1,"qty":2}]', reason_code: 'DROPPED', note: 'pecah',
    photo_taken_at: '2026-10-24T04:00:00Z', kitchen_id: '4',
  });
  assert.equal(order[2][4], 'photo');
  assert.equal(order[2][5], 'reject-key');
});

test('Absen uses server eligibility, shows pending, and sends without GPS when permitted', async () => {
  const sent = [];
  function button(canClockIn, pending) {
    const screen = loadScreen('app/(app)/absen.tsx', {
      ...common(),
      react: { ...react, useCallback: (fn) => fn, useEffect: () => {} },
      '@expo/vector-icons/MaterialCommunityIcons': 'Icon',
      'expo-location': { getForegroundPermissionsAsync: async () => ({ granted: false }),
        requestForegroundPermissionsAsync: async () => ({ granted: false }) },
      'react-native-reanimated': { default: { View: 'AnimatedView' } },
      '@/components/ui/Badge': { Chip: 'Chip' },
      '@/components/ui/Motion': { enter: () => undefined },
      '@/components/ui/Section': { SectionTitle: 'SectionTitle' },
      '@/features/auth/store': { useAuth: (select) => select({ session: { user: { role: 'STAFF' } } }) },
      '@/features/showcase/queries': {
        useAttendanceStatus: () => ({ data: { operating_date: '2026-10-24', has_clocked_in: false,
          can_clock_in: canClockIn, geofence: { enforced: false }, can_open_staff_window: false } }),
        useAttendanceRoll: () => ({ data: [] }),
        useClockIn: () => ({ isPending: pending, mutateAsync: async (input) => { sent.push(input); } }),
        useOpenStaffAbsen: () => ({ isPending: false }),
      },
      '@/domain/roles': { roleMeta: {} },
      '@/theme': { ...theme, feedback: { dangerFg: '#f00' } },
    });
    return nodes(screen()).find((node) => node.type === 'Button' && node.props.label === 'Absen Sekarang');
  }
  assert.equal(button(false, false).props.disabled, true);
  assert.equal(button(true, true).props.loading, true);
  const enabled = button(true, false);
  assert.equal(enabled.props.disabled, false);
  enabled.props.onPress();
  await new Promise(setImmediate);
  assert.deepEqual(sent, [null]);
});

test('delivery requires handover photo and disables submit while upload or delivery is pending', () => {
  function button(hasPhoto, uploadPending, deliveryPending, trace = null) {
    const initial = [9, null, { 3: 3 }, hasPhoto ? { uri: 'handover.jpg', takenAt: 'now' } : null,
      'none', null, '', null, 'unavailable', null];
    let index = 0;
    const screen = loadScreen('app/(app)/rider/active.tsx', {
      ...common(),
      react: { ...react, useEffect: () => {}, useState: (fallback) => {
        const value = initial[index++];
        return [value === undefined ? typeof fallback === 'function' ? fallback() : fallback : value, () => {}];
      } },
      'react-native': { ...common()['react-native'], Modal: 'Modal', ScrollView: 'ScrollView', Image: 'Image' },
      '@expo/vector-icons/MaterialCommunityIcons': 'Icon',
      'expo-image-picker': {}, 'expo-location': {},
      '@/components/ui/Touchable': { Touchable: 'Touchable' },
      '@/components/ui/SignaturePad': { SignaturePad: 'SignaturePad' },
      '@/components/ui/Badge': { StatusBadge: 'StatusBadge', Chip: 'Chip' },
      '@/features/refill/queries': {
        useRefills: () => ({ data: [{ ...refill, can: { deliver: true },
          lines: [{ ...refill.lines[0], qty_prepared: 3 }] }], isLoading: false, isError: false }),
        useUploadHandoverPhoto: () => ({ isPending: uploadPending, mutateAsync: (input) => {
          trace?.calls.push(['upload', input]);
          return new Promise((resolve) => { if (trace) trace.finishUpload = resolve; });
        } }),
        useDeliverRefill: () => ({ isPending: deliveryPending, mutateAsync: async (input) => {
          trace?.calls.push(['deliver', input]); return { ledgerPending: false };
        } }),
      },
      '@/features/incidents/queries': { useReportIncident: () => ({ isPending: false }) },
      '@/theme': { ...theme, feedback: { warningFg: '#aa0' },
        neutral: { 0: '#fff', 50: '#eee' }, semantic: { ...theme.semantic, textSubtle: '#aaa' } },
    });
    return nodes(screen()).find((node) => node.type === 'Button' && node.props.label === 'Konfirmasi Pengiriman');
  }
  assert.equal(button(false, false, false).props.disabled, true);
  assert.equal(button(true, false, false).props.disabled, false);
  assert.equal(button(true, true, false).props.loading, true);
  assert.equal(button(true, true, false).props.disabled, true);
  assert.equal(button(true, false, true).props.loading, true);
  assert.equal(button(true, false, true).props.disabled, true);
});

test('delivery screen waits for handover upload and forwards its media ID before submit', async () => {
  const trace = { calls: [], finishUpload: null };
  // Exercise the mounted sheet with a deferred upload.
  const initial = [9, null, { 3: 3 }, { uri: 'handover.jpg', takenAt: 'now' },
    'none', null, '', null, 'unavailable', null];
  let index = 0;
  const screen = loadScreen('app/(app)/rider/active.tsx', {
    ...common(),
    react: { ...react, useEffect: () => {}, useState: (fallback) => {
      const value = initial[index++];
      return [value === undefined ? typeof fallback === 'function' ? fallback() : fallback : value, () => {}];
    } },
    'react-native': { ...common()['react-native'], Modal: 'Modal', ScrollView: 'ScrollView', Image: 'Image' },
    '@expo/vector-icons/MaterialCommunityIcons': 'Icon',
    'expo-image-picker': {}, 'expo-location': {},
    '@/components/ui/Touchable': { Touchable: 'Touchable' },
    '@/components/ui/SignaturePad': { SignaturePad: 'SignaturePad' },
    '@/components/ui/Badge': { StatusBadge: 'StatusBadge', Chip: 'Chip' },
    '@/features/refill/queries': {
      useRefills: () => ({ data: [{ ...refill, can: { deliver: true },
        lines: [{ ...refill.lines[0], qty_prepared: 3 }] }], isLoading: false, isError: false }),
      useUploadHandoverPhoto: () => ({ isPending: false, mutateAsync: (input) => {
        trace.calls.push(['upload', input]); return new Promise((resolve) => { trace.finishUpload = resolve; });
      } }),
      useDeliverRefill: () => ({ isPending: false, mutateAsync: async (input) => {
        trace.calls.push(['deliver', input]); return { ledgerPending: false };
      } }),
    },
    '@/features/incidents/queries': { useReportIncident: () => ({ isPending: false }) },
    '@/theme': { ...theme, feedback: { warningFg: '#aa0' }, neutral: { 0: '#fff', 50: '#eee' },
      semantic: { ...theme.semantic, textSubtle: '#aaa' } },
  });
  const submit = nodes(screen()).find((node) => node.type === 'Button' && node.props.label === 'Konfirmasi Pengiriman');
  submit.props.onPress();
  await new Promise(setImmediate);
  assert.deepEqual(trace.calls.map(([kind]) => kind), ['upload']);
  trace.finishUpload({ id: 55 });
  await new Promise(setImmediate);
  assert.deepEqual(trace.calls.map(([kind]) => kind), ['upload', 'deliver']);
  assert.deepEqual(JSON.parse(JSON.stringify(trace.calls[1][1])), { id: 9, handoverMediaId: 55,
    lines: [{ line_id: 3, qty_received: 3 }], gps: null });
});

test('PIN pending locks input and device-pending outcome keeps the user on the approval screen', async () => {
  const state = ['pin', '123456', null, null, null, false];
  const refs = [];
  let stateIndex = 0;
  let refIndex = 0;
  let submitting = true;
  class AnimatedValue {
    constructor(value) { this.value = value; }
    interpolate() { return 1; }
    setValue(value) { this.value = value; }
  }
  const animated = { Value: AnimatedValue, View: 'AnimatedView',
    timing: () => ({ start() {} }), spring: () => ({ start() {} }) };
  const colors = new Proxy({}, { get: () => '#123' });
  const sizes = new Proxy({}, { get: () => 8 });
  const screen = loadScreen('app/(auth)/login.tsx', {
    ...common(),
    react: { useCallback: (fn) => fn, useEffect: () => {}, useMemo: (fn) => fn(),
      useState: (initial) => { const index = stateIndex++;
        if (!(index in state)) state[index] = typeof initial === 'function' ? initial() : initial;
        return [state[index], (next) => { state[index] = typeof next === 'function' ? next(state[index]) : next; }]; },
      useRef: (initial) => { const index = refIndex++; return refs[index] ??= { current: initial }; } },
    'react-native': { Animated: animated, PanResponder: { create: () => ({ panHandlers: {} }) },
      Platform: { OS: 'android' }, Pressable: 'Pressable', ScrollView: 'ScrollView', View: 'View',
      StyleSheet: { create: (styles) => styles }, useWindowDimensions: () => ({ height: 800 }) },
    'react-hook-form': { Controller: 'Controller', useForm: () => ({ control: {},
      handleSubmit: () => () => {}, formState: {} }) },
    '@/lib/zodResolver': { zodResolver: () => () => {} },
    '@expo/vector-icons/MaterialCommunityIcons': 'Icon',
    'expo-constants': { expoConfig: { version: '1.5.11' } },
    'expo-status-bar': { StatusBar: 'StatusBar' },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) },
    'react-native-reanimated': { default: { View: 'ReanimatedView' } },
    '@/components/ui/Touchable': { Touchable: 'Touchable' },
    '@/components/ui/Badge': { Chip: 'Chip' },
    '@/components/ui/Motion': { enter: () => undefined },
    '@/components/brand/SoulLogo': { SoulLogo: 'SoulLogo' },
    '@/features/auth/store': { useAuth: (selector) => selector
      ? selector({ lastPhone: '0811', pinAvailable: true })
      : { signIn: async () => ({}), signInWithPin: async () => ({ result: 'device-pending',
        message: 'HP baru perlu disetujui Administrator.' }), signInAsDemo: async () => false,
        submitting, error: null, clearError() {} } },
    '@/features/auth/ForgotPinSheet': { ForgotPinSheet: 'ForgotPinSheet' },
    '@/lib/keyboard': { useKeyboardInset: () => 0, useKeyboardVisible: () => false },
    '@/features/auth/schema': { loginSchema: {}, normalisePhone: (value) => value },
    '@/domain/roles': { rolesByPriority: [], roleMeta: {} },
    '@/theme': { brand: colors, feedback: colors, neutral: colors, semantic: colors,
      pressScale: sizes, radius: sizes, space: sizes, touch: sizes },
  });
  function render() { stateIndex = 0; refIndex = 0; return nodes(screen()); }
  const pending = render();
  assert.equal(pending.find((node) => node.type === 'Input' && node.props.label === 'PIN (6 angka)').props.editable, false);
  assert.equal(pending.find((node) => node.type === 'Button' && node.props.label === 'MASUK DENGAN PIN').props.loading, true);
  submitting = false;
  render().find((node) => node.type === 'Button' && node.props.label === 'MASUK DENGAN PIN').props.onPress();
  await new Promise(setImmediate);
  const awaitingApproval = render();
  assert.ok(awaitingApproval.some((node) => node.type === 'Text' &&
    node.props.children === 'HP baru perlu disetujui Administrator.'));
  assert.equal(awaitingApproval.find((node) => node.type === 'Button' && node.props.label === 'Coba login lagi').props.loading, false);
});

test('refill screen waits for evidence upload before sending its media ID and GPS-unavailable payload', async () => {
  const calls = [];
  let finishUpload;
  const state = [{ 1: 3 }, { uri: 'capture.jpg', takenAt: '2026-10-24T05:00:00Z' },
    null, null, 'unavailable', null, null, 'lobi'];
  let index = 0;
  const palette = new Proxy({}, { get: () => '#123' });
  const sizes = new Proxy({}, { get: () => 8 });
  const screen = loadScreen('app/(app)/staff/refill/new.tsx', {
    ...common(),
    react: { ...react, useCallback: (fn) => fn, useEffect: () => {}, useMemo: (fn) => fn(),
      useState: (fallback) => { const value = state[index++];
        return [value === undefined ? typeof fallback === 'function' ? fallback() : fallback : value, () => {}]; } },
    'react-native': { ...common()['react-native'], Image: 'Image' },
    'expo-router': { useFocusEffect: () => {}, useRouter: () => ({ back() {}, replace() {}, push() {} }) },
    'expo-image-picker': {}, 'expo-location': {},
    '@expo/vector-icons/MaterialCommunityIcons': 'Icon',
    'expo-status-bar': { StatusBar: 'StatusBar' },
    'react-native-reanimated': { default: { View: 'AnimatedView' } },
    '@/components/ui/Badge': { Chip: 'Chip' },
    '@/components/ui/AnimatedNumber': { AnimatedNumber: 'AnimatedNumber' },
    '@/components/ui/Section': { SectionTitle: 'SectionTitle' },
    '@/components/ui/Motion': { enter: () => undefined },
    '@/components/ui/Skeleton': { SkeletonGrid: 'SkeletonGrid' },
    '@/components/refill/ProductPickerCard': { ProductPickerCard: 'ProductPickerCard' },
    '@/features/auth/store': { useAuth: (select) => select({ session: { user: { role: 'STAFF', cartId: 8 } },
      refreshUser: async () => {}, cartRefreshStatus: 'ready', cartRefreshError: null }) },
    '@/features/refill/queries': {
      useProducts: () => ({ data: [{ id: 1, name: 'Kopi', is_sellable: true }], isLoading: false, isError: false }),
      useUploadEvidence: () => ({ isPending: false, mutateAsync: (input) => {
        calls.push(['upload', input]); return new Promise((resolve) => { finishUpload = resolve; });
      } }),
      useSubmitRefill: () => ({ isPending: false, mutateAsync: async (input) => {
        calls.push(['submit', input]); return { id: 9 };
      } }),
    },
    '@/features/showcase/queries': { useAttendanceStatus: () => ({ data: {} }) },
    '@/features/showcase/riderDayGate': { DAY_NOT_OPEN_MESSAGE: 'closed', NO_CART_TODAY_MESSAGE: 'no cart',
      isDayNotOpen: () => false, isNoCartToday: () => false, riderDayGate: () => 'ready',
      riderGateMessage: () => null },
    '@/theme': { brand: palette, neutral: palette, radius: sizes, semantic: palette,
      shadow: {}, space: sizes },
  });
  const submit = nodes(screen()).find((node) => node.type === 'Button' && node.props.label === 'Kirim Request');
  assert.equal(submit.props.disabled, false);
  submit.props.onPress();
  await new Promise(setImmediate);
  assert.deepEqual(calls.map(([kind]) => kind), ['upload']);
  finishUpload({ id: 44 });
  await new Promise(setImmediate);
  assert.deepEqual(calls.map(([kind]) => kind), ['upload', 'submit']);
  assert.deepEqual(JSON.parse(JSON.stringify(calls[1][1])), { cartId: 8, evidenceMediaId: 44,
    gps: null, lines: [{ product_id: 1, qty_requested: 3 }], note: 'lobi' });
});

test('shared Button makes loading and disabled actions inert and exposes accessible busy state', () => {
  const code = ts.transpileModule(readFileSync(join(root, 'src/components/ui/Button.tsx'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
      jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const palette = new Proxy({}, { get: () => '#123' });
  const sizes = new Proxy({}, { get: () => 8 });
  const state = { exports: {} };
  const modules = {
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-native': { ActivityIndicator: 'ActivityIndicator', View: 'View',
      StyleSheet: { create: (styles) => styles } },
    '@expo/vector-icons/MaterialCommunityIcons': 'Icon',
    'react-native-reanimated': { default: { View: 'AnimatedView' } },
    './Text': { Text: 'Text' }, './Touchable': { Touchable: 'Touchable' },
    './Motion': { enter: () => undefined },
    '@/theme': { accent: palette, brand: palette, feedback: { dangerFg: '#f00' },
      neutral: palette, pressScale: sizes, radius: sizes, semantic: palette,
      shadow: {}, space: sizes, touch: { minTarget: 48 } },
  };
  vm.runInNewContext(code, { module: state, exports: state.exports, require: (name) => {
    assert.ok(Object.hasOwn(modules, name), `unexpected import: ${name}`);
    return modules[name];
  } });
  const active = state.exports.Button({ label: 'Kirim', onPress() {} });
  assert.equal(active.props.disabled, false);
  assert.deepEqual(JSON.parse(JSON.stringify(active.props.accessibilityState)), { disabled: false, busy: false });
  const loading = state.exports.Button({ label: 'Kirim', loading: true });
  assert.equal(loading.props.disabled, true);
  assert.deepEqual(JSON.parse(JSON.stringify(loading.props.accessibilityState)), { disabled: true, busy: true });
  const disabled = state.exports.Button({ label: 'Kirim', disabled: true });
  assert.equal(disabled.props.disabled, true);
  assert.deepEqual(JSON.parse(JSON.stringify(disabled.props.accessibilityState)), { disabled: true, busy: false });
});
