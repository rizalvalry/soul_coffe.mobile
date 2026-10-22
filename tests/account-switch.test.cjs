const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');
const { QueryClient } = require('@tanstack/react-query');

function loadTs(path, modules, globals = {}) {
  const source = readFileSync(join(__dirname, '..', path), 'utf8');
  const javascript = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(javascript, { setTimeout, clearTimeout, ...globals, module, exports: module.exports, require: (name) => {
    assert.ok(Object.hasOwn(modules, name), `unexpected import: ${name}`);
    return modules[name];
  } });
  return module.exports;
}

function renderRiderForm(path, useAuth, offlineEntries = {}) {
  const component = (name) => name;
  const ui = new Proxy({}, { get: (_target, name) => component(String(name)) });
  const color = new Proxy({}, { get: () => '#000' });
  const number = new Proxy({}, { get: () => 8 });
  const query = { data: [], isPending: false, isLoading: false, isRefetching: false,
    refetch: async () => {}, mutateAsync: async () => ({}), isError: false };
  const modules = {
    react: {
      useCallback: (callback) => callback,
      useEffect() {},
      useMemo: (callback) => callback(),
      useState: (initial) => [initial, () => {}],
    },
    'react/jsx-runtime': {
      jsx: (type, props) => ({ type, props }),
      jsxs: (type, props) => ({ type, props }),
    },
    'react-native': { View: 'View', Image: 'Image', StyleSheet: { create: (styles) => styles } },
    'expo-router': { useRouter: () => ({ back() {}, replace() {} }), useFocusEffect() {} },
    'expo-location': { LocationAccuracy: { Balanced: 1 } },
    'expo-image-picker': {},
    'expo-status-bar': { StatusBar: 'StatusBar' },
    '@expo/vector-icons/MaterialCommunityIcons': 'Icon',
    'react-native-reanimated': { View: 'AnimatedView' },
    '@/features/auth/store': { useAuth },
    '@/features/refill/queries': {
      useProducts: () => query, useMyStock: () => query,
      useSubmitRefill: () => query, useUploadEvidence: () => query,
    },
    '@/features/showcase/queries': { useAttendanceStatus: () => ({
      ...query, data: { has_clocked_in: true, staff_window_open: true },
    }) },
    '@/features/showcase/riderDayGate': {
      DAY_NOT_OPEN_MESSAGE: 'Belum buka',
      NO_CART_TODAY_MESSAGE: 'Produksi belum kasih stok ke Coffee Bike kamu hari ini. Minta Produksi Add Stock dulu ya.',
      isDayNotOpen: () => false, isNoCartToday: () => false,
      riderDayGate: () => 'ready', riderGateMessage: () => null,
    },
    '@/features/sales/queries': {
      useRecordSale: () => query, useTodaySales: () => query, useVoidSale: () => query,
    },
    '@/features/sales/useOfflineSalesQueue': { useOfflineSalesQueue: () => ({
      ...query, queue: [], rejected: [], hasQueued: false, legacyCount: 0,
      flushing: false, clearLastFailure() {}, flushNow() {},
      ...offlineEntries,
    }) },
    '@/lib/api': { ApiError: class ApiError extends Error {}, uuidv4: () => 'test-uuid' },
    '@/domain/types': { PAYMENT_METHODS: ['cash', 'qris', 'transfer'] },
    '@/theme': {
      brand: color, neutral: color, semantic: color, feedback: color,
      radius: number, space: number, shadow: new Proxy({}, { get: () => ({}) }),
    },
  };
  for (const name of ['Screen', 'Text', 'Button', 'Card', 'Badge', 'Banner', 'EmptyState',
    'Input', 'Skeleton', 'AnimatedNumber', 'Section', 'Touchable', 'Motion', 'ProductPickerCard']) {
    modules[`@/components/ui/${name}`] = ui;
  }
  modules['@/components/refill/ProductPickerCard'] = ui;
  modules['@/components/ui/Motion'] = { enter: () => ({}) };
  const tree = loadTs(path, modules).default();
  const strings = [];
  const walk = (value) => {
    if (typeof value === 'string') { strings.push(value); return; }
    if (Array.isArray(value)) { value.forEach(walk); return; }
    if (value && typeof value === 'object') {
      if (typeof value.type === 'function') { walk(value.type(value.props)); return; }
      for (const [key, child] of Object.entries(value)) {
        if (key !== 'type') walk(child);
      }
    }
  };
  walk(tree);
  return strings.join(' ');
}

