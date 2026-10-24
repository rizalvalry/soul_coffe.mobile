const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const root = join(__dirname, '..');
const snapshot = (value) => JSON.parse(JSON.stringify(value));
const compile = (path) => ts.transpileModule(readFileSync(join(root, path), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
    jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
}).outputText;

function load(path, modules) {
  const result = { exports: {} };
  vm.runInNewContext(compile(path), { module: result, exports: result.exports,
    require: (name) => {
      if (Object.hasOwn(modules, name)) return modules[name];
      assert.fail(`unexpected import: ${name}`);
    },
  });
  return result.exports;
}

function approvalHarness({ pending = false, suspicious = false } = {}) {
  const approvalCalls = [];
  const rejectionCalls = [];
  const states = [];
  let cursor = 0;
  let refetches = 0;
  let queryStatus = { isLoading: false, isError: false, isRefetching: false };
  const refill = {
    id: 42, status: 'SUBMITTED', suspicious, is_suspicious: suspicious,
    lines: [
      { id: 8, product_id: 3, product_name: 'Kopi', unit: 'cup', qty_requested: 3, unit_cost: 12000 },
      { id: 9, product_id: 4, product_name: 'Teh', unit: 'cup', qty_requested: 2, unit_cost: 7000 },
    ],
  };
  const jsx = (type, props) => ({ type, props: props ?? {} });
  const react = {
    useMemo: (fn) => fn(),
    useState: (initial) => {
      const index = cursor++;
      if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial;
      return [states[index], (next) => {
        states[index] = typeof next === 'function' ? next(states[index]) : next;
      }];
    },
  };
  const modules = {
    react,
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-native': { FlatList: 'FlatList', View: 'View', StyleSheet: { create: (styles) => styles } },
    'expo-router': { useRouter: () => ({ back() {} }) },
    '@/components/ui/Screen': { Screen: 'Screen' },
    '@/components/ui/Text': { Text: 'Text' },
    '@/components/ui/Button': { Button: 'Button', IconButton: 'IconButton' },
    '@/components/ui/Card': { Card: 'Card' },
    '@/components/ui/Input': { Input: 'Input' },
    '@/components/ui/QtyStepper': { QtyStepper: 'QtyStepper' },
    '@/components/ui/EmptyState': { EmptyState: 'EmptyState' },
    '@/components/ui/ConnectionBanner': { ConnectionBanner: 'ConnectionBanner' },
    '@/components/ui/Banner': { Banner: 'Banner' },
    '@/components/ui/Skeleton': { SkeletonList: 'SkeletonList' },
    '@/components/ui/ProductThumbnail': { ProductThumbnail: 'ProductThumbnail' },
    '@/components/ui/Section': { MetaRow: 'MetaRow' },
    '@/components/refill/RefillCard': { RefillCard: 'RefillCard', formatRupiah: (value) => String(value) },
    '@/features/refill/queries': {
      useRefills: (status) => {
        assert.equal(status, 'SUBMITTED');
        return { data: [refill], ...queryStatus, refetch: () => { refetches++; } };
      },
      useApproveRefill: () => ({ isPending: pending, mutateAsync: async (body) => { approvalCalls.push(snapshot(body)); } }),
      useRejectRefill: () => ({ isPending: false, mutateAsync: async (body) => { rejectionCalls.push(snapshot(body)); } }),
    },
    '@/features/realtime/RealtimeProvider': { useRealtimeState: () => ({ state: 'connected' }) },
    '@/lib/api': { ApiError: class ApiError extends Error {} },
    '@/theme': { neutral: { 50: '#fff' }, radius: { sm: 4 }, semantic: { textMuted: '#666' },
      space: { sm: 8, md: 12, lg: 16, xxs: 2 } },
  };
  modules['@/features/refill/approvalController'] = {
    get useFinanceApprovalQueue() {
      return load('src/features/refill/approvalController.ts', modules).useFinanceApprovalQueue;
    },
    get useFinanceApprovalCard() {
      return load('src/features/refill/approvalController.ts', modules).useFinanceApprovalCard;
    },
  };
  const screen = load('app/(app)/finance/approvals.tsx', modules).default;
  function nodes(value, result = []) {
    if (Array.isArray(value)) { value.forEach((item) => nodes(item, result)); return result; }
    if (!value || typeof value !== 'object' || !('type' in value)) return result;
    if (typeof value.type === 'function') return nodes(value.type(value.props), result);
    result.push(value);
    nodes(value.props.children, result);
    return result;
  }
  function render() {
    cursor = 0;
    const page = nodes(screen());
    const list = page.find((node) => node.type === 'FlatList');
    const card = list ? nodes(list.props.renderItem({ item: refill, index: 0 })) : [];
    return { page, list, card };
  }
  return { render, approvalCalls, rejectionCalls, setQueryStatus: (next) => { queryStatus = next; },
    get refetches() { return refetches; } };
}

