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
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports,
    require: (name) => {
      assert.ok(Object.hasOwn(modules, name), `unexpected import: ${name}`);
      return modules[name];
    } });
  return module.exports;
}

test('kitchen write retries keep a saved key per exact operation until confirmed', async () => {
  const storage = new Map();
  let sequence = 0;
  const modules = {
    '@react-native-async-storage/async-storage': {
      getItem: async (key) => storage.get(key) ?? null,
      setItem: async (key, value) => { storage.set(key, value); },
      removeItem: async (key) => { storage.delete(key); },
    },
    '@/features/auth/store': { useAuth: { getState: () => ({ session: { user: { id: '7' } } }) } },
    './kitchenSelection': { useKitchenSelection: { getState: () => ({ kitchenId: 2 }) } },
    '@/lib/api': { uuidv4: () => `key-${++sequence}` },
  };
  const { kitchenOperationKey } = load('src/features/showcase/operationKey.ts', modules);
  const first = await kitchenOperationKey('brew', { lines: [{ product_id: 1, qty: 2 }] });
  const other = await kitchenOperationKey('brew', { lines: [{ product_id: 1, qty: 3 }] });
  const retry = await kitchenOperationKey('brew', { lines: [{ product_id: 1, qty: 2 }] });
  assert.equal(retry.key, first.key);
  assert.notEqual(other.key, first.key);
  const restarted = load('src/features/showcase/operationKey.ts', modules);
  assert.equal((await restarted.kitchenOperationKey('brew', { lines: [{ product_id: 1, qty: 2 }] })).key, first.key);
  await first.clear();
  assert.notEqual((await kitchenOperationKey('brew', { lines: [{ product_id: 1, qty: 2 }] })).key, first.key);
});

test('kitchen selection ignores a stale load and serializes rapid writes', async () => {
  const storage = new Map([['soul.selectedKitchen.v1', '1']]);
  let releaseRead;
  let releaseFirstWrite;
  const readHeld = new Promise((resolve) => { releaseRead = resolve; });
  const firstWriteHeld = new Promise((resolve) => { releaseFirstWrite = resolve; });
  let writes = 0;
  const create = (initializer) => {
    let state;
    const set = (patch) => { state = { ...state, ...patch }; };
    const get = () => state;
    state = initializer(set, get);
    return { getState: get };
  };
  const { useKitchenSelection } = load('src/features/showcase/kitchenSelection.ts', {
    '@react-native-async-storage/async-storage': {
      getItem: async (key) => { await readHeld; return storage.get(key) ?? null; },
      setItem: async (key, value) => {
        writes++;
        if (writes === 1) await firstWriteHeld;
        storage.set(key, value);
      },
      removeItem: async (key) => { storage.delete(key); },
    },
    zustand: { create },
    '@/lib/queryClient': { getQueryClient: () => ({ invalidateQueries: async () => {} }) },
  });
  const loadPending = useKitchenSelection.getState().load();
  const first = useKitchenSelection.getState().select(2);
  const second = useKitchenSelection.getState().select(3);
  releaseRead();
  await loadPending;
  assert.equal(useKitchenSelection.getState().kitchenId, null);
  releaseFirstWrite();
  await Promise.all([first, second]);
  assert.equal(useKitchenSelection.getState().kitchenId, 3);
  assert.equal(storage.get('soul.selectedKitchen.v1'), '3');
});
