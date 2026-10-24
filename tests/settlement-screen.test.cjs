const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const root = join(__dirname, '..');
const compile = (path, jsx) => ts.transpileModule(readFileSync(join(root, path), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
    jsx: jsx ? ts.JsxEmit.ReactJSX : undefined, esModuleInterop: true },
}).outputText;
const expectationModule = { exports: {} };
vm.runInNewContext(compile('src/features/settlements/expectations.ts', false), {
  module: expectationModule, exports: expectationModule.exports,
});

function mountScreen({ row, draft, settlement, queueRows = [row], recordFailures = 0,
  attempts = new Map(), runEffects = false, recordPending = false, approvePending = false }) {
  const alerts = [];
  const records = [];
  const approvals = [];
  const stateUpdates = [];
  const effects = [];
  const state = [];
  const refs = [];
  let stateIndex = 0;
  let refIndex = 0;
  let keyCount = 0;
  const jsx = (type, props) => ({ type, props: props ?? {} });
  const sessionRows = queueRows;
  const modules = {
    react: {
      useCallback: (fn) => fn,
      useEffect: (fn) => { if (runEffects) effects.push(fn); },
      useMemo: (fn) => fn(),
      useRef: (initial) => {
        const index = refIndex++;
        return refs[index] ??= { current: initial };
      },
      useState: (initial) => {
        const index = stateIndex++;
        if (!(index in state)) state[index] = typeof initial === 'function' ? initial() : initial;
        return [state[index], (next) => {
          state[index] = typeof next === 'function' ? next(state[index]) : next;
          stateUpdates.push(next);
        }];
      },
    },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-native': {
      Alert: { alert: (...args) => alerts.push(args) },
      Modal: 'Modal', ScrollView: 'ScrollView', View: 'View',
      StyleSheet: { create: (styles) => styles },
    },
    'expo-router': {
      useLocalSearchParams: () => ({}),
      useRouter: () => ({ back() {} }),
    },
    '@expo/vector-icons/MaterialCommunityIcons': 'MaterialCommunityIcons',
    '@/components/ui/Screen': { Screen: 'Screen' },
    '@/components/ui/Text': { Text: 'Text' },
    '@/components/ui/Card': { Card: 'Card' },
    '@/components/ui/Button': { Button: 'Button', IconButton: 'IconButton' },
    '@/components/ui/Input': { Input: 'Input' },
    '@/components/ui/QtyStepper': { QtyStepper: 'QtyStepper' },
    '@/components/ui/Badge': { Chip: 'Chip' },
    '@/components/ui/Banner': { Banner: 'Banner' },
    '@/components/ui/EmptyState': { EmptyState: 'EmptyState' },
    '@/components/ui/Skeleton': { SkeletonList: 'SkeletonList' },
    '@/components/ui/ProductThumbnail': { ProductThumbnail: 'ProductThumbnail' },
    '@/components/ui/Section': { SectionTitle: 'SectionTitle' },
    '@/components/ui/Touchable': { Touchable: 'Touchable' },
    '@/features/settlements/queries': {
      useSettlementQueue: () => ({ data: sessionRows, isLoading: false, isError: false }),
      useSettlementDraft: () => ({ data: draft, isLoading: false }),
      useRecordSettlement: () => ({ isPending: recordPending, mutateAsync: async (input) => {
        records.push(input);
        if (records.length <= recordFailures) throw new Error('timeout');
        return settlement;
      } }),
      useApproveSettlement: () => ({ isPending: approvePending, mutateAsync: async (input) => {
        approvals.push(JSON.parse(JSON.stringify(input)));
      } }),
    },
    '@/features/settlements/expectations': expectationModule.exports,
    '@/features/settlements/navigation': { settlementTarget: () => ({ cartId: row.cart_id }) },
    '@/features/auth/store': { useAuth: (select) => select({ session: { user: { id: 'finance-1' } } }) },
    '@/features/settlements/draftAttempt': {
      readSettlementAttempt: async (_owner, cartId, date) => attempts.get(`${cartId}:${date ?? 'today'}`) ?? null,
      loadOrCreateSettlementAttempt: async (_owner, input) => {
        const key = `${input.cartId}:${input.date ?? 'today'}`;
        if (!attempts.has(key)) attempts.set(key, { ...input, idempotencyKey: `draft-key-${++keyCount}` });
        return attempts.get(key);
      },
      clearSettlementAttempt: async (_owner, cartId, date) => { attempts.delete(`${cartId}:${date ?? 'today'}`); },
    },
    '@/lib/api': { ApiError: class ApiError extends Error {} },
    '@/theme': {
      brand: { 600: '#123' }, feedback: { dangerFg: '#f00' }, neutral: { 0: '#fff' },
      radius: { md: 8, lg: 12 },
      semantic: { textMuted: '#666', textSubtle: '#999', border: '#ccc', surfaceSunken: '#eee', bg: '#fff' },
      space: { xxs: 2, sm: 8, md: 12, lg: 16 },
    },
  };
  const controllerModule = { exports: {} };
  vm.runInNewContext(compile('src/features/settlements/financeController.ts', false), {
    module: controllerModule, exports: controllerModule.exports,
    require: (name) => {
      assert.ok(Object.hasOwn(modules, name), `unexpected controller import: ${name}`);
      return modules[name];
    },
  });
  modules['@/features/settlements/financeController'] = controllerModule.exports;
  const sandboxModule = { exports: {} };
  vm.runInNewContext(compile('app/(app)/finance/settlements.tsx', true), {
    module: sandboxModule, exports: sandboxModule.exports,
    require: (name) => {
      assert.ok(Object.hasOwn(modules, name), `unexpected import: ${name}`);
      return modules[name];
    },
  });

  const nodes = [];
  function visit(value) {
    if (Array.isArray(value)) return value.forEach(visit);
    if (!value || typeof value !== 'object' || !('type' in value)) return;
    if (typeof value.type === 'function') return visit(value.type(value.props));
    nodes.push(value);
    visit(value.props.children);
  }
  function rerender() {
    nodes.length = 0;
    stateIndex = 0;
    refIndex = 0;
    visit(sandboxModule.exports.default());
  }
  rerender();
  return { nodes, alerts, records, approvals, stateUpdates, attempts, effects, rerender };
}