function setup({ saleError, saleRequest, currentUserRequest, deleteFails = false, markerFails = false } = {}) {
  const disk = new Map();
  const secure = new Map();
  const calls = [];
  let nextUuid = 0;
  const queryModule = loadTs('src/lib/queryClient.ts', {
    '@tanstack/react-query': { QueryClient },
  });
  let state;
  const create = (initializer) => {
    state = initializer((patch) => { state = { ...state, ...patch }; });
    const useStore = (selector) => selector(state);
    useStore.getState = () => state;
    return useStore;
  };
  const users = {
    A: { token: 'token-A', user: { id: 'A', role: 'STAFF', name: 'Rider A' } },
    B: { token: 'token-B', user: { id: 'B', role: 'STAFF', name: 'Rider B' } },
  };
  const meUsers = new Map();
  const storage = {
    getItem: async (key) => disk.get(key) ?? null,
    setItem: async (key, value) => {
      if (markerFails && key === 'soul.logout.pending.v1') throw new Error('storage unavailable');
      disk.set(key, value);
    },
    removeItem: async (key) => { disk.delete(key); },
  };
  const useAuth = loadTs('src/features/auth/store.ts', {
    '@react-native-async-storage/async-storage': storage,
    'expo-secure-store': {
      getItemAsync: async (key) => secure.get(key) ?? null,
      setItemAsync: async (key, value) => { secure.set(key, value); },
      deleteItemAsync: async (key) => {
        if (deleteFails) throw new Error('keystore unavailable');
        secure.delete(key);
      },
    },
    'expo-notifications': {
      clearLastNotificationResponse: () => { calls.push('clear-push-response'); },
      dismissAllNotificationsAsync: async () => { calls.push('dismiss-push'); },
    },
    zustand: { create },
    '@/domain/roles': { isRole: () => true },
    '@/features/push/registration': {
      releaseRegistration: async (token) => { calls.push(`release:${token}`); },
      syncRegistration: async () => { calls.push(`register:${state.session?.user.id}`); },
    },
    '@/features/realtime/seen': { resetSeenEvents: () => calls.push('reset-seen') },
    '@/lib/queryClient': queryModule,
    './api': {
      AuthError: class AuthError extends Error {},
      login: async ({ phone }) => users[phone],
      loginWithPin: async (phone) => users[phone],
      loginAsDemoRole: async () => users.A,
      fetchCurrentUser: async (token) => currentUserRequest
        ? currentUserRequest(token) : meUsers.get(token) ?? users.A.user,
      revokeToken: async (token) => { calls.push(`revoke:${token}`); },
    },
  }).useAuth;
  class ApiError extends Error {
    constructor(message, status) { super(message); this.status = status; }
    get isOffline() { return this.status === 0; }
  }
  const queue = loadTs('src/features/sales/offlineQueue.ts', {
    '@react-native-async-storage/async-storage': storage,
    '@/lib/api': {
      ApiError,
      request: async (path, options) => {
        if (path === '/absen/status') return { staff_window_open: true, has_clocked_in: true };
        calls.push(`sale:${state.session?.user.id}:${options.idempotencyKey}`);
        if (saleRequest) return saleRequest(options);
        if (saleError) throw new ApiError('Sesi berakhir', saleError);
        return {};
      },
      uuidv4: () => `sale-uuid-${++nextUuid}`,
    },
    '@/features/auth/store': { useAuth },
    '@/features/showcase/riderDayGate': {
      DAY_NOT_OPEN_MESSAGE: 'Produksi belum membuka absen hari ini. Fitur transaksi belum bisa dipakai.',
      isDayNotOpen: () => false,
      riderDayGate: () => 'ready',
      riderGateMessage: () => null,
    },
  });
  return { useAuth, queue, getQueryClient: queryModule.getQueryClient, disk, secure, calls, meUsers };
}

