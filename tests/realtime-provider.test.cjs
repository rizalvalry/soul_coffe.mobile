const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

function mountRealtimeProvider(claimEvent = () => true, role = 'STAFF') {
  const source = readFileSync(join(__dirname, '..', 'src/features/realtime/RealtimeProvider.tsx'), 'utf8');
  const javascript = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;

  const effects = [];
  const connectionCallbacks = new Map();
  const channelCallbacks = [];
  const channelNames = [];
  const leftChannels = [];
  let disconnects = 0;
  const calls = [];
  let nowMs = Date.UTC(2026, 9, 17, 16, 0, 0);
  const timers = new Map();
  let nextTimerId = 0;
  let appStateCallback;
  let refillInvalidations = 0;
  let cartRefreshes = 0;
  const client = { invalidateQueries: (filter) => { calls.push(filter?.queryKey ?? 'all'); return Promise.resolve(); } };
  const session = { token: 'test-token', user: { id: '7', role, cartId: 1 } };
  const react = {
    createContext: () => ({ Provider: () => null }),
    useContext: () => null,
    useEffect: (effect) => effects.push(effect),
    useRef: (value) => ({ current: value }),
    useState: (value) => [value, () => {}],
  };
  class Echo {
    connector = { pusher: { connection: { bind: (event, callback) => connectionCallbacks.set(event, callback) } } };
    private(name) { channelNames.push(name); return { listen: (_event, callback) => channelCallbacks.push(callback) }; }
    leave(name) { leftChannels.push(name); }
    disconnect() { disconnects++; }
  }
  const modules = {
    react,
    'react/jsx-runtime': { jsx: () => null },
    'react-native': { AppState: { currentState: 'active', addEventListener: (_event, callback) => {
      appStateCallback = callback;
      return { remove() {} };
    } } },
    'expo-constants': { expoConfig: { extra: { pusherKey: 'test-key', pusherCluster: 'test-cluster' } } },
    'laravel-echo': Echo,
    'pusher-js': class Pusher {},
    '@tanstack/react-query': { useQueryClient: () => client },
    '@/features/auth/store': { useAuth: (selector) => selector({ session, refreshUser: async () => { cartRefreshes++; } }) },
    '@/lib/api': { apiBaseUrl: () => 'http://localhost' },
    '@/features/refill/queries': {
      invalidateRefillData: () => { refillInvalidations++; },
      qk: { myStock: ['me', 'stock'], kitchenStock: ['kitchen', 'stock'], allocationsToday: ['allocations', 'today'] },
    },
    '@/features/showcase/queries': { showcaseKeys: { absenStatus: ['absen', 'status'], stock: ['showcase', 'stock'], staff: ['showcase', 'staff'] } },
    '@/features/settlements/queries': { invalidateSettlementData: (queryClient, cartId) => {
      queryClient.invalidateQueries({ queryKey: ['settlements', 'queue'] });
      queryClient.invalidateQueries({ queryKey: ['settlements', 'list'] });
      queryClient.invalidateQueries({ queryKey: Number.isSafeInteger(cartId) && cartId > 0
        ? ['settlements', 'draft', cartId] : ['settlements', 'draft'] });
    } },
    '@/features/settlements/rider': { riderSettlementKey: ['me', 'settlement'] },
    '@/features/riderLocation/queries': { riderSetupKeys: { list: ['rider-location-setups'] } },
    './seen': { claimEvent },
  };
  const module = { exports: {} };
  vm.runInNewContext(javascript, {
    Date: { now: () => nowMs },
    setTimeout: (callback, delay) => { const id = ++nextTimerId; timers.set(id, { callback, delay }); return id; },
    clearTimeout: (id) => { timers.delete(id); },
    module, exports: module.exports, require: (name) => {
    assert.ok(Object.hasOwn(modules, name), `unexpected import: ${name}`);
    return modules[name];
  } });
  module.exports.RealtimeProvider({ children: null });
  const cleanups = effects.map((effect) => effect());
  return {
    calls, channelCallbacks, channelNames, leftChannels, connectionCallbacks,
    cleanup: () => cleanups.forEach((cleanup) => cleanup?.()),
    disconnects: () => disconnects,
    appState: (state) => appStateCallback(state),
    refillInvalidations: () => refillInvalidations,
    cartRefreshes: () => cartRefreshes,
    nextBoundaryDelay: () => timers.values().next().value?.delay,
    runBoundary: () => {
      const [id, timer] = timers.entries().next().value;
      timers.delete(id);
      nowMs += timer.delay;
      timer.callback();
    },
  };
}