const baseRow = {
  cart_id: 18, cart_code: '0018', staff_name: 'Rider', cups_sold: 4, cups_remaining: 0,
  expected_total: 80000, expected_total_minor: 80000, expected_cash_minor: 40000,
  expected_qris_minor: 30000, expected_transfer_minor: 10000,
  arrived_at: '2026-10-17T09:30:00+07:00', settlement_id: null, settlement_status: null,
};
const baseDraft = {
  expected_total: 80000, expected_total_minor: 80000, expected_cash_minor: 40000,
  expected_qris_minor: 30000, expected_transfer_minor: 10000, lines: [],
};

test('finance sees the sales Rider when the cart custodian changed', () => {
  const row = { ...baseRow, staff_name: 'Rider Baru', sale_staff_names: ['Rider Lama'] };
  const app = mountScreen({ row, draft: baseDraft, settlement: { id: 7, variance: 0 } });
  const labels = app.nodes.filter((node) => node.type === 'Text').map((node) =>
    Array.isArray(node.props.children) ? node.props.children.flat(Infinity).join('') : node.props.children);
  assert.ok(labels.some((value) => typeof value === 'string' && value.includes('Penanggung jawab: Rider Baru')));
  assert.ok(labels.includes('Penjualan oleh Rider Lama'));
});