test('refreshing /me replaces a login-time empty cart and ignores old account responses', async () => {
  const { useAuth, meUsers } = setup();
  await useAuth.getState().signIn({ phone: 'A', password: 'test' });
  assert.equal(useAuth.getState().session.user.cartId, undefined);
  meUsers.set('token-A', { id: 'A', role: 'STAFF', name: 'Rider A', cartId: 4, cartCode: '0004' });
  await useAuth.getState().refreshUser();
  assert.equal(useAuth.getState().session.user.cartId, 4);
  assert.equal(useAuth.getState().session.user.cartCode, '0004');

  await useAuth.getState().signOut();
  await useAuth.getState().signIn({ phone: 'B', password: 'test' });
  await useAuth.getState().refreshUser();
  assert.equal(useAuth.getState().session.user.id, 'B');
  assert.equal(useAuth.getState().session.user.cartId, undefined);
});

test('a failed newer /me request does not discard an earlier successful cart response', async () => {
  const pending = [];
  const { useAuth } = setup({ currentUserRequest: () => new Promise((resolve, reject) => {
    pending.push({ resolve, reject });
  }) });
  await useAuth.getState().signIn({ phone: 'A', password: 'test' });
  const first = useAuth.getState().refreshUser();
  const second = useAuth.getState().refreshUser();
  pending[1].reject(new Error('Jaringan putus. Coba lagi ya.'));
  await assert.rejects(second);
  assert.equal(useAuth.getState().cartRefreshStatus, 'error');
  pending[0].resolve({ id: 'A', role: 'STAFF', name: 'Rider A', cartId: 4, cartCode: '0004' });
  await first;
  assert.equal(useAuth.getState().session.user.cartId, 4);
  assert.equal(useAuth.getState().cartRefreshStatus, 'idle');
  assert.equal(useAuth.getState().cartRefreshError, null);
});

test('a failed cart refresh stays visible until Coba lagi succeeds', async () => {
  let fail = true;
  const { useAuth } = setup({ currentUserRequest: async () => {
    if (fail) throw new Error('Coffee Bike belum bisa dicek. Coba lagi ya.');
    return { id: 'A', role: 'STAFF', name: 'Rider A', cartId: 4, cartCode: '0004' };
  } });
  await useAuth.getState().signIn({ phone: 'A', password: 'test' });
  await assert.rejects(useAuth.getState().refreshUser());
  assert.equal(useAuth.getState().cartRefreshStatus, 'error');
  assert.match(useAuth.getState().cartRefreshError, /Coba lagi/);
  fail = false;
  await useAuth.getState().refreshUser();
  assert.equal(useAuth.getState().cartRefreshStatus, 'idle');
  assert.equal(useAuth.getState().session.user.cartId, 4);
});

