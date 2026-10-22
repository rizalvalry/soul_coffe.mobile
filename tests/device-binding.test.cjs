const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

function load(path, modules, globals = {}) {
  const source = readFileSync(join(__dirname, '..', path), 'utf8');
  const javascript = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(javascript, {
    module, exports: module.exports, ...globals,
    require(name) {
      assert.ok(Object.hasOwn(modules, name), `unexpected import: ${name}`);
      return modules[name];
    },
  });
  return module.exports;
}

const identity = load('src/features/auth/device.ts', {
  'react-native': { Platform: { OS: 'android' } },
  'expo-application': { getAndroidId: () => 'android-id-1234' },
  'expo-constants': { __esModule: true, default: { nativeAppVersion: '1.5.9' } },
  'expo-device': { deviceName: 'HP Rider', modelName: 'Pixel 8', osVersion: '16' },
}).loginDeviceIdentity();

test('SDK 57 device identity includes Android ID, model, OS, and app version', () => {
  assert.equal(identity.device_id, 'android-id-1234');
  assert.equal(identity.device_name, 'HP Rider');
  assert.equal(identity.model, 'Pixel 8');
  assert.equal(identity.os_version, '16');
  assert.equal(identity.app_version, '1.5.9');
});

function auth(fetch) {
  return load('src/features/auth/api.ts', {
    'expo-constants': { __esModule: true, default: { expoConfig: { extra: { apiBaseUrl: 'http://localhost/api/v1' } } } },
    '@/domain/roles': { isRole: (role) => role === 'STAFF' },
    '@/features/demo/config': { isDemoMode: () => false },
    '@/features/demo/store': {},
    './device': { loginDeviceIdentity: () => identity },
  }, { fetch });
}

test('password and PIN login send the same device identity', async () => {
  const bodies = [];
  const api = auth(async (_url, options) => {
    bodies.push(JSON.parse(options.body));
    return { ok: true, status: 200, json: async () => ({ data: {
      token: 'token', user: { id: 1, name: 'Rider', role: 'STAFF' },
    } }) };
  });
  await api.login({ phone: '0811', password: 'secret' });
  await api.loginWithPin('0811', '482915');
  assert.equal(bodies.length, 2);
  for (const body of bodies) {
    assert.equal(body.device_id, 'android-id-1234');
    assert.equal(body.model, 'Pixel 8');
    assert.equal(body.os_version, '16');
    assert.equal(body.app_version, '1.5.9');
  }
});

test('DEVICE_PENDING from either login route is a dedicated auth outcome', async () => {
  const api = auth(async () => ({ status: 403, ok: false, json: async () => ({
    code: 'DEVICE_PENDING', message: 'HP baru perlu disetujui Administrator.',
  }) }));
  await assert.rejects(api.login({ phone: '0811', password: 'secret' }),
    (error) => error.kind === 'device-pending');
  await assert.rejects(api.loginWithPin('0811', '482915'),
    (error) => error.kind === 'device-pending');
});