test('queue keeps API order and form shows per-method values with an enabled zero-money submit', async () => {
  const app = mountScreen({ row: baseRow, draft: baseDraft,
    settlement: { id: 7, variance: -80000 },
    queueRows: [baseRow, { ...baseRow, cart_id: 19, cart_code: '0019', arrived_at: null }],
  });
  const queue = app.nodes.filter((node) => node.type === 'Touchable');
  assert.deepEqual(queue.map((node) => node.props.accessibilityLabel), [
    'Setoran Coffee Bike 0018', 'Setoran Coffee Bike 0019',
  ]);
  const text = app.nodes.filter((node) => node.type === 'Text').map((node) =>
    Array.isArray(node.props.children) ? node.props.children.flat(Infinity).join('') : node.props.children);
  assert.ok(text.some((value) => typeof value === 'string' && value.includes('Urutan 1') && value.includes('Tiba di dapur')));
  for (const label of ['Ekspektasi tunai', 'Ekspektasi QRIS', 'Ekspektasi transfer']) {
    assert.ok(text.includes(label), label);
  }
  const reason = app.nodes.find((node) => node.type === 'Input' && node.props.label?.startsWith('Alasan selisih'));
  assert.equal(reason.props.label, 'Alasan selisih (opsional)');
  const cashInput = app.nodes.find((node) => node.type === 'Input' && node.props.label === 'Tunai / Cash');
  cashInput.props.onChangeText('1.000.000.000.000');
  assert.ok(app.stateUpdates.includes('1000000000000'));
  const submit = app.nodes.find((node) => node.type === 'Button' && node.props.label === 'Terima Setoran');
  assert.equal(submit.props.disabled, false);
  submit.props.onPress();
  await new Promise(setImmediate);
  assert.equal(app.records[0].cash, 0);
  assert.equal(app.records[0].varianceReason, undefined);
  assert.match(app.alerts[0][1], /tercatat dan dilaporkan ke Administrator & Finance/);
});

test('a stale recorded settlement warns Finance before cup disposition', () => {
  const app = mountScreen({ row: { ...baseRow, settlement_id: 7, expected_stale: true },
    draft: baseDraft, settlement: { id: 7, variance: 0 } });
  assert.ok(app.nodes.some((node) => node.type === 'Banner' &&
    node.props.message?.includes('Ekspektasi berubah setelah setoran dicatat')));
});

test('method variance stays visible in queue and cup disposition', () => {
  const app = mountScreen({ row: { ...baseRow, settlement_id: 7, method_variance_flagged: true },
    draft: baseDraft, settlement: { id: 7, variance: 0, method_variance_flagged: true } });
  const labels = app.nodes.filter((node) => node.type === 'Text').map((node) =>
    Array.isArray(node.props.children) ? node.props.children.flat(Infinity).join('') : node.props.children);
  assert.ok(labels.some((value) => typeof value === 'string' && value.includes('Selisih metode')));
  assert.ok(app.nodes.some((node) => node.type === 'Banner' && node.props.message?.includes('selisih tercatat')));
});

test('timeout retry keeps one key and payload until success, then clears the draft key', async () => {
  const app = mountScreen({ row: baseRow, draft: baseDraft,
    settlement: { id: 7, variance: 0 }, recordFailures: 1 });
  const submit = app.nodes.find((node) => node.type === 'Button' && node.props.label === 'Terima Setoran');
  submit.props.onPress();
  await new Promise(setImmediate);
  submit.props.onPress();
  await new Promise(setImmediate);

  assert.equal(app.records.length, 2);
  assert.equal(app.records[0].idempotencyKey, 'draft-key-1');
  assert.deepEqual(app.records[1], app.records[0]);

  submit.props.onPress();
  await new Promise(setImmediate);
  assert.equal(app.records[2].idempotencyKey, 'draft-key-2');
});