test('login before Add Stock then assignment event and foreground refresh Rider refill cart data', async () => {
  let currentUser = { id: 'A', role: 'STAFF', name: 'Rider A' };
  let hold = null;
  const { useAuth } = setup({ currentUserRequest: async () => {
    if (hold) await hold.promise;
    return currentUser;
  } });
  await useAuth.getState().signIn({ phone: 'A', password: 'test' });
  const effects = [];
  const channels = [];
  let appStateChange;
  class Echo {
    connector = { pusher: { connection: { bind() {} } } };
    private() { return { listen: (_event, callback) => channels.push(callback) }; }
    leave() {}
    disconnect() {}
  }
  const provider = loadTs('src/features/realtime/RealtimeProvider.tsx', {
    react: {
      createContext: () => ({ Provider: () => null }),
      useContext: () => null,
      useEffect: (effect) => effects.push(effect),
      useRef: (value) => ({ current: value }),
      useState: (value) => [value, () => {}],
    },
    'react/jsx-runtime': { jsx: () => null },
    'react-native': { AppState: { currentState: 'active', addEventListener: (_name, callback) => {
      appStateChange = callback;
      return { remove() {} };
    } } },
    'expo-constants': { expoConfig: { extra: { pusherKey: 'test', pusherCluster: 'test' } } },
    'laravel-echo': Echo,
    'pusher-js': class Pusher {},
    '@tanstack/react-query': { useQueryClient: () => ({ invalidateQueries: async () => {} }) },
    '@/features/auth/store': { useAuth },
    '@/features/navigation/menu': { canUse: (user, module, ability = 'view') =>
      user.isSuperAdmin === true || user.abilities?.[module]?.includes(ability) === true },
    '@/lib/api': { apiBaseUrl: () => 'http://localhost' },
    '@/features/refill/queries': { invalidateRefillData() {}, qk: {
      myStock: ['me', 'stock'], kitchenStock: ['kitchen', 'stock'], allocationsToday: ['allocations', 'today'],
    } },
    '@/features/showcase/queries': { showcaseKeys: {
      absenStatus: ['absen', 'status'], stock: ['showcase', 'stock'], staff: ['showcase', 'staff'],
    } },
    '@/features/settlements/queries': { invalidateSettlementData() {} },
    '@/features/settlements/rider': { riderSettlementKey: ['me', 'settlement'] },
    '@/features/riderLocation/queries': { riderSetupKeys: { list: ['rider-location-setups'] } },
    './seen': { claimEvent() {} },
  }, { setTimeout: () => 1, clearTimeout: () => {} });
  provider.RealtimeProvider({ children: null });
  const cleanups = effects.map((effect) => effect());
  assert.equal(useAuth.getState().session.user.cartId, undefined);
  for (const screen of ['app/(app)/staff/refill/new.tsx']) {
    assert.match(renderRiderForm(screen, useAuth), /Produksi belum kasih stok/);
  }
  currentUser = { id: 'A', role: 'STAFF', name: 'Rider A', cartId: 4, cartCode: '0004' };
  channels[0]({ event_id: 'handover-1', type: 'CartAssignmentChanged', cart_id: 4 });
  await new Promise(setImmediate);
  for (const screen of ['app/(app)/staff/refill/new.tsx']) {
    assert.match(renderRiderForm(screen, useAuth), /0004/);
    assert.equal(useAuth.getState().session.user.cartId, 4);
    assert.equal(useAuth.getState().session.user.cartCode, '0004');
  }
  currentUser = { id: 'A', role: 'STAFF', name: 'Rider A', cartId: 5, cartCode: '0005' };
  hold = {};
  hold.promise = new Promise((resolve) => { hold.resolve = resolve; });
  appStateChange('inactive');
  appStateChange('active');
  assert.equal(useAuth.getState().cartRefreshStatus, 'loading');
  for (const screen of ['app/(app)/staff/refill/new.tsx']) {
    const rendered = renderRiderForm(screen, useAuth);
    assert.match(rendered, /Coffee Bike\s+0004/);
    assert.match(rendered, /Kirim Request/);
  }
  hold.resolve();
  hold = null;
  await new Promise(setImmediate);
  assert.equal(useAuth.getState().session.user.cartId, 5);
  assert.equal(useAuth.getState().session.user.cartCode, '0005');
  for (const screen of ['app/(app)/staff/refill/new.tsx']) {
    assert.match(renderRiderForm(screen, useAuth), /0005/);
  }
  const stableSession = useAuth.getState().session;
  await useAuth.getState().refreshUser();
  assert.equal(useAuth.getState().session, stableSession, 'unchanged /me must not reconnect Pusher');
  cleanups.forEach((cleanup) => cleanup?.());
});

test('failed cart refresh keeps Rider refill available with a retry banner', async () => {
  let fail = false;
  const { useAuth } = setup({ currentUserRequest: async () => {
    if (fail) throw new Error('Jaringan putus. Coba lagi ya.');
    return { id: 'A', role: 'STAFF', name: 'Rider A', cartId: 4, cartCode: '0004' };
  } });
  await useAuth.getState().signIn({ phone: 'A', password: 'test' });
  await useAuth.getState().refreshUser();
  fail = true;
  await assert.rejects(useAuth.getState().refreshUser());
  for (const screen of ['app/(app)/staff/refill/new.tsx']) {
    const rendered = renderRiderForm(screen, useAuth);
    assert.match(rendered, /Coffee Bike\s+0004/);
    assert.match(rendered, /Coffee Bike belum bisa dicek/);
    assert.match(rendered, /Coba lagi/);
    assert.match(rendered, /Kirim Request/);
  }
});

