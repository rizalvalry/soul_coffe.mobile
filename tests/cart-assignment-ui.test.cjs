const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

function source(path) { return readFileSync(join(__dirname, '..', path), 'utf8'); }
function loadTs(path, modules, globals = {}) {
  const javascript = ts.transpileModule(source(path), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(javascript, { module, exports: module.exports, ...globals, require: (name) => {
    assert.ok(Object.hasOwn(modules, name), `unexpected import: ${name}`);
    return modules[name];
  } });
  return module.exports;
}

test('/me today_cart overrides a stale login cart and null removes it', async () => {
  let todayCart = null;
  const auth = loadTs('src/features/auth/api.ts', {
    'expo-constants': { expoConfig: { extra: { apiBaseUrl: 'http://localhost/api/v1' } } },
    '@/domain/roles': { isRole: (role) => role === 'STAFF' },
    '@/features/demo/config': { isDemoMode: () => false },
    '@/features/demo/store': {},
  }, { fetch: async () => ({ ok: true, json: async () => ({ data: {
    id: 7, name: 'Rider', role: 'STAFF', cart_id: 1, cart_code: '0001', today_cart: todayCart,
  } }) }) });

  const before = await auth.fetchCurrentUser('token', 'STAFF');
  assert.equal(before.cartId, undefined);
  todayCart = { id: 4, code: '0004', assigned_at: '2026-10-18T18:56:00+07:00' };
  const after = await auth.fetchCurrentUser('token', 'STAFF');
  assert.equal(after.cartId, 4);
  assert.equal(after.cartCode, '0004');
  assert.equal(after.todayCart.assignedAt, todayCart.assigned_at);
});

test('refill form refreshes /me on focus and offers the new no-cart copy and retry', () => {
  for (const path of ['app/(app)/staff/refill/new.tsx']) {
    const file = source(path);
    assert.match(file, /useFocusEffect\(useCallback\(\(\) => \{\s*void refreshUser\(\)/);
    assert.match(file, /cartRefreshStatus === 'loading' \? 'Lagi cek gerobak kamu\.\.\.' : NO_CART_TODAY_MESSAGE/);
    assert.match(file, /cartRefreshStatus === 'error'/);
    assert.match(file, /label="Coba lagi"[^\r\n]*refreshUser\(\)/);
    assert.match(file, /user\?\.cartId/);
  }
});

test('Closing reads the current cart from its server draft', () => {
  assert.match(source('app/(app)/staff/closing.tsx'), /useClosingDraft\(\)/);
  assert.match(source('src/features/closing/queries.ts'), /request<ClosingDraft>\('\/me\/closing\/draft'\)/);
});

test('Absen has a back button for loading, error, and ready states', () => {
  const file = source('app/(app)/absen.tsx');
  assert.equal((file.match(/<IconButton icon="chevron-left" label="Kembali"/g) ?? []).length, 3);
});

test('Add Stock lets Produksi move a Rider to another cart with a visible warning', () => {
  const file = source('app/(app)/barista/add-stock.tsx');
  assert.match(file, /selectedStaff\.assigned_cart_id !== cartId/);
  assert.match(file, /Add Stock ini bakal memindahkan rider/);
  assert.doesNotMatch(file, /!staffConflict/);
});

test('Absen tile subtitles track Rider and Produksi attendance status', () => {
  const { attendanceTileSubtitle: subtitle } = loadTs('src/features/showcase/attendanceTile.ts', {});
  assert.equal(subtitle('STAFF', { has_clocked_in: false, staff_window_open: true }), 'Absen sudah dibuka, yuk absen');
  assert.equal(subtitle('STAFF', { has_clocked_in: true, staff_window_open: true }), 'Kamu sudah absen');
  assert.equal(subtitle('BARISTA', { has_clocked_in: false }), 'Yuk absen dulu');
  assert.equal(subtitle('BARISTA', { has_clocked_in: true, staff_window_open: false }), 'Kamu sudah absen, buka absen Rider');
});
