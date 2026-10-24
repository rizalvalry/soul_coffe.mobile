const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

function load(file, modules) {
  const input = readFileSync(join(__dirname, '..', file), 'utf8');
  const code = ts.transpileModule(input, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true,
  } }).outputText;
  const state = { exports: {} };
  vm.runInNewContext(code, { module: state, exports: state.exports, require: (name) => {
    assert.ok(Object.hasOwn(modules, name), `unexpected import: ${name}`);
    return modules[name];
  } });
  return state.exports;
}

function stateHooks() {
  const values = [];
  const refs = [];
  let stateIndex = 0;
  let refIndex = 0;
  return {
    react: {
      useCallback: (callback) => callback,
      useEffect: () => {},
      useRef: (initial) => refs[refIndex++] ??= { current: initial },
      useState: (initial) => {
        const index = stateIndex++;
        if (!(index in values)) values[index] = typeof initial === 'function' ? initial() : initial;
        return [values[index], (next) => {
          values[index] = typeof next === 'function' ? next(values[index]) : next;
        }];
      },
    },
    reset: () => { stateIndex = 0; refIndex = 0; },
  };
}

test('login controller keeps PIN fallback, each device denial, and the menu destination', async () => {
  const hooks = stateHooks();
  const routes = [];
  const signIns = [];
  let outcome = { result: 'device-pending', message: 'Menunggu' };
  let pinOutcome = { result: 'device-rejected', message: 'Ditolak' };
  const controller = load('src/features/auth/useLoginController.ts', {
    react: hooks.react,
    'expo-router': { useRouter: () => ({ replace: (path) => routes.push(path) }) },
    'react-hook-form': { useForm: () => ({ control: {}, handleSubmit: (fn) => fn, formState: {} }) },
    '@/lib/zodResolver': { zodResolver: () => () => {} },
    '@/features/auth/store': { useAuth: (select) => select
      ? select({ lastPhone: '081234567890', pinAvailable: true })
      : { signIn: async (body) => { signIns.push(body); return outcome; },
        signInWithPin: async (phone, pin) => { signIns.push({ phone, pin }); return pinOutcome; },
        signInAsDemo: async () => true, submitting: false, error: null, clearError() {} } },
    '@/features/auth/schema': { loginSchema: {}, normalisePhone: () => '+6281234567890' },
  }).useLoginController;
  const render = () => { hooks.reset(); return controller(); };

  let view = render();
  assert.equal(view.mode, 'pin');
  await view.onSubmit({ phone: '081234567890', password: 'password' });
  assert.deepEqual(JSON.parse(JSON.stringify(signIns[0])), { phone: '+6281234567890', password: 'password' });
  assert.equal(render().deviceNotice, 'Menunggu');
  assert.deepEqual(routes, []);

  outcome = { result: 'device-rejected', message: 'Ditolak' };
  await render().onSubmit({ phone: '081234567890', password: 'password' });
  assert.equal(render().deviceNotice, 'Ditolak');
  outcome = { result: 'device-update-required', message: 'Perbarui' };
  await render().onSubmit({ phone: '081234567890', password: 'password' });
  assert.equal(render().deviceNotice, 'Perbarui');

  outcome = { result: 'pin-required', message: 'Pakai PIN' };
  await render().onSubmit({ phone: '081234567890', password: 'password' });
  view = render();
  assert.equal(view.mode, 'pin');
  assert.equal(view.notice, 'Pakai PIN');
  view.setPin('123');
  await render().onPinSubmit();
  assert.equal(render().pinError, 'PIN harus terdiri dari 6 angka.');
  view = render();
  view.setPin('123456');
  await render().onPinSubmit();
  assert.equal(render().deviceNotice, 'Ditolak');
  assert.deepEqual(JSON.parse(JSON.stringify(signIns.at(-1))), { phone: '081234567890', pin: '123456' });
  pinOutcome = { result: 'pin-not-set', message: 'Reset' };
  await render().onPinSubmit();
  assert.equal(render().mode, 'password');
  assert.equal(render().notice, 'Reset');
  outcome = { result: 'ok' };
  await render().onSubmit({ phone: '081234567890', password: 'password' });
  pinOutcome = { result: 'ok' };
  view = render();
  view.setPin('123456');
  await render().onPinSubmit();
  for (const role of ['STAFF', 'RIDER', 'BARISTA', 'FINANCE', 'ADMINISTRATOR', 'CONTENT_CREATOR']) {
    await render().onDemo(role);
  }
  assert.deepEqual(routes, Array(8).fill('/menu'));
});