test('displaced Rider still sees rejected offline sale when no cart is active', async () => {
  const screen = readFileSync(join(__dirname, '..', 'app/(app)/staff/closing.tsx'), 'utf8');
  assert.match(screen, /oldSales\.rejected\.map/);
  assert.match(screen, /entry\.rejection/);
  assert.doesNotMatch(screen, /Simpan Transaksi/);
});

function loadApi(useAuth, fetch) {
  return loadTs('src/lib/api.ts', {
    'expo-constants': { expoConfig: { extra: { apiBaseUrl: 'http://localhost/api/v1' } } },
    'expo-file-system': {},
    '@/features/auth/store': { useAuth },
    '@/features/demo/config': { isDemoMode: () => false },
    '@/features/demo/router': {},
    '@/features/demo/store': { DemoError: class DemoError extends Error {} },
  }, { fetch });
}

test('login A, cache A, logout, login B leaves no A query or mutation data', async () => {
  const { useAuth, getQueryClient, disk, calls } = setup();
  await useAuth.getState().signIn({ phone: 'A', password: 'test' });
  const queryClient = getQueryClient();
  queryClient.setQueryData(['settlements', 'A'], [{ owner: 'A' }]);
  queryClient.getMutationCache().build(queryClient, { mutationKey: ['A'] });
  assert.equal(queryClient.getQueryData(['settlements', 'A'])[0].owner, 'A');

  await useAuth.getState().signOut();
  assert.equal(queryClient.getQueryCache().getAll().length, 0);
  assert.equal(queryClient.getMutationCache().getAll().length, 0);
  assert.equal(useAuth.getState().lastPhone, null);
  assert.equal(useAuth.getState().pinAvailable, false);
  assert.equal(disk.has('soul.signin.hint.v1'), false);
  assert.ok(calls.includes('clear-push-response'));
  await useAuth.getState().signIn({ phone: 'B', password: 'test' });
  assert.equal(useAuth.getState().session.user.id, 'B');
  assert.equal(getQueryClient().getQueryData(['settlements', 'A']), undefined);
  assert.equal(getQueryClient().getMutationCache().getAll().length, 0);
  assert.equal(useAuth.getState().lastPhone, 'B');
  assert.ok(calls.includes('dismiss-push'));
  assert.ok(calls.indexOf('release:token-A') < calls.indexOf('revoke:token-A'));
  assert.ok(calls.includes('register:B'));
});

test('pending sales remain under A and never replay with B credentials', async () => {
  const { useAuth, queue, disk, calls } = setup();
  await useAuth.getState().signIn({ phone: 'A', password: 'test' });
  await queue.enqueueSale('A', { cartId: 4, lines: [{ product_id: 1, qty: 2 }], paymentMethod: 'CASH' });
  assert.equal((await queue.loadQueuedSales('A')).length, 1);
  await useAuth.getState().signOut();
  await useAuth.getState().signIn({ phone: 'B', password: 'test' });
  assert.equal((await queue.loadQueuedSales('B')).length, 0);
  await queue.flushSalesQueue('A');
  assert.equal(calls.filter((call) => call.startsWith('sale:')).length, 0);
  assert.equal((await queue.loadQueuedSales('A')).length, 1);
  assert.ok([...disk.keys()].some((key) => key.endsWith('.A')));
});

test('unowned legacy sales remain intact and are reported without automatic replay', async () => {
  const { useAuth, queue, disk, calls } = setup();
  const legacy = JSON.stringify([{ uuid: 'old-sale', input: { lines: [] } }]);
  disk.set('soul.sales.offline_queue.v1', legacy);
  await useAuth.getState().signIn({ phone: 'B', password: 'test' });
  assert.equal(await queue.legacyQueuedSaleCount(), 1);
  await queue.flushSalesQueue('B');
  assert.equal(disk.get('soul.sales.offline_queue.v1'), legacy);
  assert.equal(calls.filter((call) => call.startsWith('sale:')).length, 0);
});