test('Finance approval keeps partial quantities and trimmed reason; suspicious request stays actionable', async () => {
  const app = approvalHarness({ suspicious: true });
  let view = app.render();
  assert.equal(view.card.find((node) => node.type === 'Button' && node.props.label === 'Setujui').props.disabled, false);
  view.card.find((node) => node.type === 'QtyStepper').props.onChange(1);
  view = app.render();
  const approve = view.card.find((node) => node.type === 'Button' && node.props.label === 'Setujui');
  approve.props.onPress();
  assert.equal(app.approvalCalls.length, 0);
  assert.equal(view.card.find((node) => node.type === 'Input' && node.props.label === 'Alasan Pengurangan').props.editable, true);
  view.card.find((node) => node.type === 'Input' && node.props.label === 'Alasan Pengurangan')
    .props.onChangeText('  stok terbatas  ');
  app.render().card.find((node) => node.type === 'Button' && node.props.label === 'Setujui').props.onPress();
  await new Promise(setImmediate);
  assert.deepEqual(app.approvalCalls, [{
    id: 42, lines: [{ line_id: 8, qty_approved: 1 }, { line_id: 9, qty_approved: 2 }],
    partialReason: 'stok terbatas',
  }]);
});

test('Finance reject keeps trimmed reason and pending controls; queue refreshes without polling', async () => {
  const app = approvalHarness();
  let view = app.render();
  assert.equal(view.page.find((node) => node.type === 'ConnectionBanner').props.state, 'connected');
  view.list.props.onRefresh();
  assert.equal(app.refetches, 1);
  view.card.find((node) => node.type === 'Button' && node.props.label === 'Tolak').props.onPress();
  view = app.render();
  view.card.find((node) => node.type === 'Input' && node.props.label === 'Alasan Penolakan')
    .props.onChangeText('  Tidak sesuai  ');
  app.render().card.find((node) => node.type === 'Button' && node.props.label === 'Konfirmasi Tolak').props.onPress();
  await new Promise(setImmediate);
  assert.deepEqual(app.rejectionCalls, [{ id: 42, reason: 'Tidak sesuai' }]);
  const pending = approvalHarness({ pending: true }).render();
  assert.equal(pending.card.find((node) => node.type === 'Button' && node.props.label === 'Setujui').props.loading, true);
  assert.equal(pending.card.find((node) => node.type === 'Button' && node.props.label === 'Setujui').props.disabled, true);
  assert.equal(pending.card.find((node) => node.type === 'QtyStepper').props.disabled, true);
  app.setQueryStatus({ isLoading: true, isError: false, isRefetching: false });
  assert.ok(app.render().page.some((node) => node.type === 'SkeletonList'));
  for (const path of ['app/(app)/finance/approvals.tsx', 'src/features/refill/queries.ts',
    'src/features/realtime/RealtimeProvider.tsx']) {
    assert.doesNotMatch(readFileSync(join(root, path), 'utf8'), /refetchInterval\s*:|setInterval\s*\(/);
  }
});

test('Finance mutation wire bodies remain exact and monetary values stay integer', async () => {
  const calls = [];
  let approveUuid = 0;
  const queryClient = { invalidateQueries: () => Promise.resolve() };
  const common = {
    react: { useRef: (initial) => ({ current: initial }) },
    '@tanstack/react-query': { useMutation: (options) => options, useQuery: (options) => options,
      useQueryClient: () => queryClient },
    '@/lib/api': { request: async (path, options) => { calls.push({ path, options: snapshot(options) }); return {}; },
      uuidv4: () => `approval-key-${++approveUuid}` },
  };
  const settlements = load('src/features/settlements/queries.ts', {
    ...common, '@/features/refill/queries': { qk: { kitchenStock: ['stock'] } },
    '@/features/showcase/queries': { showcaseKeys: { stock: ['showcase'] } },
  });
  await settlements.useRecordSettlement().mutationFn({
    idempotencyKey: 'deposit-key', cartId: 18, cash: 40000, qris: 30000,
    transfer: 10000, varianceReason: 'selisih dihitung',
  });
  assert.deepEqual(calls.pop(), { path: '/settlements', options: {
    method: 'POST', idempotencyKey: 'deposit-key',
    body: { cart_id: 18, cash: 40000, qris: 30000, transfer: 10000,
      variance_reason: 'selisih dihitung' },
  } });
  await settlements.useApproveSettlement().mutationFn({ settlementId: 7, lines: [
    { product_id: 3, qty_returned: 2, qty_rejected: 1 },
    { product_id: 4, qty_returned: 0, qty_rejected: 0 },
  ] });
  assert.deepEqual(calls.pop(), { path: '/settlements/7/approve', options: {
    method: 'POST', idempotencyKey: 'approval-key-1',
    body: { lines: [{ product_id: 3, qty_returned: 2, qty_rejected: 1 }] },
  } });
  const clearing = load('src/features/clearing/queries.ts', common);
  const input = { uuid: 'receipt-key', received_on: '2026-10-20', amount_minor: 900,
    mdr_minor: 100, bank_account_id: 2, sale_dates: ['2026-10-18'] };
  await clearing.useRecordClearing().mutationFn(input);
  assert.deepEqual(calls.pop(), { path: '/clearing-receipts',
    options: { method: 'POST', idempotencyKey: 'receipt-key', body: input } });
  await clearing.useVoidClearing().mutationFn({ id: 4, reason: 'Koreksi', key: 'void-key' });
  assert.deepEqual(calls.pop(), { path: '/clearing-receipts/4/void',
    options: { method: 'POST', idempotencyKey: 'void-key', body: { reason: 'Koreksi' } } });
  await clearing.useMatchClearing().mutationFn({ id: 4, sale_dates: ['2026-10-18'], uuid: 'match-key' });
  assert.deepEqual(calls.pop(), { path: '/clearing-receipts/4/match',
    options: { method: 'POST', idempotencyKey: 'match-key',
      body: { uuid: 'match-key', sale_dates: ['2026-10-18'] } } });
  assert.ok([40000, 30000, 10000, 900, 100].every(Number.isSafeInteger));
});
