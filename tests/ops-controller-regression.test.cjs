const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

function load(file, modules) {
  const source = readFileSync(join(__dirname, '..', file), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true,
  } }).outputText;
  const state = { exports: {} };
  vm.runInNewContext(code, { module: state, exports: state.exports, require: (name) => {
    assert.ok(Object.hasOwn(modules, name), `unexpected import: ${name}`);
    return modules[name];
  } });
  return state.exports;
}

test('Close-out controller filters inactive carts and sends sorted all-product counts', async () => {
  const sent = [];
  const states = [7, { 1: 2, 2: 1 }, { 1: 1, 2: 0 }, null, null];
  let index = 0;
  const hook = load('src/features/showcase/useCloseOutController.ts', {
    react: { useEffect: () => {}, useMemo: (fn) => fn(), useState: (initial) => {
      const id = index++;
      return [states[id] === undefined ? initial : states[id], (next) => {
        states[id] = typeof next === 'function' ? next(states[id]) : next;
      }];
    } },
    'react-native': { Alert: { alert: () => {} } },
    '@tanstack/react-query': { useQuery: () => ({ data: [], isLoading: false }) },
    '@/features/auth/store': { useAuth: (select) => select({ session: { user: { role: 'BARISTA' } } }) },
    '@/features/showcase/kitchenSelection': { useKitchenSelection: () => ({ kitchenId: 3, loaded: true,
      load: async () => {}, select: async () => {} }) },
    '@/features/showcase/queries': {
      useCarts: () => ({ data: [{ id: 7, status: 'active' }, { id: 8, status: 'closed' }], isLoading: false }),
      useCloseOutDraft: () => ({ isSuccess: true, data: { closing_id: 4,
        lines: [{ product_id: 1, qty_remaining: 3, qty_to_return: 2 }] } }),
      useCloseOutCart: () => ({ isPending: false, mutateAsync: async (input) => {
        sent.push(input); return { cart_code: '0007' };
      } }),
    },
    '@/features/refill/queries': { useProducts: () => ({ isSuccess: true, isLoading: false,
      data: [{ id: 2, sort_order: 2 }, { id: 1, sort_order: 1 }] }) },
    '@/lib/api': { ApiError: class ApiError extends Error {}, request: async () => [] },
  }).useCloseOutController;
  const view = hook();
  assert.deepEqual(JSON.parse(JSON.stringify(view.carts.map((cart) => cart.id))), [7]);
  assert.deepEqual(JSON.parse(JSON.stringify(view.products.map((product) => product.id))), [1, 2]);
  assert.equal(view.canSubmit, true);
  assert.equal(view.hasDifference, false);
  await view.submit();
  assert.deepEqual(JSON.parse(JSON.stringify(sent)), [{ cartId: 7,
    returned: [{ product_id: 1, qty: 2 }, { product_id: 2, qty: 1 }],
    rejected: [{ product_id: 1, qty: 1 }, { product_id: 2, qty: 0 }] }]);
});

test('Setup Lokasi controller keeps an unauthorized user on the local guard', () => {
  const hook = load('src/features/riderLocation/useRiderLocationSetupController.ts', {
    react: { useState: (initial) => [initial, () => {}] },
    'react-native': { Alert: { alert: () => {} } },
    '@/features/auth/store': { useAuth: (select) => select({ session: { user: { role: 'STAFF' } } }) },
    '@/features/navigation/menu': { canUse: () => false },
    '@/features/riderLocation/queries': { useRiderSetups: () => ({}), useLocations: () => ({}),
      useSaveRiderSetup: () => ({}) },
    '@/lib/api': { ApiError: class ApiError extends Error {} },
  }).useRiderLocationSetupController;
  assert.equal(hook().canEdit, false);
});

test('Reject controller skips camera capture on denial and skips upload on validation error', async () => {
  const states = [{ 1: 6 }, 'DROPPED', '', null, null, null, false];
  let stateIndex = 0;
  let granted = false;
  let cameraCalls = 0;
  let compressCalls = 0;
  let uploadCalls = 0;
  const hook = load('src/features/kitchenReject/useKitchenRejectController.ts', {
    react: { useEffect: () => {}, useMemo: (fn) => fn(), useState: (initial) => {
      const id = stateIndex++;
      return [states[id] === undefined ? initial : states[id], (next) => {
        states[id] = typeof next === 'function' ? next(states[id]) : next;
      }];
    } },
    'expo-image-picker': { requestCameraPermissionsAsync: async () => ({ granted }),
      launchCameraAsync: async () => { cameraCalls++; return { canceled: true }; } },
    '@tanstack/react-query': { useQueryClient: () => ({ invalidateQueries: async () => {} }),
      useQuery: ({ queryKey }) => queryKey[1] === 'stock'
        ? { data: [{ product_id: 1, qty: 5 }] } : { data: [] } },
    'expo-router': { useRouter: () => ({ back() {} }) },
    '@/features/auth/store': { useAuth: (select) => select({ session: { user: { role: 'BARISTA' } } }) },
    '@/features/refill/queries': { useProducts: () => ({ data: [{ id: 1, is_sellable: true }] }) },
    '@/features/showcase/kitchenSelection': { useKitchenSelection: () => ({ kitchenId: 4,
      loaded: true, load: async () => {}, select: async () => {} }) },
    '@/features/showcase/operationKey': { kitchenOperationKey: async () => ({ key: 'reject' }) },
    '@/features/kitchenReject/validation': { validateKitchenReject: (lines, stock) =>
      lines[0].qty > stock[1] ? 'Stok showcase kurang.' : null },
    '@/lib/api': { request: async () => [], uploadFile: async () => { uploadCalls++; return {}; } },
    '@/lib/image': { compressForUpload: async () => { compressCalls++; return {}; } },
  }).useKitchenRejectController;
  const view = hook();
  await view.takePhoto();
  assert.equal(states[4], 'Aktifkan izin kamera dulu ya.');
  assert.equal(cameraCalls, 0);
  granted = true;
  await view.takePhoto();
  assert.equal(cameraCalls, 1);
  assert.equal(states[3], null);
  await view.submit();
  assert.equal(states[4], 'Stok showcase kurang.');
  assert.equal(compressCalls, 0);
  assert.equal(uploadCalls, 0);
});