test('settings controller confirms PIN writes and ends only the revoked session', async () => {
  const hooks = stateHooks();
  const alerts = [];
  const trace = [];
  const user = { name: 'Rider', role: 'STAFF', hasLoginPin: false };
  const controller = load('src/features/auth/useSettingsController.ts', {
    react: hooks.react,
    'react-native': { Alert: { alert: (...args) => alerts.push(args) } },
    'expo-router': { useRouter: () => ({ replace: (path) => trace.push(['route', path]) }) },
    '@/features/auth/store': { useAuth: (select) => select({
      session: { token: 'test-token', user }, pinAvailable: false,
      setPinAvailable: async (available) => { trace.push(['pinAvailable', available]); },
      endRevokedSession: async () => { trace.push(['endRevokedSession']); },
    }) },
    '@/features/auth/api': {
      AuthError: class AuthError extends Error {},
      setLoginPin: async (...args) => { trace.push(['create', ...args]); },
      removeLoginPin: async (...args) => { trace.push(['remove', ...args]); },
    },
  }).useSettingsController;
  const render = () => { hooks.reset(); return controller(); };
  let view = render();
  view.save();
  assert.equal(render().error, 'PIN harus terdiri dari 6 angka.');
  view = render();
  view.setPin('123456');
  view.setConfirmPin('123456');
  view.setPassword('password');
  render().save();
  assert.equal(alerts[0][0], 'Buat PIN masuk?');
  assert.equal(alerts[0][1], 'Setelah disimpan:\n\n' +
    '• Anda akan dikeluarkan dari aplikasi di semua perangkat.\n' +
    '• Masuk berikutnya memakai PIN ini, bukan kata sandi.\n' +
    '• Jika PIN lupa, hanya Administrator yang bisa memulihkan akses lewat menu "Lupa PIN".');
  assert.equal(alerts[0][2][0].text, 'Batal');
  assert.equal(alerts[0][2][1].text, 'Buat PIN');
  assert.deepEqual(trace, []);
  alerts[0][2][1].onPress();
  await new Promise(setImmediate);
  assert.deepEqual(trace, [['create', 'test-token', '123456', 'password'], ['pinAvailable', true]]);
  assert.equal(alerts[1][0], 'PIN aktif — silakan masuk kembali');
  assert.equal(alerts[1][1], 'Semua sesi telah dikeluarkan. Masuk lagi sekarang menggunakan PIN yang baru Anda buat, ' +
    'supaya Anda yakin PIN-nya benar. Mulai sekarang kata sandi tidak lagi dipakai untuk masuk.');
  assert.deepEqual(JSON.parse(JSON.stringify(alerts[1][3])), { cancelable: false });
  alerts[1][2][0].onPress();
  await new Promise(setImmediate);
  assert.deepEqual(trace.slice(2), [['endRevokedSession'], ['route', '/login']]);

  user.hasLoginPin = true;
  view = render();
  view.setPassword('password');
  render().confirmRemove();
  assert.equal(alerts[2][0], 'Hapus PIN?');
  assert.equal(alerts[2][1], 'Setelah dihapus, Anda masuk kembali menggunakan nomor HP dan kata sandi. Sesi yang sedang berjalan tidak terputus.');
  assert.equal(alerts[2][2][1].style, 'destructive');
  alerts[2][2][1].onPress();
  await new Promise(setImmediate);
  assert.deepEqual(trace.slice(4), [['remove', 'test-token', 'password'], ['pinAvailable', false]]);
  assert.equal(trace.filter(([kind]) => kind === 'endRevokedSession').length, 1);
  assert.equal(render().notice, 'PIN dihapus. Masuk berikutnya memakai kata sandi.');
});

test('notification controller only marks unread rows and routes with the current role', () => {
  const trace = [];
  const rows = [{ id: 7, read_at: null, type: 'NewsPostPublished', status: null,
    refill_request_id: null }, { id: 8, read_at: '2026-10-24', type: 'SettlementVarianceFlagged', status: null,
    refill_request_id: null }];
  const view = load('src/features/push/useNotificationsController.ts', {
    'expo-router': { useRouter: () => ({ push: (path) => trace.push(['push', path]) }) },
    '@/features/refill/queries': {
      useNotifications: () => ({ data: rows }),
      useMarkNotificationRead: () => ({ mutate: (id) => trace.push(['read', id]) }),
      useMarkAllNotificationsRead: () => ({ mutate: () => trace.push(['readAll']) }),
    },
    '@/features/push/usePushNotifications': { routeFor: (data, role, abilities, isSuperAdmin) => {
      trace.push(['routeFor', data.type, role, abilities, isSuperAdmin]);
      return data.type === 'NewsPostPublished' ? '/news' : '/finance/settlements';
    } },
    '@/features/auth/store': { useAuth: (select) => select({ session: { user: {
      role: 'FINANCE', abilities: { settlements: ['view'] }, isSuperAdmin: false,
    } } }) },
  }).useNotificationsController();
  assert.equal(view.unread, 1);
  view.open(rows[0]);
  view.open(rows[1]);
  view.markAllRead.mutate();
  assert.deepEqual(JSON.parse(JSON.stringify(trace)), [
    ['read', 7], ['routeFor', 'NewsPostPublished', 'FINANCE', { settlements: ['view'] }, false],
    ['push', '/news'],
    ['routeFor', 'SettlementVarianceFlagged', 'FINANCE', { settlements: ['view'] }, false],
    ['push', '/finance/settlements'], ['readAll'],
  ]);
});

test('news detail controller marks only an unread opened article, without a polling timer', () => {
  const effects = [];
  const reads = [];
  let post = { id: 13, is_read: false };
  let requestedId = null;
  const controller = load('src/features/news/useNewsDetailController.ts', {
    react: { useEffect: (effect, deps) => effects.push({ effect, deps }) },
    'expo-router': { useLocalSearchParams: () => ({ id: '13' }) },
    '@/features/news/queries': {
      useNewsPost: (id) => { requestedId = id; return { data: post }; },
      useMarkNewsRead: () => ({ mutate: (id) => reads.push(id) }),
      useReactToNews: () => ({ mutate() {} }),
    },
  }).useNewsDetailController;
  assert.equal(controller().post.id, 13);
  assert.equal(requestedId, 13);
  assert.deepEqual(JSON.parse(JSON.stringify(effects[0].deps)), [13]);
  effects[0].effect();
  assert.deepEqual(reads, [13]);
  post = { id: 13, is_read: true };
  controller();
  effects[1].effect();
  assert.deepEqual(reads, [13]);
});
