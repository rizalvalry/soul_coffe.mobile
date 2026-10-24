const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

function load(path, modules) {
  const source = readFileSync(join(__dirname, '..', path), 'utf8');
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports,
    require: (name) => {
      assert.ok(Object.hasOwn(modules, name), `unexpected import: ${name}`);
      return modules[name];
    },
  });
  return module.exports;
}

const storage = new Map();
let uuidCount = 0;
const attempt = load('src/features/clearing/attempt.ts', {
  '@react-native-async-storage/async-storage': {
    getItem: async (key) => storage.get(key) ?? null,
    setItem: async (key, value) => { storage.set(key, value); },
    removeItem: async (key) => { storage.delete(key); },
  },
  '@/lib/api': { uuidv4: () => `test-key-${++uuidCount}` },
});

const sent = [];
const queries = load('src/features/clearing/queries.ts', {
  '@tanstack/react-query': {
    useQuery: (options) => options,
    useMutation: (options) => options,
    useQueryClient: () => ({ invalidateQueries: () => Promise.resolve() }),
  },
  '@/lib/api': { request: async (path, options) => { sent.push({ path, options }); return { id: 1 }; } },
});

test('clearing record survives retry and keeps one key and exact body per Finance account', async () => {
  const input = { received_on: '2026-10-20', amount_minor: 900, mdr_minor: 100,
    bank_account_id: 2, sale_dates: ['2026-10-18'] };
  const first = await attempt.loadOrCreateClearingAttempt('finance-1', input);
  const second = await attempt.loadOrCreateClearingAttempt('finance-1', { ...input, amount_minor: 999 });
  assert.equal(first.uuid, second.uuid);
  assert.equal(second.amount_minor, 900);
  await queries.useRecordClearing().mutationFn(second);
  assert.equal(sent.at(-1).path, '/clearing-receipts');
  assert.equal(sent.at(-1).options.idempotencyKey, first.uuid);
  assert.equal(sent.at(-1).options.body.amount_minor, 900);
  const other = await attempt.loadOrCreateClearingAttempt('finance-2', input);
  assert.notEqual(other.uuid, first.uuid);
  await attempt.clearClearingAttempt('finance-1');
  assert.equal(await attempt.readClearingAttempt('finance-1'), null);
});

test('matching and void requests carry idempotency keys', async () => {
  await queries.useMatchClearing().mutationFn({ id: 4, uuid: 'match-key', sale_dates: ['2026-10-18'] });
  assert.equal(sent.at(-1).path, '/clearing-receipts/4/match');
  assert.equal(sent.at(-1).options.idempotencyKey, 'match-key');
  await queries.useVoidClearing().mutationFn({ id: 4, reason: 'Koreksi', key: 'void-key' });
  assert.equal(sent.at(-1).path, '/clearing-receipts/4/void');
  assert.equal(sent.at(-1).options.idempotencyKey, 'void-key');
});