test('old account channels are left and socket disconnected on sign-out', () => {
  const app = mountRealtimeProvider();
  assert.ok(app.channelNames.includes('user.7'));
  app.cleanup();
  assert.deepEqual(app.leftChannels, app.channelNames);
  assert.equal(app.disconnects(), 1);
  const before = app.calls.length;
  app.channelCallbacks[0]({ event_id: 'late', type: 'SaleRecorded', refill_request_id: null });
  app.connectionCallbacks.get('connected')();
  assert.equal(app.calls.length, before);
});

test('push-first event still refreshes Absen and duplicate socket channels do not refetch again', () => {
  const app = mountRealtimeProvider(() => false);
  assert.ok(app.channelCallbacks.length > 1);
  const event = { event_id: 'same-event', type: 'StaffAttendanceWindowOpened', refill_request_id: null };
  app.channelCallbacks[0](event);
  assert.ok(app.calls.some((key) => Array.isArray(key) && key.join('/') === 'absen/status'));
  assert.ok(app.calls.some((key) => Array.isArray(key) && key.join('/') === 'absen/roll'));
  assert.equal(app.refillInvalidations(), 1);
  const before = app.calls.length;
  app.channelCallbacks[1](event);
  assert.equal(app.calls.length, before);
  assert.equal(app.refillInvalidations(), 1);
});

test('connection and foreground transitions refresh once without an interval', () => {
  const app = mountRealtimeProvider();
  app.connectionCallbacks.get('connected')();
  assert.equal(app.cartRefreshes(), 1);
  assert.deepEqual(app.calls, ['all']);
  app.appState('active');
  assert.equal(app.cartRefreshes(), 1);
  assert.deepEqual(app.calls, ['all']);
  app.appState('inactive');
  app.appState('active');
  assert.deepEqual(app.calls, ['all', 'all']);
  assert.equal(app.cartRefreshes(), 2);
  app.appState('active');
  assert.deepEqual(app.calls, ['all', 'all']);
});

test('Rider assignment event refreshes current cart even if push arrived first', () => {
  const app = mountRealtimeProvider(() => false);
  app.channelCallbacks[0]({ event_id: 'new-cart', type: 'CartAssignmentChanged', cart_id: 4 });
  assert.equal(app.cartRefreshes(), 1);
  assert.ok(app.leftChannels.includes('cart.1'), 'displaced Rider must leave old cart immediately');
  app.channelCallbacks[1]({ event_id: 'new-cart', type: 'CartAssignmentChanged', cart_id: 4 });
  assert.equal(app.cartRefreshes(), 1);
});

test('a continuously foregrounded Rider refreshes attendance at the operating-day boundary', () => {
  const app = mountRealtimeProvider();
  assert.equal(app.nextBoundaryDelay(), 60 * 60 * 1000 + 1000);
  app.runBoundary();
  assert.ok(app.calls.some((key) => Array.isArray(key) && key.join('/') === 'absen/status'));
  assert.ok(app.nextBoundaryDelay() > 0);
  app.cleanup();
});

test('existing stock and sale events refresh their affected query families', () => {
  const app = mountRealtimeProvider(() => true, 'FINANCE');
  const cases = [
    ['ShowcaseBrewed', ['showcase/stock', 'me/stock', 'kitchen/stock']],
    ['CartStockHandedOver', ['showcase/stock', 'showcase/staff', 'showcase/allowance', 'allocations/today']],
    ['CartClosedOut', ['showcase/stock', 'settlements/queue', 'settlements/list', 'settlements/draft']],
    ['CartCloseOutVarianceFlagged', ['settlements/queue', 'settlements/list', 'settlements/draft']],
    ['SaleVoided', ['settlements/queue', 'settlements/list', 'settlements/draft']],
    ['SaleFlaggedSuspect', ['settlements/queue', 'settlements/list', 'settlements/draft']],
  ];
  for (const [type, expectedKeys] of cases) {
    app.calls.length = 0;
    app.channelCallbacks[0]({ event_id: type, type, refill_request_id: null });
    const keys = app.calls.map((key) => Array.isArray(key) ? key.join('/') : key);
    for (const expected of expectedKeys) assert.ok(keys.includes(expected), `${type} missed ${expected}`);
  }
});

