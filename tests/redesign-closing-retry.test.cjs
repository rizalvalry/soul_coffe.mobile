const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const root = join(__dirname, '..');
const source = (file) => readFileSync(join(root, file), 'utf8');
const compile = (file, jsx = false) => ts.transpileModule(source(file), { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
  jsx: jsx ? ts.JsxEmit.ReactJSX : undefined, esModuleInterop: true,
} }).outputText;

function moduleOf(file, modules, jsx = false) {
  const state = { exports: {} };
  vm.runInNewContext(compile(file, jsx), { module: state, exports: state.exports,
    require: (name) => { assert.ok(Object.hasOwn(modules, name), `unexpected import: ${name}`); return modules[name]; } });
  return state.exports;
}

test('Closing retries the saved draft body and key after a lost response, even without GPS', async () => {
  const lines = [{ product_id: 1, product_name: 'Kopi', qty_in: 5, qty_carry: 0,
    qty_office_sold: 0, qty_remaining: 2, qty_wasted: 0, unit_price_minor: 20000 }];
  const draftData = { cart_id: 8, cart_code: '0008', operating_date: '2026-10-24',
    closing_id: null, can_correct: true, closing_point: null, qris_minor: 0,
    transfer_minor: 0, lines };
  const calculation = moduleOf('src/features/closing/calculation.ts', {});
  const totals = calculation.closingTotals(lines, { 1: 2 }, { 1: 0 }, 10000, 5000);
  assert.deepEqual(JSON.parse(JSON.stringify(totals)), { valid: true, cupsSold: 3,
    soldByProduct: { 1: 3 }, total: 60000, cash: 45000 });
  assert.equal(calculation.closingTotals(lines, { 1: 2.5 }, { 1: 0 }, 0, 0).valid, false);
  assert.equal(calculation.closingTotals(lines, { 1: 2 }, { 1: 0 }, 0.5, 0).valid, false);
  const sent = [];
  const alerts = [];
  const state = [{ 1: '2' }, { 1: '0' }, '0', '0', '', null, false, false];
  const refs = [];
  let stateIndex = 0;
  let refIndex = 0;
  const jsx = (type, props) => ({ type, props: props ?? {} });
  const modules = {
    react: {
      useEffect: () => {}, useMemo: (fn) => fn(),
      useState: (initial) => { const index = stateIndex++;
        if (!(index in state)) state[index] = typeof initial === 'function' ? initial() : initial;
        return [state[index], (next) => { state[index] = typeof next === 'function' ? next(state[index]) : next; }]; },
      useRef: (initial) => { const index = refIndex++; return refs[index] ??= { current: initial }; },
    },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-native': { Alert: { alert: (...args) => alerts.push(args) }, View: 'View',
      StyleSheet: { create: (styles) => styles } },
    'expo-location': { getForegroundPermissionsAsync: async () => ({ granted: false, canAskAgain: false }) },
    'expo-router': { useRouter: () => ({ replace() {} }) },
    '@/components/ui/Screen': { Screen: 'Screen' },
    '@/components/ui/Text': { Text: 'Text' },
    '@/components/ui/Card': { Card: 'Card' },
    '@/components/ui/Button': { Button: 'Button' },
    '@/components/ui/Input': { Input: 'Input' },
    '@/components/ui/Banner': { Banner: 'Banner' },
    '@/components/ui/EmptyState': { EmptyState: 'EmptyState' },
    '@/components/ui/Skeleton': { SkeletonList: 'SkeletonList' },
    '@/components/ui/ProductThumbnail': { ProductThumbnail: 'ProductThumbnail' },
    '@/features/refill/queries': { useProducts: () => ({ data: [] }) },
    '@/features/closing/queries': { useClosingDraft: () => ({ data: draftData,
      refetch: async () => ({ isSuccess: true, data: draftData }) }),
      useRecordClosing: () => ({ isPending: false, mutateAsync: async (input) => {
        sent.push(input);
        if (sent.length === 1) throw new Error('lost response');
        return draftData;
      } }) },
    '@/features/closing/calculation': calculation,
    '@/features/closing/submissionGate': { closingSubmissionGate: async () => 'ready' },
    '@/features/closing/commission': { commissionSummary: () => ({ earned: '', progress: '' }) },
    '@/features/closing/locationCheck': { closingLocationMessage: () => 'Lokasi tidak tersedia' },
    '@/features/closing/formState': { closingFormSignature: () => 'unchanged' },
    '@/features/sales/useOfflineSalesQueue': { useOfflineSalesQueue: () => ({ queue: [], rejected: [],
      legacyCount: 0, syncBeforeClosing: async () => ({ ready: true, hadPending: false }) }) },
    '@/lib/api': { ApiError: class ApiError extends Error {}, uuidv4: () => 'closing-key' },
    '@/theme': { semantic: { textMuted: '#666' }, space: { md: 12, sm: 8, xxs: 2 } },
  };
  const screen = moduleOf('app/(app)/staff/closing.tsx', modules, true).default;
  function button() {
    stateIndex = 0;
    refIndex = 0;
    const nodes = [];
    function visit(value) {
      if (Array.isArray(value)) return value.forEach(visit);
      if (!value || typeof value !== 'object' || !('type' in value)) return;
      nodes.push(value);
      visit(value.props.children);
    }
    visit(screen());
    return nodes.find((node) => node.type === 'Button' && node.props.label === 'Kirim Closing');
  }
  for (let attempt = 0; attempt < 2; attempt++) {
    const submit = button();
    assert.equal(submit.props.disabled, false);
    submit.props.onPress();
    await new Promise(setImmediate);
    await alerts.at(-1)[2].find((choice) => choice.text === 'Kirim').onPress();
  }
  assert.equal(sent.length, 2);
  assert.deepEqual(JSON.parse(JSON.stringify(sent[1])), JSON.parse(JSON.stringify(sent[0])));
  assert.deepEqual(JSON.parse(JSON.stringify(sent[0])), { key: 'closing-key',
    lines: [{ product_id: 1, qty_remaining: 2, qty_wasted: 0 }], qris: 0, transfer: 0,
    gps: null, note: '' });
});