test('lost receipt response keeps the draft key and hides cancellation until replay succeeds', async () => {
  const jsx = (type, props) => ({ type, props: props ?? {} });
  const state = [];
  const refs = [];
  let stateIndex = 0;
  let refIndex = 0;
  const posted = [];
  let loseFirstResponse = true;
  let rejectNext = false;
  class ApiError extends Error {
    constructor(message, status) { super(message); this.status = status; }
    get isValidation() { return this.status === 422; }
  }
  const modules = {
    react: {
      useEffect: () => {},
      useRef: (initial) => {
        const index = refIndex++;
        return refs[index] ??= { current: initial };
      },
      useState: (initial) => {
        const index = stateIndex++;
        if (!(index in state)) state[index] = initial;
        return [state[index], (value) => { state[index] = typeof value === 'function' ? value(state[index]) : value; }];
      },
    },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-native': { Alert: { alert() {} }, StyleSheet: { create: (styles) => styles }, View: 'View' },
    'expo-router': { useRouter: () => ({ back() {} }) },
    '@/components/ui/Screen': { Screen: 'Screen' },
    '@/components/ui/Text': { Text: 'Text' },
    '@/components/ui/Card': { Card: 'Card' },
    '@/components/ui/Button': { Button: 'Button', IconButton: 'IconButton' },
    '@/components/ui/Input': { Input: 'Input' },
    '@/components/ui/Banner': { Banner: 'Banner' },
    '@/components/ui/Touchable': { Touchable: 'Touchable' },
    '@/features/auth/store': { useAuth: (select) => select({ session: { user: { id: 'finance-screen' } } }) },
    '@/features/clearing/attempt': attempt,
    '@/features/clearing/queries': {
      useClearingOptions: () => ({ data: { bank_account_id: 2, aging: { rows: [],
        buckets: { '0_1_minor': 0, '2_3_minor': 0, over_3_minor: 0 }, unmatched_credit_minor: 0,
        unattributed_minor: 0, net_balance_minor: 0 } }, isRefetching: false }),
      useClearingReceipts: () => ({ data: [], isRefetching: false }),
      useRecordClearing: () => ({ isPending: false, mutateAsync: async (input) => {
        posted.push(input);
        if (rejectNext) { rejectNext = false; throw new ApiError('Nominal ditolak', 422); }
        if (loseFirstResponse) { loseFirstResponse = false; throw new Error('response lost after commit'); }
        return { id: 1 };
      } }),
      useVoidClearing: () => ({ isPending: false }),
      useMatchClearing: () => ({ isPending: false }),
    },
    '@/lib/api': { ApiError, uuidv4: () => 'unused' },
    '@/theme': { brand: { 700: '#123' }, semantic: { textMuted: '#666' }, space: { sm: 8, md: 12 } },
  };
  modules['@/features/clearing/financeController'] = load('src/features/clearing/financeController.ts', modules);
  const source = readFileSync(join(__dirname, '..', 'app/(app)/finance/clearing.tsx'), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
    jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } }).outputText;
  const screenModule = { exports: {} };
  vm.runInNewContext(code, { module: screenModule, exports: screenModule.exports,
    require: (name) => {
      assert.ok(Object.hasOwn(modules, name), `unexpected import: ${name}`);
      return modules[name];
    },
  });
  function render() {
    stateIndex = 0;
    refIndex = 0;
    const nodes = [];
    function visit(value) {
      if (Array.isArray(value)) return value.forEach(visit);
      if (!value || typeof value !== 'object' || !('type' in value)) return;
      nodes.push(value);
      visit(value.props.children);
    }
    visit(screenModule.exports.default());
    return nodes;
  }
  const find = (nodes, type, label) => nodes.find((node) => node.type === type && node.props.label === label);
  find(render(), 'Input', 'Nominal masuk rekening (Rp)').props.onChangeText('900');
  find(render(), 'Button', 'Catat dana masuk').props.onPress();
  await new Promise(setImmediate);
  assert.equal(posted.length, 1);
  assert.equal((await attempt.readClearingAttempt('finance-screen')).uuid, posted[0].uuid);
  assert.equal(find(render(), 'Button', 'Batalin draft yang ditolak'), undefined);
  find(render(), 'Button', 'Catat dana masuk').props.onPress();
  await new Promise(setImmediate);
  assert.equal(posted.length, 2);
  assert.equal(posted[1].uuid, posted[0].uuid);
  assert.equal(await attempt.readClearingAttempt('finance-screen'), null);

  // A rejected write can be edited, but cancel and retry cannot overlap in
  // either order: the first action holds the same synchronous in-flight guard.
  rejectNext = true;
  find(render(), 'Input', 'Nominal masuk rekening (Rp)').props.onChangeText('901');
  find(render(), 'Button', 'Catat dana masuk').props.onPress();
  await new Promise(setImmediate);
  const rejectedNodes = render();
  assert.ok(find(rejectedNodes, 'Button', 'Batalin draft yang ditolak'));
  find(rejectedNodes, 'Button', 'Batalin draft yang ditolak').props.onPress();
  find(rejectedNodes, 'Button', 'Catat dana masuk').props.onPress();
  await new Promise(setImmediate);
  assert.equal(posted.length, 3);
  assert.equal(await attempt.readClearingAttempt('finance-screen'), null);
});