test('closing and reopening after timeout retains the saved key and request body', async () => {
  const attempts = new Map();
  const app = mountScreen({ row: baseRow, draft: baseDraft,
    settlement: { id: 7, variance: 0 }, recordFailures: 1, attempts });
  const submit = app.nodes.find((node) => node.type === 'Button' && node.props.label === 'Terima Setoran');
  const close = app.nodes.find((node) => node.type === 'IconButton' && node.props.label === 'Tutup');
  submit.props.onPress();
  await new Promise(setImmediate);
  close.props.onPress();
  const reopened = mountScreen({ row: baseRow, draft: baseDraft,
    settlement: { id: 7, variance: 0 }, attempts });
  reopened.nodes.find((node) => node.type === 'Button' && node.props.label === 'Terima Setoran').props.onPress();
  await new Promise(setImmediate);
  assert.equal(app.records[0].idempotencyKey, 'draft-key-1');
  assert.deepEqual(reopened.records[0], app.records[0]);
});

test('saved Setoran attempt restores its exact money and key before retry', async () => {
  const saved = { idempotencyKey: 'restored-key', cartId: 18, date: undefined,
    cash: 12000, qris: 34000, transfer: 5000, varianceReason: 'beda tunai' };
  const attempts = new Map([['18:today', saved]]);
  const app = mountScreen({ row: baseRow, draft: baseDraft,
    settlement: { id: 7, variance: 0 }, attempts, runEffects: true });
  for (const effect of app.effects) effect();
  await new Promise(setImmediate);
  app.rerender();
  assert.equal(app.nodes.find((node) => node.type === 'Input' && node.props.label === 'Tunai / Cash').props.value, '12000');
  assert.equal(app.nodes.find((node) => node.type === 'Input' && node.props.label === 'QRIS / Online').props.value, '34000');
  assert.equal(app.nodes.find((node) => node.type === 'Input' && node.props.label === 'Transfer').props.value, '5000');
  assert.equal(app.nodes.find((node) => node.type === 'Input' && node.props.label === 'Tunai / Cash').props.editable, false);
  app.nodes.find((node) => node.type === 'Button' && node.props.label === 'Terima Setoran').props.onPress();
  await new Promise(setImmediate);
  assert.deepEqual(JSON.parse(JSON.stringify(app.records[0])), JSON.parse(JSON.stringify(saved)));
});

test('Setoran approval maps returned and rejected cups and preserves loading controls', async () => {
  const draft = { ...baseDraft, lines: [
    { product_id: 3, product_name: 'Kopi', qty_remaining: 3 },
    { product_id: 4, product_name: 'Teh', qty_remaining: 2 },
  ] };
  const app = mountScreen({ row: { ...baseRow, settlement_id: 7 }, draft,
    settlement: { id: 7, variance: 0 } });
  const steppers = app.nodes.filter((node) => node.type === 'QtyStepper');
  steppers[0].props.onChange(2);
  steppers[1].props.onChange(1);
  steppers[3].props.onChange(2);
  app.rerender();
  const finish = app.nodes.find((node) => node.type === 'Button' && node.props.label === 'Selesaikan Setoran');
  assert.equal(finish.props.disabled, false);
  finish.props.onPress();
  await new Promise(setImmediate);
  assert.deepEqual(app.approvals, [{ settlementId: 7, lines: [
    { product_id: 3, qty_returned: 2, qty_rejected: 1 },
    { product_id: 4, qty_returned: 0, qty_rejected: 2 },
  ] }]);
  const recording = mountScreen({ row: baseRow, draft: baseDraft, settlement: { id: 7, variance: 0 }, recordPending: true });
  const deposit = recording.nodes.find((node) => node.type === 'Button' && node.props.label === 'Terima Setoran');
  assert.equal(deposit.props.loading, true);
  assert.equal(deposit.props.disabled, true);
  const approving = mountScreen({ row: { ...baseRow, settlement_id: 7 }, draft,
    settlement: { id: 7, variance: 0 }, approvePending: true });
  const pendingFinish = approving.nodes.find((node) => node.type === 'Button' && node.props.label === 'Selesaikan Setoran');
  assert.equal(pendingFinish.props.loading, true);
  assert.equal(pendingFinish.props.disabled, true);
});
