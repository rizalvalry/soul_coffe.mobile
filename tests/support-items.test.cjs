const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const root = join(__dirname, '..');
const source = (path) => readFileSync(join(root, path), 'utf8');

test('demo products contain only cups sold to customers', () => {
  const compiled = ts.transpileModule(source('src/features/demo/seed.ts'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const state = { exports: {} };
  vm.runInNewContext(compiled, { module: state, exports: state.exports });
  const products = state.exports.PRODUCTS;
  assert.ok(products.length > 0);
  assert.ok(products.every((product) => product.is_sellable && product.unit === 'cup'));
  assert.equal(products.some((product) => product.code === 'ES BATU'), false);
});

test('mobile product query and demo refuse support products', () => {
  assert.match(source('src/features/refill/queries.ts'), /filter\(\(product\) => product\.is_sellable\)/);
  assert.match(source('src/features/demo/store.ts'), /Produk ini bukan produk utama/);
  assert.match(source('src/features/demo/store.ts'), /state\.products\.filter\(\(product\) => product\.is_sellable\)/);
});

test('field notes travel through refill, Closing, and handover requests and history', () => {
  assert.match(source('src/features/refill/queries.ts'), /note: input\.note \|\| null/);
  assert.match(source('src/features/closing/queries.ts'), /note: input\.note \|\| null/);
  assert.match(source('src/features/showcase/queries.ts'), /note: input\.note \|\| null/);
  for (const screen of ['app/(app)/staff/refill/new.tsx', 'app/(app)/staff/closing.tsx', 'app/(app)/barista/add-stock.tsx']) {
    assert.match(source(screen), /maxLength=\{500\}/);
  }
  assert.match(source('app/(app)/staff/requests/[id].tsx'), /refill\.note/);
  assert.match(source('app/(app)/finance/settlements.tsx'), /closing_note/);
  assert.match(source('app/(app)/barista/add-stock.tsx') + source('src/features/showcase/useAddStockController.ts'), /useHandoverHistory/);
});

test('demo supports close-out cart picker, draft, and submission', () => {
  const router = source('src/features/demo/router.ts');
  assert.match(router, /query\['scope'\] === 'close-out'/);
  assert.match(router, /base === '\/showcase\/kitchens'/);
  assert.match(router, /showcase\\\/close-out\\\/draft/);
  assert.match(router, /base === '\/showcase\/close-out'/);
  assert.match(source('src/features/demo/store.ts'), /export function closeOutCart/);
});

test('demo close-out moves returned cups once and refuses support product IDs', () => {
  function load(path, imports = {}) {
    const compiled = ts.transpileModule(source(path), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText;
    const state = { exports: {} };
    vm.runInNewContext(compiled, {
      module: state, exports: state.exports,
      require: (name) => imports[name],
    });
    return state.exports;
  }
  const seed = load('src/features/demo/seed.ts');
  const store = load('src/features/demo/store.ts', { './seed': seed });
  const cartBefore = store.getCartStock(1).find((row) => row.productId === 1).onHand;
  const kitchenBefore = store.getKitchenStock(1).find((row) => row.productId === 1).onHand;
  store.closeOutCart({ id: 4, name: 'Runner', role: 'RIDER', kitchenId: 1 }, 1,
    [{ productId: 1, qty: 1 }], []);
  assert.equal(store.getCartStock(1).find((row) => row.productId === 1).onHand, cartBefore - 1);
  assert.equal(store.getKitchenStock(1).find((row) => row.productId === 1).onHand, kitchenBefore + 1);
  assert.throws(() => store.closeOutCart({ id: 4, name: 'Runner', role: 'RIDER', kitchenId: 1 }, 1,
    [{ productId: 999, qty: 1 }], []), (error) => error.status === 422);
});
