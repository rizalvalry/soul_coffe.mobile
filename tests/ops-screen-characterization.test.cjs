const assert = require('node:assert/strict');
const { existsSync, readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const root = join(__dirname, '..');
const source = (file) => readFileSync(join(root, file), 'utf8');
const logic = (screen, controller) => source(screen) +
  (existsSync(join(root, controller)) ? source(controller) : '');
const plain = (value) => JSON.parse(JSON.stringify(value));

function load(file, modules = {}) {
  const code = ts.transpileModule(source(file), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true,
  } }).outputText;
  const state = { exports: {} };
  vm.runInNewContext(code, { module: state, exports: state.exports, require: (name) => {
    assert.ok(Object.hasOwn(modules, name), `unexpected import: ${name}`);
    return modules[name];
  } });
  return state.exports;
}

test('Absen sends exact optional GPS body and the same attendance status gates the Rider menu', async () => {
  const sent = [];
  const queries = load('src/features/showcase/queries.ts', {
    '@tanstack/react-query': { useMutation: (options) => options,
      useQueryClient: () => ({ invalidateQueries: () => {} }) },
    '@/lib/api': { request: async (path, options) => { sent.push({ path, options }); return {}; } },
    '@/features/showcase/kitchenSelection': { useKitchenSelection: () => null },
    '@/features/showcase/operationKey': { kitchenOperationKey: () => ({}) },
    '@/features/refill/queries': { qk: {} },
    '@/lib/mappers': { toStockRow: (row) => row },
  });
  await queries.useClockIn().mutationFn(null);
  await queries.useClockIn().mutationFn({ lat: -6.2, lng: 106.8 });
  assert.deepEqual(plain(sent), [
    { path: '/absen', options: { method: 'POST', body: {} } },
    { path: '/absen', options: { method: 'POST', body: { gps_lat: -6.2, gps_lng: 106.8 } } },
  ]);
  const gate = load('src/features/showcase/riderDayGate.ts', {
    '@/lib/api': { ApiError: Error },
  }).riderDayGate;
  assert.deepEqual(['closed', 'attendance', 'ready'], [
    gate({ staff_window_open: false, has_clocked_in: false }),
    gate({ staff_window_open: true, has_clocked_in: false }),
    gate({ staff_window_open: true, has_clocked_in: true }),
  ]);
  const absen = logic('app/(app)/absen.tsx', 'src/features/showcase/useAbsenController.ts');
  assert.match(absen, /useAttendanceStatus\(canAttend \|\| canOpenKitchen\)/);
  assert.match(absen, /clockIn\.mutateAsync\(current \? \{ lat: current\.lat, lng: current\.lng \} : null\)/);
  assert.match(source('src/features/navigation/useHomeController.ts'), /riderDayGate\(attendance\.data\)/);
});

test('Closing keeps integer totals, hydrates the draft, syncs the offline queue, and reuses retry identity', () => {
  const calc = load('src/features/closing/calculation.ts').closingTotals;
  const lines = [{ product_id: 3, qty_in: 6, qty_carry: 2,
    qty_office_sold: 1, unit_price_minor: 17000 }];
  assert.deepEqual(plain(calc(lines, { 3: 2 }, { 3: 1 }, 17000, 0)), {
    valid: true, cupsSold: 4, soldByProduct: { 3: 4 }, total: 68000, cash: 51000,
  });
  assert.equal(calc(lines, { 3: 2.5 }, { 3: 1 }, 0, 0).valid, false);
  const code = logic('app/(app)/staff/closing.tsx', 'src/features/closing/useClosingController.ts');
  assert.match(code, /hydratedForm\.current = formSignature/);
  assert.match(code, /line\.qty_in \+ line\.qty_carry - line\.qty_office_sold/);
  assert.ok(code.indexOf('oldSales.syncBeforeClosing()') < code.indexOf('record.mutateAsync'));
  assert.match(code, /retry\.current\?\.signature === signature/);
  assert.match(code, /key: attempt\.key, lines, qris: amount\(qris\), transfer: amount\(transfer\), gps: attempt\.gps, note: note\.trim\(\)/);
  assert.match(source('src/features/closing/queries.ts'), /gps_unavailable: true/);
});

