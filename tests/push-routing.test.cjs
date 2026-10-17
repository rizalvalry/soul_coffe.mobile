const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

function loadTs(path, modules) {
  const source = readFileSync(join(__dirname, '..', path), 'utf8');
  const javascript = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(javascript, {
    module, exports: module.exports,
    require: (name) => {
      assert.ok(Object.hasOwn(modules, name), `unexpected import: ${name}`);
      return modules[name];
    },
  });
  return module.exports;
}

const navigation = loadTs('src/features/settlements/navigation.ts', {});
const { routeFor } = loadTs('src/features/push/usePushNotifications.ts', {
  react: {},
  'react-native': {},
  'expo-router': {},
  'expo-notifications': { setNotificationHandler() {} },
  '@tanstack/react-query': {},
  '@/features/auth/store': {},
  '@/features/refill/queries': {},
  '@/features/showcase/queries': {},
  '@/features/realtime/seen': {},
  '@/features/settlements/navigation': navigation,
  '@/features/settlements/queries': {},
  './registration': {},
});

test('variance push and inbox notifications open Finance settlements', () => {
  assert.equal(routeFor({ type: 'SettlementVarianceFlagged' }), '/finance/settlements');
  assert.equal(routeFor({ type: 'SettlementVarianceFlagged', refill_request_id: 3 }), '/finance/settlements');
});

test('variance links preserve a valid operating date and cart for the settlement screen', () => {
  const data = { type: 'SettlementVarianceFlagged', cart_id: 18, operating_date: '2026-10-16' };
  assert.equal(routeFor(data), '/finance/settlements?date=2026-10-16&cart_id=18');
  const target = navigation.settlementTarget({ date: '2026-10-16', cart_id: '18' });
  assert.equal(target.date, '2026-10-16');
  assert.equal(target.cartId, 18);
});

test('invalid or hostile settlement params are omitted from the route', () => {
  assert.equal(routeFor({
    type: 'SettlementVarianceFlagged', cart_id: '18&screen=admin', operating_date: '2026-02-30',
  }), '/finance/settlements');
  assert.equal(routeFor({ type: 'SettlementVarianceFlagged', cart_id: -2, operating_date: '2026-10-16' }),
    '/finance/settlements?date=2026-10-16');
});

test('existing notification routes retain their destinations', () => {
  assert.equal(routeFor({ type: 'RefillRequestApproved', refill_request_id: 4 }), '/staff/requests/4');
  assert.equal(routeFor({ type: 'AttendanceClockedIn' }), '/absen');
  assert.equal(routeFor({ type: 'NewsPostPublished' }), '/news');
  assert.equal(routeFor({ type: 'UnknownEvent' }), null);
});

function mountPushHook(role, response) {
  const effects = [];
  const pushes = [];
  const settlementRefreshes = [];
  const attendanceRefreshes = [];
  let received;
  let cleared = 0;
  const notifications = {
    setNotificationHandler() {},
    useLastNotificationResponse: () => response,
    clearLastNotificationResponse: () => { cleared++; },
    addPushTokenListener: () => ({ remove() {} }),
    addNotificationReceivedListener: (callback) => {
      received = callback;
      return { remove() {} };
    },
  };
  const { usePushNotifications } = loadTs('src/features/push/usePushNotifications.ts', {
    react: { useEffect: (effect) => effects.push(effect), useRef: (value) => ({ current: value }) },
    'react-native': { AppState: { addEventListener: () => ({ remove() {} }) } },
    'expo-router': { useRouter: () => ({ push: (target) => pushes.push(target) }) },
    'expo-notifications': notifications,
    '@tanstack/react-query': { useQueryClient: () => ({ invalidateQueries: ({ queryKey }) => {
      attendanceRefreshes.push(queryKey.join('/'));
      return Promise.resolve();
    } }) },
    '@/features/auth/store': { useAuth: (selector) => selector({ session: { user: { role } } }) },
    '@/features/refill/queries': { invalidateRefillData() {} },
    '@/features/showcase/queries': { showcaseKeys: { absenStatus: ['absen', 'status'] } },
    '@/features/realtime/seen': { claimEvent: () => true },
    '@/features/settlements/navigation': navigation,
    '@/features/settlements/queries': { invalidateSettlementData: (_client, cartId) => settlementRefreshes.push(cartId) },
    './registration': { syncRegistration: () => Promise.resolve() },
  });
  usePushNotifications();
  effects.forEach((effect) => effect());
  return { pushes, settlementRefreshes, attendanceRefreshes, received: (notification) => received(notification), cleared: () => cleared };
}

test('foreground attendance push refreshes Rider day gate without Pusher', () => {
  const staff = mountPushHook('STAFF', null);
  staff.received({ request: { content: { data: { type: 'StaffAttendanceWindowOpened' } } } });
  assert.deepEqual(staff.attendanceRefreshes, ['absen/status']);
});

test('a variance tap that launched the app routes after Finance signs in and clears the response', () => {
  const response = { notification: { request: { content: { data: {
    type: 'SettlementVarianceFlagged', cart_id: '18', operating_date: '2026-10-16',
  } } } } };
  const app = mountPushHook('FINANCE', response);
  assert.deepEqual(app.pushes, ['/finance/settlements?date=2026-10-16&cart_id=18']);
  assert.equal(app.cleared(), 1);
});

test('a stale variance tap is not routed for an unrelated signed-in role', () => {
  const response = { notification: { request: { content: { data: { type: 'SettlementVarianceFlagged' } } } } };
  const app = mountPushHook('STAFF', response);
  assert.deepEqual(app.pushes, []);
  assert.equal(app.cleared(), 1);
});

test('a foreground variance push refreshes Finance settlement data when the socket is unavailable', () => {
  const finance = mountPushHook('FINANCE', null);
  finance.received({ request: { content: { data: { type: 'SettlementVarianceFlagged', cart_id: '18' } } } });
  assert.deepEqual(finance.settlementRefreshes, [18]);
  const staff = mountPushHook('STAFF', null);
  staff.received({ request: { content: { data: { type: 'SettlementVarianceFlagged', cart_id: '18' } } } });
  assert.deepEqual(staff.settlementRefreshes, []);
});