test('a 401 during replay keeps the old account sale queued', async () => {
  const { useAuth, queue } = setup({ saleError: 401 });
  await useAuth.getState().signIn({ phone: 'A', password: 'test' });
  await queue.enqueueSale('A', { cartId: 4, lines: [{ product_id: 1, qty: 2 }], paymentMethod: 'CASH' });
  const result = await queue.flushSalesQueue('A');
  assert.equal(result.stillOffline, true);
  assert.equal((await queue.loadQueuedSales('A')).length, 1);
});

test('flush completion cannot overwrite a newly queued sale for the same account', async () => {
  let resume;
  let started;
  const requestStarted = new Promise((resolve) => { started = resolve; });
  const gate = new Promise((resolve) => { resume = resolve; });
  const { useAuth, queue } = setup({ saleRequest: async () => { started(); await gate; return {}; } });
  await useAuth.getState().signIn({ phone: 'A', password: 'test' });
  const first = await queue.enqueueSale('A', { cartId: 4, lines: [{ product_id: 1, qty: 1 }], paymentMethod: 'CASH' });
  const flushing = queue.flushSalesQueue('A');
  await requestStarted;
  const second = await queue.enqueueSale('A', { cartId: 4, lines: [{ product_id: 2, qty: 1 }], paymentMethod: 'CASH' });
  resume();
  await flushing;
  const remaining = await queue.loadQueuedSales('A');
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].uuid, second.uuid);
  assert.notEqual(first.uuid, second.uuid);
});

test('concurrent enqueues both survive serialized local writes', async () => {
  const { useAuth, queue } = setup();
  await useAuth.getState().signIn({ phone: 'A', password: 'test' });
  await Promise.all([
    queue.enqueueSale('A', { cartId: 4, lines: [{ product_id: 1, qty: 1 }], paymentMethod: 'CASH' }),
    queue.enqueueSale('A', { cartId: 4, lines: [{ product_id: 2, qty: 1 }], paymentMethod: 'CASH' }),
  ]);
  assert.equal((await queue.loadQueuedSales('A')).length, 2);
});

test('a 422 rejection remains stored for A after logout and is not retried automatically', async () => {
  const { useAuth, queue, calls } = setup({ saleError: 422 });
  await useAuth.getState().signIn({ phone: 'A', password: 'test' });
  await queue.enqueueSale('A', { cartId: 4, lines: [{ product_id: 1, qty: 1 }], paymentMethod: 'CASH' });
  await queue.flushSalesQueue('A');
  await useAuth.getState().signOut();
  await useAuth.getState().signIn({ phone: 'A', password: 'test' });
  const saved = await queue.loadQueuedSales('A');
  assert.equal(saved.length, 1);
  assert.equal(saved[0].rejection, 'Sesi berakhir');
  await queue.flushSalesQueue('A');
  assert.equal(calls.filter((call) => call.startsWith('sale:')).length, 1);
});

test('confirmed 401 clears A cache and ends A session', async () => {
  const { useAuth, getQueryClient } = setup();
  await useAuth.getState().signIn({ phone: 'A', password: 'test' });
  getQueryClient().setQueryData(['notifications'], [{ owner: 'A' }]);
  const api = loadApi(useAuth, async () => ({ status: 401, ok: false, text: async () => '{}' }));
  await assert.rejects(api.request('/notifications'), (error) => error.status === 401);
  await useAuth.getState().signOut();
  assert.equal(useAuth.getState().status, 'unauthenticated');
  assert.equal(getQueryClient().getQueryCache().getAll().length, 0);
});