test('Closing controller restores draft fields once and preserves edits on a same-signature refetch', () => {
  const states = [];
  const refs = [];
  const effects = [];
  let stateIndex = 0;
  let refIndex = 0;
  const draft = { cart_id: 7, closing_id: null, qris_minor: 5000, transfer_minor: 1000,
    note: 'cek es', lines: [{ product_id: 1, qty_in: 10, qty_carry: 2,
      qty_office_sold: 3, qty_remaining: 4, qty_wasted: 2 }] };
  const hook = load('src/features/closing/useClosingController.ts', {
    react: { useEffect: (effect) => effects.push(effect), useMemo: (fn) => fn(),
      useState: (initial) => { const id = stateIndex++;
        if (!(id in states)) states[id] = initial;
        return [states[id], (next) => { states[id] = typeof next === 'function' ? next(states[id]) : next; }]; },
      useRef: (initial) => { const id = refIndex++; return refs[id] ??= { current: initial }; } },
    'react-native': { Alert: { alert: () => {} } },
    'expo-location': {},
    'expo-router': { useRouter: () => ({ replace() {} }) },
    '@/features/refill/queries': { useProducts: () => ({ data: [] }) },
    '@/features/closing/queries': { useClosingDraft: () => ({ data: draft }), useRecordClosing: () => ({}) },
    '@/features/closing/calculation': { closingTotals: () => ({ valid: true, soldByProduct: {} }) },
    '@/features/closing/submissionGate': { closingSubmissionGate: async () => 'ready' },
    '@/features/closing/commission': { commissionSummary: () => ({}) },
    '@/features/closing/locationCheck': { closingLocationMessage: () => '' },
    '@/features/closing/formState': { closingFormSignature: () => 'same-form' },
    '@/features/sales/useOfflineSalesQueue': { useOfflineSalesQueue: () => ({}) },
    '@/lib/api': { ApiError: class ApiError extends Error {}, uuidv4: () => 'closing' },
  }).useClosingController;
  hook();
  effects.pop()();
  assert.deepEqual(JSON.parse(JSON.stringify(states.slice(0, 5))), [
    { 1: '9' }, { 1: '2' }, '5000', '1000', 'cek es',
  ]);
  states[0] = { 1: '7' };
  stateIndex = 0;
  refIndex = 0;
  hook();
  effects.pop()();
  assert.deepEqual(JSON.parse(JSON.stringify(states.slice(0, 5))), [
    { 1: '7' }, { 1: '2' }, '5000', '1000', 'cek es',
  ]);
});

test('Close-out controller hydrates returned cup counts from the selected cart draft', () => {
  const states = [7];
  const effects = [];
  let stateIndex = 0;
  const hook = load('src/features/showcase/useCloseOutController.ts', {
    react: { useEffect: (effect) => effects.push(effect), useMemo: (fn) => fn(),
      useState: (initial) => { const id = stateIndex++;
        if (!(id in states)) states[id] = initial;
        return [states[id], (next) => { states[id] = typeof next === 'function' ? next(states[id]) : next; }]; } },
    'react-native': { Alert: { alert: () => {} } },
    '@tanstack/react-query': { useQuery: () => ({ data: [] }) },
    '@/features/auth/store': { useAuth: (select) => select({ session: { user: { role: 'BARISTA' } } }) },
    '@/features/showcase/kitchenSelection': { useKitchenSelection: () => ({ kitchenId: 3,
      loaded: true, load: async () => {}, select: async () => {} }) },
    '@/features/showcase/queries': { useCarts: () => ({ data: [] }),
      useCloseOutDraft: () => ({ data: { closing_id: 4, lines: [
        { product_id: 1, qty_to_return: 3 }, { product_id: 2, qty_to_return: 0 },
      ] } }), useCloseOutCart: () => ({}) },
    '@/features/refill/queries': { useProducts: () => ({ data: [] }) },
    '@/lib/api': { ApiError: class ApiError extends Error {}, request: async () => [] },
  }).useCloseOutController;
  hook();
  effects.at(-1)();
  assert.deepEqual(JSON.parse(JSON.stringify(states[1])), { 1: 3, 2: 0 });
});
