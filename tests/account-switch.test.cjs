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

function setup({ saleError, saleRequest, deleteFails = false, markerFails = false } = {}) {
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
  return { useAuth, queue, getQueryClient: queryModule.getQueryClient, disk, secure, calls };
}

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
  await queue.enqueueSale('A', { lines: [{ product_id: 1, qty: 2 }], paymentMethod: 'CASH' });
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
  await queue.enqueueSale('A', { lines: [{ product_id: 1, qty: 2 }], paymentMethod: 'CASH' });
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
  const first = await queue.enqueueSale('A', { lines: [{ product_id: 1, qty: 1 }], paymentMethod: 'CASH' });
  const flushing = queue.flushSalesQueue('A');
  await requestStarted;
  const second = await queue.enqueueSale('A', { lines: [{ product_id: 2, qty: 1 }], paymentMethod: 'CASH' });
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
    queue.enqueueSale('A', { lines: [{ product_id: 1, qty: 1 }], paymentMethod: 'CASH' }),
    queue.enqueueSale('A', { lines: [{ product_id: 2, qty: 1 }], paymentMethod: 'CASH' }),
  ]);
  assert.equal((await queue.loadQueuedSales('A')).length, 2);
});

test('a 422 rejection remains stored for A after logout and is not retried automatically', async () => {
  const { useAuth, queue, calls } = setup({ saleError: 422 });
  await useAuth.getState().signIn({ phone: 'A', password: 'test' });
  await queue.enqueueSale('A', { lines: [{ product_id: 1, qty: 1 }], paymentMethod: 'CASH' });
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
