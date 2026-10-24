const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const source = (path) => readFileSync(join(__dirname, '..', path), 'utf8');
const screen = (name) => source(`app/(app)/barista/${name}.tsx`);

function setup(name, { states = [], queries = {}, selection = {} } = {}) {
  let nextIndex = 0;
  const current = states.slice();
  const calls = [];
  class ApiError extends Error { constructor(message, isConflict = false) { super(message); this.isConflict = isConflict; } }
  const modules = {
    react: {
      useState: (initial) => {
        const index = nextIndex++;
        if (!(index in current)) current[index] = typeof initial === 'function' ? initial() : initial;
        return [current[index], (next) => {
          current[index] = typeof next === 'function' ? next(current[index]) : next;
        }];
      },
      useMemo: (fn) => fn(), useEffect: (fn) => fn(),
    },
    'react-native': { Alert: { alert: (...args) => calls.push(['alert', ...args]) } },
    'expo-router': { useRouter: () => ({ push: (path) => calls.push(['navigate', path]) }) },
    '@tanstack/react-query': { useQuery: () => queries.kitchens },
    '@/features/showcase/kitchenSelection': { useKitchenSelection: () => selection },
    '@/features/refill/queries': {
      useProducts: () => queries.products, useRefills: () => queries.refills,
      useStartPreparing: () => queries.startPreparing, useMarkReady: () => queries.markReady,
      useKitchenStock: () => queries.kitchenStock, useStaffOnShift: () => queries.roster,
    },
    '@/features/realtime/RealtimeProvider': { useRealtimeState: () => ({ state: 'connected' }) },
    '@/features/riderLocation/queries': { useLocations: () => queries.locations },
    '@/features/showcase/queries': {
      useBrewIntoShowcase: () => queries.brew, useCarts: () => queries.carts,
      useShowcaseStaff: () => queries.staff, useShowcaseStock: () => queries.stock,
      useHandToCart: () => queries.handover, useHandoverHistory: () => queries.history,
      useCartAllowance: () => queries.allowance, useCreateAllocation: () => queries.allocation,
    },
    '@/features/showcase/quantity': { MAX_PRODUCTION_QTY: 9999 },
    '@/lib/api': { ApiError },
  };
  const path = `src/features/showcase/use${name}Controller.ts`;
  const code = ts.transpileModule(source(path), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
  } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, require: (dependency) => {
    assert.ok(Object.hasOwn(modules, dependency), `unexpected import ${dependency} in ${path}`);
    return modules[dependency];
  } }, { filename: path });
  return { controller: module.exports[`use${name}Controller`],
    cardController: module.exports.usePreparingCardController, calls, current, ApiError };
}

test('kitchen selection clears unavailable saved kitchen and reports persistence failure', async () => {
  const calls = [];
  const selection = { kitchenId: 2, loaded: true, load: async () => calls.push('load'),
    select: async (id) => { calls.push(id); if (id === 3) throw new Error('storage failed'); } };
  const app = setup('Index', { queries: { kitchens: { data: [{ id: 3, name: 'Dapur B' }] } }, selection });
  const result = app.controller(async () => []);
  assert.deepEqual(calls, ['load', null]);
  await result.choose(3);
  assert.equal(app.current[0], 'Pilihan dapur belum bisa disimpan di HP. Coba lagi ya.');
  assert.equal(result.selected, undefined);
});

test('request conflict refetches queue and uses the same Finance approval message', async () => {
  const refetches = [];
  const app = setup('Requests', { queries: {
    refills: { data: [], refetch: async () => refetches.push('refetch') },
    startPreparing: { mutateAsync: async () => { throw new app.ApiError('conflict', true); } },
  } });
  const result = app.controller();
  await result.onStartPreparing({ id: 8 });
  assert.deepEqual(refetches, ['refetch']);
  assert.deepEqual(app.calls[0], ['alert', 'Belum disetujui Finance.']);
  assert.doesNotMatch(screen('requests') + source('src/features/showcase/useRequestsController.ts'),
    /setInterval|refetchInterval/);
});

