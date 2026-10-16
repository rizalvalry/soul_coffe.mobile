const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

function mountRealtimeProvider(claimEvent = () => true) {
  const source = readFileSync(join(__dirname, '..', 'src/features/realtime/RealtimeProvider.tsx'), 'utf8');
  const javascript = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;

  const effects = [];
  const connectionCallbacks = new Map();
  const channelCallbacks = [];
  const calls = [];
  let appStateCallback;
  let refillInvalidations = 0;
  const client = { invalidateQueries: (filter) => { calls.push(filter?.queryKey ?? 'all'); return Promise.resolve(); } };
  const session = { token: 'test-token', user: { id: '7', role: 'STAFF', cartId: 1 } };
  const react = {
    createContext: () => ({ Provider: () => null }),
    useContext: () => null,
    useEffect: (effect) => effects.push(effect),
    useRef: (value) => ({ current: value }),
    useState: (value) => [value, () => {}],
  };
  class Echo {
    connector = { pusher: { connection: { bind: (event, callback) => connectionCallbacks.set(event, callback) } } };
    private() { return { listen: (_event, callback) => channelCallbacks.push(callback) }; }
    leave() {}
    disconnect() {}
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
    '@/features/auth/store': { useAuth: (selector) => selector({ session }) },
    '@/lib/api': { apiBaseUrl: () => 'http://localhost' },
    '@/features/refill/queries': {
      invalidateRefillData: () => { refillInvalidations++; },
      qk: { myStock: ['me', 'stock'], kitchenStock: ['kitchen', 'stock'], allocationsToday: ['allocations', 'today'] },
    },
    '@/features/showcase/queries': { showcaseKeys: { absenStatus: ['absen', 'status'], stock: ['showcase', 'stock'], staff: ['showcase', 'staff'] } },
    './seen': { claimEvent },
  };
  const module = { exports: {} };
  vm.runInNewContext(javascript, { module, exports: module.exports, require: (name) => {
    assert.ok(Object.hasOwn(modules, name), `unexpected import: ${name}`);
    return modules[name];
  } });
  module.exports.RealtimeProvider({ children: null });
  effects.forEach((effect) => effect());
  return { calls, channelCallbacks, connectionCallbacks, appState: (state) => appStateCallback(state), refillInvalidations: () => refillInvalidations };
}

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
  assert.deepEqual(app.calls, ['all']);
  app.appState('active');
  assert.deepEqual(app.calls, ['all']);
  app.appState('inactive');
  app.appState('active');
  assert.deepEqual(app.calls, ['all', 'all']);
  app.appState('active');
  assert.deepEqual(app.calls, ['all', 'all']);
});

test('existing stock and sale events refresh their affected query families', () => {
  const app = mountRealtimeProvider();
  const cases = [
    ['ShowcaseBrewed', ['showcase/stock', 'me/stock', 'kitchen/stock']],
    ['CartStockHandedOver', ['showcase/stock', 'showcase/staff', 'showcase/allowance', 'allocations/today']],
    ['CartClosedOut', ['showcase/stock', 'settlements']],
    ['SaleVoided', ['settlements']],
    ['SaleFlaggedSuspect', ['settlements']],
  ];
  for (const [type, expectedKeys] of cases) {
    app.calls.length = 0;
    app.channelCallbacks[0]({ event_id: type, type, refill_request_id: null });
    const keys = app.calls.map((key) => Array.isArray(key) ? key.join('/') : key);
    for (const expected of expectedKeys) assert.ok(keys.includes(expected), `${type} missed ${expected}`);
  }
});
