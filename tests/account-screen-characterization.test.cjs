const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { existsSync, readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const root = join(__dirname, '..');
const source = (file) => readFileSync(join(root, file), 'utf8');
const plain = (value) => JSON.parse(JSON.stringify(value));
const combined = (screen, controller) => source(screen) + '\n' +
  (existsSync(join(root, controller)) ? source(controller) : '');

function load(file, modules, globals = {}) {
  const code = ts.transpileModule(source(file), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true,
    jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  const state = { exports: {} };
  vm.runInNewContext(code, { module: state, exports: state.exports,
    require: (name) => {
      assert.ok(Object.hasOwn(modules, name), `unexpected import: ${name}`);
      return modules[name];
    }, ...globals });
  return state.exports;
}

// Freeze the actual JSX source before extraction. Controller calls and imports are outside these
// nodes, so moving logic can never silently change element order, copy, props, or style expressions.
function jsxDigest(file) {
  const input = source(file);
  const ast = ts.createSourceFile(file, input, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const parts = [];
  function visit(node) {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node) ||
      ts.isJsxClosingElement(node) || ts.isJsxText(node) || ts.isJsxExpression(node)) {
      parts.push(node.getText(ast));
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  return createHash('sha256').update(parts.join('\n')).digest('hex');
}

test('four screen JSX trees retain their pre-extraction elements, props, copy, and expressions', () => {
  assert.deepEqual({
    login: jsxDigest('app/(auth)/login.tsx'),
    notifications: jsxDigest('app/(app)/notifications.tsx'),
    settings: jsxDigest('app/(app)/settings.tsx'),
    news: jsxDigest('app/(app)/news/[id].tsx'),
  }, {
    login: 'abe78e4365569cfab97a6bf676021398d3c30d617566a4ce9af6c7fb4c3d954c',
    notifications: '21e9a1978578bc1f99b065dee13f9cfc5900134fc29dd96f4a5e48bb26b220d4',
    settings: '5ebd9f819fceab7d19270fa3591043551a7fa973feeae60dd443453e2ff518d7',
    news: 'd818407b7b666f29be3686daaac5643fff1a40d4a14c70570f3fd0f4ef55aa37',
  });
});

test('login schema accepts the three local phone forms and rejects invalid phone/password', () => {
  const { loginSchema, normalisePhone } = load('src/features/auth/schema.ts', { zod: require('zod') });
  for (const phone of ['081234567890', '6281234567890', '+6281234567890']) {
    assert.equal(loginSchema.safeParse({ phone, password: 'secret123' }).success, true);
    assert.equal(normalisePhone(phone), '+6281234567890');
  }
  assert.equal(loginSchema.safeParse({ phone: '123', password: 'secret123' }).success, false);
  assert.equal(loginSchema.safeParse({ phone: '081234567890', password: 'short' }).success, false);
});

test('login PIN and device outcomes retain their route and fallback decisions', () => {
  const code = combined('app/(auth)/login.tsx', 'src/features/auth/useLoginController.ts');
  assert.match(code, /pinAvailable && lastPhone \? 'pin' : 'password'/);
  assert.match(code, /if \(pinAvailable && lastPhone\)[\s\S]*?setMode\('pin'\)/);
  assert.match(code, /resolver: zodResolver\(loginSchema\)/);
  assert.match(code, /phone: normalisePhone\(values\.phone\)/);
  assert.match(code, /if \(outcome\.result === 'ok'\)\s*\{\s*router\.replace\('\/menu'\)/);
  assert.match(code, /'device-pending'[\s\S]*?'device-rejected'[\s\S]*?'device-update-required'/);
  assert.match(code, /setDeviceNotice\(outcome\.message\)/);
  assert.match(code, /outcome\.result === 'pin-required'[\s\S]*?setMode\('pin'\)/);
  assert.match(code, /if \(!lastPhone\)[\s\S]*?setPinError\('Masuk sekali dengan kata sandi terlebih dahulu di perangkat ini\.'\)/);
  assert.match(code, /if \(pin\.length !== 6\)[\s\S]*?setPinError\('PIN harus terdiri dari 6 angka\.'\)/);
  assert.match(code, /signInWithPin\(lastPhone, pin\)/);
  assert.match(code, /outcome\.result === 'pin-not-set'[\s\S]*?setMode\('password'\)/);
  assert.match(code, /if \(ok\) router\.replace\('\/menu'\)/);
});

test('inbox mark read/all POST bodies stay empty; routing still covers each event family', async () => {
  const calls = [];
  const query = load('src/features/refill/queries.ts', {
    react: { useRef: (value) => ({ current: value }) },
    '@tanstack/react-query': { useMutation: (options) => options,
      useQueryClient: () => ({ invalidateQueries() {} }) },
    '@/lib/api': { request: async (path, options) => { calls.push({ path, options }); },
      uuidv4: () => 'unused' },
    '@/lib/image': {}, '@/features/showcase/kitchenSelection': {}, '@/lib/mappers': {},
  });
  await query.useMarkNotificationRead().mutationFn(17);
  await query.useMarkAllNotificationsRead().mutationFn();
  assert.deepEqual(plain(calls), [
    { path: '/notifications/17/read', options: { method: 'POST' } },
    { path: '/notifications/read-all', options: { method: 'POST' } },
  ]);

  const route = load('src/features/push/usePushNotifications.ts', {
    react: {}, 'react-native': {}, 'expo-router': {},
    'expo-notifications': { setNotificationHandler() {} }, '@tanstack/react-query': {},
    '@/features/auth/store': {}, '@/features/refill/queries': {},
    '@/features/showcase/queries': {}, '@/features/realtime/seen': {},
    '@/features/settlements/navigation': {
      settlementRoute: () => '/finance/settlements', settlementTarget: () => ({ date: '2026-10-24' }),
    },
    '@/features/settlements/queries': {}, '@/features/settlements/rider': {},
    './registration': {},
  }).routeFor;
  assert.deepEqual(plain([
    route({ type: 'RefillRequestSubmitted', refill_request_id: 8, status: 'SUBMITTED' }, 'FINANCE'),
    route({ type: 'RefillPreparingStarted', refill_request_id: 8, status: 'PREPARING' }, 'BARISTA'),
    route({ type: 'RefillPickedUp', refill_request_id: 8, status: 'PICKED_UP' }, 'RIDER'),
    route({ type: 'RefillDelivered', refill_request_id: 8, status: 'DELIVERED' }, 'STAFF'),
    route({ type: 'SettlementRecorded' }, 'STAFF'),
    route({ type: 'SettlementVarianceFlagged' }, 'FINANCE'),
    route({ type: 'RiderLocationSetupMissing' }, 'ADMINISTRATOR'),
    route({ type: 'AccountingPeriodReopened' }, 'FINANCE'),
    route({ type: 'AttendanceClockedIn' }, 'BARISTA'),
    route({ type: 'NewsPostPublished' }, 'STAFF'),
    route({ type: 'PinResetRequested' }, 'STAFF'),
    route({ type: 'unrecognized' }, 'STAFF'),
  ]), [
    '/finance/approvals', '/barista/preparing', '/rider/active', '/staff/requests/8',
    '/staff/settlement?operating_date=2026-10-24', '/finance/settlements',
    '/management/rider-location-setup', '/menu', '/absen', '/news', '/menu', null,
  ]);
  const inbox = combined('app/(app)/notifications.tsx', 'src/features/push/useNotificationsController.ts');
  assert.match(inbox, /if \(!n\.read_at\) markRead\.mutate\(n\.id\)/);
  assert.match(inbox, /routeFor\(\{ refill_request_id: n\.refill_request_id, type: n\.type, status: n\.status \}/);
  assert.match(inbox, /if \(target\) router\.push\(target as Href\)/);
});

test('PIN create/remove keep exact request bodies and revoked-session confirmation', async () => {
  const calls = [];
  const api = load('src/features/auth/api.ts', {
    'expo-constants': { __esModule: true, default: { expoConfig: { extra: { apiBaseUrl: 'http://127.0.0.1' } } } },
    '@/domain/roles': {}, '@/features/demo/config': { isDemoMode: () => false },
    '@/features/demo/store': {}, './device': {},
  }, { fetch: async (url, options) => { calls.push({ url, options }); return { ok: true }; } });
  await api.setLoginPin('test-token', '123456', 'password');
  await api.removeLoginPin('test-token', 'password');
  assert.deepEqual(plain(calls.map(({ url, options }) => ({ url, method: options.method,
    body: JSON.parse(options.body) }))), [
    { url: 'http://127.0.0.1/me/login-pin', method: 'POST', body: { pin: '123456', password: 'password' } },
    { url: 'http://127.0.0.1/me/login-pin', method: 'DELETE', body: { password: 'password' } },
  ]);
  const settings = combined('app/(app)/settings.tsx', 'src/features/auth/useSettingsController.ts');
  assert.match(settings, /await setLoginPin\(session\.token, pin, password\);[\s\S]*?await setPinAvailable\(true\)/);
  assert.match(settings, /await endRevokedSession\(\);[\s\S]*?router\.replace\('\/login'\)/);
  assert.match(settings, /cancelable: false/);
  assert.match(settings, /hasPin \? 'Ganti PIN masuk\?' : 'Buat PIN masuk\?'/);
  assert.match(settings, /await removeLoginPin\(session\.token, password\);[\s\S]*?await setPinAvailable\(false\)/);
  assert.match(settings, /Sesi yang sedang berjalan tidak terputus\./);
});

test('news read receipt POST is bodyless, reaction body is exact, and detail never polls', async () => {
  const calls = [];
  const query = load('src/features/news/queries.ts', {
    '@tanstack/react-query': { useMutation: (options) => options,
      useQueryClient: () => ({ invalidateQueries() {}, setQueryData() {} }) },
    '@/lib/api': { request: async (path, options) => { calls.push({ path, options }); } },
  });
  await query.useMarkNewsRead().mutationFn(13);
  await query.useReactToNews().mutationFn({ id: 13, reaction: 'mantap' });
  assert.deepEqual(plain(calls), [
    { path: '/news/13/read', options: { method: 'POST' } },
    { path: '/news/13/react', options: { method: 'POST', body: { reaction: 'mantap' } } },
  ]);
  const news = combined('app/(app)/news/[id].tsx', 'src/features/news/useNewsDetailController.ts');
  assert.match(news, /if \(post && !post\.is_read\) markRead\.mutate\(post\.id\)/);
  assert.match(news, /\[post\?\.id\]/);
  assert.match(news, /react\.mutate\(\{ id: post\.id, reaction \}\)/);
  assert.doesNotMatch(news, /setInterval|refetchInterval/);
});