test('preparing blocks missing shortfall reason and marks retired lines nonoperational', async () => {
  const writes = [];
  const refill = { id: 8, lines: [{ id: 3, qty_approved: 5, is_operational: false }] };
  const app = setup('Preparing', { states: [{ 3: 2 }, '   ', null], queries: {
    markReady: { mutateAsync: async (input) => writes.push(input) },
  } });
  const card = app.cardController(refill);
  assert.equal(card.hasShortfall, true);
  assert.equal(card.hasRetiredLines, true);
  await card.onSubmit();
  assert.equal(writes.length, 0);
  assert.equal(app.current[2], 'Alasan kekurangan wajib diisi karena ada jumlah yang kurang dari yang disetujui.');
  assert.match(screen('preparing'), /disabled=\{hasRetiredLines\}/);
});

test('Brew zero quantities produce no lines and keep Catat Brew disabled', () => {
  const app = setup('Brew', { states: [{ 1: 0 }, null], queries: {
    products: { data: [] }, brew: { isPending: true },
  } });
  const result = app.controller();
  assert.equal(result.lines.length, 0);
  assert.match(screen('brew'), /disabled=\{lines\.length === 0\}/);
  assert.match(screen('brew'), /loading=\{brew\.isPending\}/);
});

test('Add Stock rejects invalid allowance, sends changed integer override and keeps pending control', async () => {
  const sent = [];
  const queries = {
    carts: { data: [{ id: 3, code: '0018', status: 'active' }] },
    staff: { data: [{ id: 7, name: 'Rider' }] },
    products: { data: [{ id: 1, sort_order: 1 }] }, stock: { data: [{ product_id: 1, on_hand: 5 }] },
    allowance: { data: { amount_minor: 20000 } }, history: { data: [] },
    handover: { isPending: true, mutateAsync: async (input) => {
      sent.push(JSON.parse(JSON.stringify(input))); return { cart_code: '0018', staff_name: 'Rider' };
    } },
  };
  const invalid = setup('AddStock', { states: [3, 7, { 1: 4 }, '-1', '', null], queries });
  assert.equal(invalid.controller().canSubmit, false);
  const changed = setup('AddStock', { states: [3, 7, { 1: 4 }, '21000', '', null], queries });
  const result = changed.controller();
  assert.equal(result.canSubmit, true);
  assert.equal(result.allowanceChanged, true);
  assert.equal(result.maxForProduct(10000), 9999);
  await result.submit();
  assert.equal(sent[0].allowanceAmount, 21000);
  assert.match(screen('add-stock'), /loading=\{handToCart\.isPending\}/);
  assert.match(screen('add-stock'), /disabled=\{!canSubmit\}/);
});

test('Allocation shortage, missing location and short correction reason keep submit disabled', () => {
  const roster = { data: [{ staff_id: 7, cart_id: 3, has_allocation: true, location_id: null }] };
  const queries = { roster, products: { data: [{ id: 1, name: 'Kopi' }] },
    kitchenStock: { data: [{ product_id: 1, on_hand: 5 }] },
    locations: { data: [] }, allocation: { isPending: true } };
  const app = setup('Allocations', { states: [7, null, { 1: 6 }, 'short', null], queries });
  const result = app.controller();
  assert.equal(result.locationId, null);
  assert.equal(result.stockShortages.length, 1);
  assert.equal(result.maxForProduct(1), 5);
  assert.match(screen('allocations'), /disabled=\{!locationId \|\| lines\.length === 0 \|\| stockShortages\.length > 0 \|\| \(selected\.has_allocation && reason\.trim\(\)\.length < 10\)\}/);
  assert.match(screen('allocations'), /loading=\{create\.isPending\}/);
});
