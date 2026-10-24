const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

function load(path, modules) {
  const code = ts.transpileModule(readFileSync(join(__dirname, '..', path), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;
  const state = { exports: {} };
  vm.runInNewContext(code, { module: state, exports: state.exports, require: (name) => {
    assert.ok(Object.hasOwn(modules, name), `unexpected import ${name} in ${path}`);
    return modules[name];
  } }, { filename: path });
  return state.exports;
}

function harness() {
  const storage = new Map();
  const calls = [];
  let sequence = 0;
  let failNext = false;
  const selection = () => ({ kitchenId: 2 });
  selection.getState = () => ({ kitchenId: 2 });
  const api = {
    uuidv4: () => `kitchen-key-${++sequence}`,
    request: async (path, options) => {
      calls.push({ path, options: JSON.parse(JSON.stringify(options)) });
      if (failNext) { failNext = false; throw new Error('timeout'); }
      return { cart_id: 3, cart_code: '0018', staff_name: 'Rider' };
    },
  };
  const operationKey = load('src/features/showcase/operationKey.ts', {
    '@react-native-async-storage/async-storage': {
      getItem: async (slot) => storage.get(slot) ?? null,
      setItem: async (slot, value) => { storage.set(slot, value); },
      removeItem: async (slot) => { storage.delete(slot); },
    },
    '@/features/auth/store': { useAuth: { getState: () => ({ session: { user: { id: 7 } } }) } },
    './kitchenSelection': { useKitchenSelection: selection },
    '@/lib/api': api,
  });
  const hooks = load('src/features/showcase/queries.ts', {
    '@tanstack/react-query': {
      useMutation: (options) => options,
      useQuery: (options) => options,
      useQueryClient: () => ({ invalidateQueries: async () => {} }),
    },
    '@/lib/api': api,
    '@/lib/mappers': { toStockRow: (row) => row },
    '@/features/refill/queries': { qk: { products: ['products'], kitchenStock: ['stock'],
      myStock: ['my-stock'], allocationsToday: ['allocations'] } },
    '@/features/showcase/kitchenSelection': { useKitchenSelection: selection },
    '@/features/showcase/operationKey': operationKey,
  });
  return { hooks, calls, failOnce: () => { failNext = true; }, storage };
}

test('Brew, handover and allocation keep exact POST payload and operation key through timeout', async () => {
  const cases = [
    {
      hook: 'useBrewIntoShowcase', path: '/showcase/brew',
      input: { lines: [{ product_id: 1, qty: 9999 }, { product_id: 2, qty: 0 }] },
      body: { lines: [{ product_id: 1, qty: 9999 }] },
    },
    {
      hook: 'useHandToCart', path: '/showcase/hand-to-cart',
      input: { cartId: 3, staffId: 7, lines: [{ product_id: 1, qty: 4 }, { product_id: 2, qty: 0 }],
        note: 'Butuh es', allowanceAmount: 20000 },
      body: { cart_id: 3, staff_id: 7, lines: [{ product_id: 1, qty: 4 }],
        note: 'Butuh es', allowance_amount: 20000 },
    },
    {
      hook: 'useCreateAllocation', path: '/allocations',
      input: { operatingDate: '2026-10-25', cartId: 3, staffId: 7, locationId: 9,
        lines: [{ product_id: 1, qty_issued: 4 }], correctionReason: 'Tambah stok' },
      body: { operating_date: '2026-10-25', cart_id: 3, staff_id: 7, location_id: 9,
        lines: [{ product_id: 1, qty_issued: 4 }], correction_reason: 'Tambah stok' },
    },
  ];
  for (const item of cases) {
    const app = harness();
    const mutation = app.hooks[item.hook]();
    app.failOnce();
    await assert.rejects(mutation.mutationFn(item.input), /timeout/);
    await mutation.mutationFn(structuredClone(item.input));
    const first = app.calls[0];
    const second = app.calls[1];
    assert.equal(first.path, item.path, item.hook);
    assert.deepEqual(first.options.body, item.body, item.hook);
    assert.equal(first.options.method, 'POST', item.hook);
    assert.equal(first.options.kitchen, true, item.hook);
    assert.match(first.options.idempotencyKey, /^kitchen-key-\d+$/, item.hook);
    assert.deepEqual(second, first, item.hook);
    await new Promise(setImmediate);
    await mutation.mutationFn(item.input);
    await new Promise(setImmediate);
    assert.notEqual(app.calls[2].options.idempotencyKey, first.options.idempotencyKey, item.hook);
    assert.equal(app.storage.size, 0, item.hook);
  }
});