test('late 401 probe for A cannot end B session or clear B cache', async () => {
  const { useAuth, getQueryClient } = setup();
  await useAuth.getState().signIn({ phone: 'A', password: 'test' });
  let releaseProbe;
  let probeStarted;
  const started = new Promise((resolve) => { probeStarted = resolve; });
  const probe = new Promise((resolve) => { releaseProbe = resolve; });
  const api = loadApi(useAuth, async (url) => {
    if (url.endsWith('/me')) { probeStarted(); return probe; }
    return { status: 401, ok: false, text: async () => '{}' };
  });
  const oldRequest = api.request('/notifications').catch((error) => error);
  await started;
  await useAuth.getState().signOut();
  await useAuth.getState().signIn({ phone: 'B', password: 'test' });
  getQueryClient().setQueryData(['notifications'], [{ owner: 'B' }]);
  releaseProbe({ ok: false });
  const error = await oldRequest;
  assert.equal(error.status, 401);
  assert.equal(useAuth.getState().session.user.id, 'B');
  assert.equal(getQueryClient().getQueryData(['notifications'])[0].owner, 'B');
});

test('A mutation callback can only write to A old cache after B signs in', async () => {
  const { useAuth, getQueryClient } = setup();
  await useAuth.getState().signIn({ phone: 'A', password: 'test' });
  const clientA = getQueryClient();
  await useAuth.getState().signOut();
  await useAuth.getState().signIn({ phone: 'B', password: 'test' });
  const clientB = getQueryClient();
  clientB.setQueryData(['notifications'], [{ owner: 'B' }]);
  // This models an already-running A mutation's onError callback after the auth transition.
  clientA.setQueryData(['notifications'], [{ owner: 'A' }]);
  assert.notEqual(clientA, clientB);
  assert.equal(clientB.getQueryData(['notifications'])[0].owner, 'B');
});

test('a B 401 checks B token even while A probe is pending', async () => {
  const { useAuth, getQueryClient } = setup();
  await useAuth.getState().signIn({ phone: 'A', password: 'test' });
  let resolveAProbe;
  let started;
  const aProbeStarted = new Promise((resolve) => { started = resolve; });
  const aProbe = new Promise((resolve) => { resolveAProbe = resolve; });
  const api = loadApi(useAuth, async (url, options) => {
    const token = options.headers.Authorization;
    if (url.endsWith('/me') && token === 'Bearer token-A') { started(); return aProbe; }
    if (url.endsWith('/me') && token === 'Bearer token-B') return { ok: true };
    return { status: 401, ok: false, text: async () => '{}' };
  });
  const aRequest = api.request('/notifications').catch((error) => error);
  await aProbeStarted;
  await useAuth.getState().signOut();
  await useAuth.getState().signIn({ phone: 'B', password: 'test' });
  getQueryClient().setQueryData(['notifications'], [{ owner: 'B' }]);
  await assert.rejects(api.request('/notifications'), (error) => error.status === 401);
  assert.equal(useAuth.getState().session.user.id, 'B');
  resolveAProbe({ ok: false });
  await aRequest;
  assert.equal(getQueryClient().getQueryData(['notifications'])[0].owner, 'B');
});

test('new account gets its own FCM registration after old attempt finishes', async () => {
  let sessionToken = 'token-A';
  let resolveDeviceToken;
  let started;
  const tokenStarted = new Promise((resolve) => { started = resolve; });
  const deviceTokenGate = new Promise((resolve) => { resolveDeviceToken = resolve; });
  const registrations = [];
  let deviceCalls = 0;
  const registration = loadTs('src/features/push/registration.ts', {
    './api': {
      registerDevice: async (_deviceToken, _name, authToken) => { registrations.push(authToken); },
      unregisterDevice: async () => {},
    },
    './device': {
      getDeviceToken: async () => {
        deviceCalls++;
        if (deviceCalls === 1) { started(); await deviceTokenGate; }
        return { status: 'ready', token: 'fcm-token' };
      },
      deviceLabel: () => 'phone',
      rememberedToken: async () => null,
      rememberToken: async () => {},
    },
    '@/features/auth/store': { useAuth: { getState: () => ({ session: { token: sessionToken } }) } },
  }, { AbortController, setTimeout, clearTimeout });
  const oldAttempt = registration.syncRegistration('token-A');
  await tokenStarted;
  sessionToken = 'token-B';
  const newAttempt = registration.syncRegistration('token-B');
  resolveDeviceToken();
  await Promise.all([oldAttempt, newAttempt]);
  assert.deepEqual(registrations, ['token-B']);
});

