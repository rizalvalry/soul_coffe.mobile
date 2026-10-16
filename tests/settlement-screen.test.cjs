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

function mountScreen({ row, draft, settlement, queueRows = [row] }) {
  const alerts = [];
  const records = [];
  const stateUpdates = [];
  const jsx = (type, props) => ({ type, props: props ?? {} });
  const sessionRows = queueRows;
  const modules = {
    react: {
      useCallback: (fn) => fn,
      useEffect: () => {},
      useMemo: (fn) => fn(),
      useState: (initial) => [initial, (next) => stateUpdates.push(next)],
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
    '@/components/ui/Section': { SectionTitle: 'SectionTitle' },
    '@/components/ui/Touchable': { Touchable: 'Touchable' },
    '@/features/settlements/queries': {
      useSettlementQueue: () => ({ data: sessionRows, isLoading: false, isError: false }),
      useSettlementDraft: () => ({ data: draft, isLoading: false }),
      useRecordSettlement: () => ({ isPending: false, mutateAsync: async (input) => {
        records.push(input);
        return settlement;
      } }),
      useApproveSettlement: () => ({ isPending: false }),
    },
    '@/features/settlements/expectations': expectationModule.exports,
    '@/features/settlements/navigation': { settlementTarget: () => ({ cartId: row.cart_id }) },
    '@/lib/api': { ApiError: class ApiError extends Error {} },
    '@/theme': {
      brand: { 600: '#123' }, feedback: { dangerFg: '#f00' }, neutral: { 0: '#fff' },
      radius: { md: 8, lg: 12 },
      semantic: { textMuted: '#666', textSubtle: '#999', border: '#ccc', surfaceSunken: '#eee', bg: '#fff' },
      space: { xxs: 2, sm: 8, md: 12, lg: 16 },
    },
  };
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
  visit(sandboxModule.exports.default());
  return { nodes, alerts, records, stateUpdates };
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

test('queue keeps API order and form shows per-method values with an enabled zero-money submit', async () => {
  const app = mountScreen({ row: baseRow, draft: baseDraft,
    settlement: { id: 7, variance: -80000 },
    queueRows: [baseRow, { ...baseRow, cart_id: 19, cart_code: '0019', arrived_at: null }],
  });
  const queue = app.nodes.filter((node) => node.type === 'Touchable');
  assert.deepEqual(queue.map((node) => node.props.accessibilityLabel), [
    'Setoran gerobak 0018', 'Setoran gerobak 0019',
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