test('Finance, Management, and Administrator refresh the same settlement queries for original events', () => {
  const types = ['SaleRecorded', 'SaleVoided', 'RiderClosingRecorded', 'RiderClosingCorrected',
    'CartCloseOutVarianceFlagged', 'CartArrivalChanged', 'SettlementRecorded', 'SettlementApproved',
    'SettlementExpectedStale', 'SettlementVarianceFlagged', 'SettlementMethodVarianceFlagged',
    'SettlementSelfApproved'];
  for (const role of ['FINANCE', 'MANAGEMENT', 'ADMINISTRATOR']) {
    const app = mountRealtimeProvider(() => false, role);
    assert.ok(app.channelNames.includes(`role.${role}`));
    for (const type of types) {
      app.calls.length = 0;
      const event = { event_id: `${role}-${type}`, type, cart_id: 18, refill_request_id: null };
      app.channelCallbacks[0](event);
      assert.deepEqual(app.calls.map((key) => Array.from(key)), [
        ['settlements', 'queue'],
        ['settlements', 'list'],
        ['settlements', 'draft', 18],
      ], `${role} ${type}`);
      app.channelCallbacks[1](event);
      assert.equal(app.calls.length, 3, `${role} ${type} refetched twice`);
    }
  }
});

test('variance without cart context refreshes every draft, and other roles do not refresh settlements', () => {
  const finance = mountRealtimeProvider(() => true, 'FINANCE');
  finance.channelCallbacks[0]({ event_id: 'variance-no-cart', type: 'SettlementVarianceFlagged', refill_request_id: null });
  assert.deepEqual(finance.calls.map((key) => Array.from(key)), [
    ['settlements', 'queue'], ['settlements', 'list'], ['settlements', 'draft'],
  ]);

  const admin = mountRealtimeProvider(() => true, 'ADMINISTRATOR');
  admin.channelCallbacks[1]({ event_id: 'admin-setup-change', type: 'RiderLocationSetupChanged', refill_request_id: null });
  assert.ok(admin.calls.some((key) => Array.isArray(key) && key.join('/') === 'rider-location-setups'));
  assert.equal(admin.refillInvalidations(), 1);
  const beforeDuplicate = admin.calls.length;
  admin.channelCallbacks[0]({ event_id: 'admin-setup-change', type: 'RiderLocationSetupChanged', refill_request_id: null });
  assert.equal(admin.calls.length, beforeDuplicate);
  admin.calls.length = 0;
  admin.channelCallbacks[0]({ event_id: 'admin-void', type: 'SaleVoided', cart_id: 18, refill_request_id: null });
  assert.deepEqual(admin.calls.map((key) => Array.from(key)), [
    ['settlements', 'queue'], ['settlements', 'list'], ['settlements', 'draft', 18],
  ]);
  admin.calls.length = 0;
  admin.channelCallbacks[0]({ event_id: 'admin-recorded', type: 'SaleRecorded', cart_id: 18, refill_request_id: null });
  assert.deepEqual(admin.calls.map((key) => Array.from(key)), [
    ['settlements', 'queue'], ['settlements', 'list'], ['settlements', 'draft', 18],
  ]);
  admin.calls.length = 0;
  admin.channelCallbacks[0]({ event_id: 'admin-variance', type: 'SettlementVarianceFlagged', cart_id: 18, refill_request_id: null });
  assert.deepEqual(admin.calls.map((key) => Array.from(key)), [
    ['settlements', 'queue'], ['settlements', 'list'], ['settlements', 'draft', 18],
  ]);
  for (const type of ['CartCloseOutVarianceFlagged', 'RiderClosingRecorded', 'RiderClosingCorrected',
    'SettlementMethodVarianceFlagged', 'SettlementSelfApproved']) {
    admin.calls.length = 0;
    admin.channelCallbacks[0]({ event_id: `admin-${type}`, type, cart_id: 18, refill_request_id: null });
    assert.deepEqual(admin.calls.map((key) => Array.from(key)), [
      ['settlements', 'queue'], ['settlements', 'list'], ['settlements', 'draft', 18],
    ]);
  }

  for (const role of ['BARISTA', 'RIDER', 'STAFF', 'CONTENT_CREATOR']) {
    const app = mountRealtimeProvider(() => true, role);
    app.channelCallbacks[0]({ event_id: `void-${role}`, type: 'SaleVoided', cart_id: 18, refill_request_id: null });
    assert.equal(app.calls.some((key) => Array.isArray(key) && key[0] === 'settlements'), false, role);
  }
});