test('failed SecureStore delete leaves a marker and still revokes A before B login', async () => {
  const { useAuth, disk, calls } = setup({ deleteFails: true });
  await useAuth.getState().signIn({ phone: 'A', password: 'test' });
  await useAuth.getState().signOut();
  assert.equal(disk.get('soul.logout.pending.v1'), '1');
  assert.ok(calls.includes('release:token-A'));
  assert.ok(calls.includes('revoke:token-A'));
  await useAuth.getState().restore();
  assert.equal(useAuth.getState().status, 'unauthenticated');
  assert.equal(useAuth.getState().session, null);
  const result = await useAuth.getState().signIn({ phone: 'B', password: 'test' });
  assert.equal(result.result, 'ok');
  assert.equal(disk.has('soul.logout.pending.v1'), false);
  assert.equal(useAuth.getState().session.user.id, 'B');
});

test('simultaneous storage failures return a handled sign-in failure', async () => {
  const { useAuth, calls } = setup({ deleteFails: true, markerFails: true });
  await useAuth.getState().signIn({ phone: 'A', password: 'test' });
  const ending = useAuth.getState().signOut();
  const nextLogin = useAuth.getState().signIn({ phone: 'B', password: 'test' });
  await assert.rejects(ending);
  const result = await nextLogin;
  assert.equal(result.result, 'failed');
  assert.ok(calls.includes('release:token-A'));
  assert.ok(calls.includes('revoke:token-A'));
});

test('PIN session reset does not leave the splash stuck on storage failure', async () => {
  const { useAuth } = setup({ deleteFails: true, markerFails: true });
  await useAuth.getState().signIn({ phone: 'A', password: 'test' });
  await useAuth.getState().endRevokedSession();
  assert.equal(useAuth.getState().status, 'unauthenticated');
  assert.equal(useAuth.getState().session, null);
  assert.match(useAuth.getState().error, /belum dapat dihapus/);
});

test('root query provider changes with the account token even when auth status stays authenticated', () => {
  const queryModule = loadTs('src/lib/queryClient.ts', {
    '@tanstack/react-query': { QueryClient },
  });
  const authState = { status: 'authenticated', session: { token: 'token-A' }, restore() {} };
  const observedTokens = [];
  const element = (type, props, key) => ({ type, props, key });
  const root = loadTs('app/_layout.tsx', {
    react: {
      useCallback: (callback) => callback,
      useEffect() {},
      useState: () => [true, () => {}],
    },
    'react/jsx-runtime': { jsx: element, jsxs: element },
    'react-native': { StyleSheet: { absoluteFill: {} }, View: 'View' },
    'expo-router': { Stack: 'Stack' },
    'expo-status-bar': { StatusBar: 'StatusBar' },
    'expo-splash-screen': { preventAutoHideAsync() {}, hideAsync() {} },
    'react-native-safe-area-context': { SafeAreaProvider: 'SafeAreaProvider' },
    '@tanstack/react-query': { QueryClientProvider: 'QueryClientProvider' },
    '@/components/brand/AppSplash': { AppSplash: 'AppSplash' },
    '@/features/auth/store': { useAuth: (selector) => {
      const value = selector(authState);
      if (value === authState.session.token) observedTokens.push(value);
      return value;
    } },
    '@/features/onboarding/store': { useOnboarding: (selector) => selector({ status: 'loaded', load() {} }) },
    '@/theme': { semantic: { bg: '#fff' } },
    '@/lib/queryClient': queryModule,
  }).default;
  const providerA = root();
  authState.session = { token: 'token-B' };
  queryModule.resetQueryClient();
  const providerB = root();
  assert.equal(providerA.key, 'token-A');
  assert.equal(providerB.key, 'token-B');
  assert.notEqual(providerA.props.client, providerB.props.client);
  assert.deepEqual(observedTokens, ['token-A', 'token-B']);
});