test('Tutup Coffee Bike preserves draft prefill, sorted all-product counts, and exact write transport', () => {
  const code = logic('app/(app)/kitchen/close-out.tsx', 'src/features/showcase/useCloseOutController.ts');
  assert.match(code, /useCarts\(kitchenReady, 'close-out'\)/);
  assert.match(code, /line\.product_id, line\.qty_to_return/);
  assert.match(code, /\.filter\(\(cart\) => cart\.status === 'active'\)/);
  assert.match(code, /sort\(\(a, b\) => a\.sort_order - b\.sort_order\)/);
  assert.match(code, /products\.map\(\(p\) => \(\{ product_id: p\.id, qty: returned\[p\.id\] \?\? 0 \}\)\)/);
  assert.match(code, /products\.map\(\(p\) => \(\{ product_id: p\.id, qty: rejected\[p\.id\] \?\? 0 \}\)\)/);
  const query = source('src/features/showcase/queries.ts');
  assert.match(query, /request<CloseOutDraft>\('\/showcase\/close-out\/draft\/' \+ cartId, \{ kitchen: true \}\)/);
  assert.match(query, /'\/showcase\/close-out',[\s\S]*?method: 'POST',[\s\S]*?idempotencyKey: operation\.key,[\s\S]*?body,/);
});

test('Reject Dapur keeps GET scope, camera evidence, validation, and multipart upload order', () => {
  const code = logic('app/(app)/kitchen/reject.tsx', 'src/features/kitchenReject/useKitchenRejectController.ts');
  for (const path of ['/kitchen-rejects/kitchens', '/kitchen-rejects/stock', '/kitchen-rejects']) {
    assert.ok(code.includes(`'${path}'`));
  }
  assert.match(code, /requestCameraPermissionsAsync\(\)/);
  assert.match(code, /launchCameraAsync\(\{ mediaTypes: \['images'\], quality: 0\.6, allowsEditing: false \}\)/);
  assert.match(code, /validateKitchenReject\(lines, stockMap, reason, note, photo\?\.uri \?\? null\)/);
  assert.ok(code.indexOf('compressForUpload(photo.uri)') < code.indexOf('uploadFile<Reject>'));
  assert.match(code, /uploadFile<Reject>\('\/kitchen-rejects',[\s\S]*?name: 'reject\.jpg', type: 'image\/jpeg' \}, fields, 'photo', operation\.key\)/);
  assert.match(code, /photo_taken_at: photo\.takenAt/);
  assert.match(code, /fields\['kitchen_id'\] = String\(kitchenId\)/);
});

test('Setup Lokasi keeps local edit ability and PATCH idempotency key for identical input', async () => {
  const code = logic('app/(app)/management/rider-location-setup.tsx',
    'src/features/riderLocation/useRiderLocationSetupController.ts');
  assert.match(code, /canUse\(user, 'rider_location_setup', 'edit'\)/);
  const calls = [];
  let serial = 0;
  const refs = [];
  const queries = load('src/features/riderLocation/queries.ts', {
    react: { useRef: (initial) => refs[0] ??= { current: initial } },
    '@tanstack/react-query': { useMutation: (options) => options,
      useQueryClient: () => ({ invalidateQueries: () => {} }) },
    '@/lib/api': { uuidv4: () => `setup-${++serial}`, request: async (path, options) => {
      calls.push({ path, options });
      if (calls.length === 1) throw new Error('lost response');
      return {};
    } },
  });
  const save = queries.useSaveRiderSetup().mutationFn;
  const input = { riderId: 7, locationId: 9, basis: 'selling_location' };
  await assert.rejects(save(input));
  await save(input);
  await save({ ...input, locationId: null, basis: 'kitchen' });
  assert.deepEqual(plain(calls), [
    { path: '/rider-location-setups/7', options: { method: 'PATCH', idempotencyKey: 'setup-1',
      body: { location_id: 9, basis: 'selling_location' } } },
    { path: '/rider-location-setups/7', options: { method: 'PATCH', idempotencyKey: 'setup-1',
      body: { location_id: 9, basis: 'selling_location' } } },
    { path: '/rider-location-setups/7', options: { method: 'PATCH', idempotencyKey: 'setup-2',
      body: { location_id: null, basis: 'kitchen' } } },
  ]);
});
