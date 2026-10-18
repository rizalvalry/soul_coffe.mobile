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
const { toAppNotification } = loadTs('src/lib/mappers.ts', {});
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
  assert.equal(routeFor({ type: 'SettlementVarianceFlagged' }, 'FINANCE'), '/finance/settlements');
  assert.equal(routeFor({ type: 'SettlementVarianceFlagged', refill_request_id: 3 }, 'MANAGEMENT'), '/finance/settlements');
});

test('variance links preserve a valid operating date and cart for the settlement screen', () => {
  const data = { type: 'SettlementVarianceFlagged', cart_id: 18, operating_date: '2026-10-16' };
  assert.equal(routeFor(data, 'FINANCE'), '/finance/settlements?date=2026-10-16&cart_id=18');
  const target = navigation.settlementTarget({ date: '2026-10-16', cart_id: '18' });
  assert.equal(target.date, '2026-10-16');
  assert.equal(target.cartId, 18);
});

test('invalid or hostile settlement params are omitted from the route', () => {
  assert.equal(routeFor({
    type: 'SettlementVarianceFlagged', cart_id: '18&screen=admin', operating_date: '2026-02-30',
  }, 'FINANCE'), '/finance/settlements');
  assert.equal(routeFor({ type: 'SettlementVarianceFlagged', cart_id: -2, operating_date: '2026-10-16' }, 'FINANCE'),
    '/finance/settlements?date=2026-10-16');
});

test('refill notifications open the relevant screen for each role', () => {
  for (const role of ['FINANCE', 'MANAGEMENT']) {
    assert.equal(routeFor({ type: 'RefillRequestSubmitted', refill_request_id: 4 }, role), '/finance/approvals');
  }
  assert.equal(routeFor({ type: 'RefillRequestApproved', refill_request_id: 4, status: 'APPROVED' }, 'BARISTA'), '/barista/requests');
  assert.equal(routeFor({ type: 'RefillPreparingStarted', refill_request_id: 4 }, 'BARISTA'), '/barista/preparing');
  assert.equal(routeFor({ type: 'RefillReadyToPick', refill_request_id: 4, status: 'READY_TO_PICK' }, 'RIDER'), '/rider/available');
  assert.equal(routeFor({ type: 'RefillPickedUp', refill_request_id: 4 }, 'RIDER'), '/rider/active');
  assert.equal(routeFor({ type: 'RefillRequestApproved', refill_request_id: 4 }, 'STAFF'), '/staff/requests/4');
  assert.equal(routeFor({ type: 'RefillReadyToPick', refill_request_id: 4, status: 'READY_TO_PICK' }, 'BARISTA'), '/barista/history');
  assert.equal(routeFor({ type: 'RefillDelivered', refill_request_id: 4, status: 'DELIVERED' }, 'RIDER'), '/rider/history');
  assert.equal(routeFor({ type: 'RefillRequestApproved', refill_request_id: '4&evil=1' }, 'STAFF'), null);
});

test('post-submission Finance notifications open history, including cancelled and expired requests', () => {
  for (const role of ['FINANCE', 'MANAGEMENT']) {
    for (const status of ['APPROVED', 'CANCELLED', 'EXPIRED', 'DELIVERED', 'PICKED_UP']) {
      assert.equal(routeFor({ type: 'RefillStatusChanged', refill_request_id: 4, status }, role), '/finance/history');
    }
  }
});

test('inbox mapping preserves incident status so push and inbox share role destinations', () => {
  for (const role of ['RIDER', 'FINANCE', 'MANAGEMENT']) {
    const payload = { type: 'DeliveryIncidentReported', refill_request_id: 4, status: 'PICKED_UP' };
    const notification = toAppNotification({
      id: 1, event_id: 'event-1', type: payload.type, title: 'Insiden', body: '', payload,
      read_at: null, created_at: '2026-10-18T10:00:00Z',
    });
    assert.equal(notification.status, 'PICKED_UP');
    assert.equal(routeFor(notification, role), routeFor(payload, role));
    assert.equal(routeFor(notification, role), role === 'RIDER' ? '/rider/active' : '/finance/history');
  }
  assert.match(readFileSync(join(__dirname, '..', 'app/(app)/notifications.tsx'), 'utf8'), /status: n\.status/);
});

test('attendance notifications never open Absen for roles without attendance', () => {
  for (const role of ['FINANCE', 'MANAGEMENT', 'RIDER', 'ADMINISTRATOR', 'CONTENT_CREATOR']) {
    for (const type of ['AttendanceClockedIn', 'StaffAttendanceWindowOpened']) {
      assert.equal(routeFor({ type }, role), '/menu');
    }
  }
  for (const role of ['BARISTA', 'STAFF']) {
    assert.equal(routeFor({ type: 'AttendanceClockedIn' }, role), '/absen');
  }
  assert.equal(routeFor({ type: 'NewsPostPublished' }, 'FINANCE'), '/news');
  assert.equal(routeFor({ type: 'UnknownEvent' }, 'FINANCE'), null);
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
