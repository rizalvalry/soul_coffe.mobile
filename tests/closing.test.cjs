const assert = require('node:assert/strict');
const { readFileSync, existsSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const root = join(__dirname, '..');
const source = (path) => readFileSync(join(root, path), 'utf8');
const compiled = ts.transpileModule(source('src/features/closing/calculation.ts'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const moduleState = { exports: {} };
vm.runInNewContext(compiled, { module: moduleState, exports: moduleState.exports });
const { closingTotals } = moduleState.exports;

test('closing calculates handover plus refill and carry, less remaining and waste', () => {
  const result = closingTotals(
    [{ product_id: 1, qty_in: 25, qty_carry: 2, qty_office_sold: 0, unit_price_minor: 20000 }],
    { 1: 3 }, { 1: 2 }, 100000, 20000,
  );
  assert.equal(result.valid, true);
  assert.equal(result.soldByProduct[1], 22);
  assert.equal(result.total, 440000);
  assert.equal(result.cash, 320000);
});

test('closing rejects negative sold and noncash above sale total', () => {
  const lines = [{ product_id: 1, qty_in: 10, qty_carry: 0, qty_office_sold: 0, unit_price_minor: 20000 }];
  assert.equal(closingTotals(lines, { 1: 9 }, { 1: 2 }, 0, 0).valid, false);
  assert.equal(closingTotals(lines, { 1: 5 }, { 1: 0 }, 100001, 0).valid, false);
});

test('Closing excludes office cups from Rider total and only shows the office row when sold', () => {
  const result = closingTotals(
    [{ product_id: 1, qty_in: 10, qty_carry: 0, qty_office_sold: 2, unit_price_minor: 20000 }],
    { 1: 3 }, { 1: 0 }, 0, 0,
  );
  assert.equal(result.valid, true);
  assert.equal(result.soldByProduct[1], 5);
  assert.equal(result.cash, 100000);
  assert.equal(closingTotals(
    [{ product_id: 1, qty_in: 10, qty_carry: 0, qty_office_sold: 2, unit_price_minor: 20000 }],
    { 1: 9 }, { 1: 0 }, 0, 0,
  ).valid, false);
  const screen = source('app/(app)/staff/closing.tsx');
  assert.match(screen, /line\.qty_office_sold > 0 \?[^]*Dijual kantor/);
});

test('Closing shows saved commission and progress from the server response', () => {
  const screen = source('app/(app)/staff/closing.tsx');
  const queries = source('src/features/closing/queries.ts');
  assert.match(screen, /commissionSummary\(draft\.data\.commission\)\.earned/);
  assert.match(screen, /commissionSummary\(draft\.data\.commission\)\.progress/);
  assert.match(queries, /commission: \{/);
  const compiledCommission = ts.transpileModule(source('src/features/closing/commission.ts'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const state = { exports: {} };
  vm.runInNewContext(compiledCommission, { module: state, exports: state.exports });
  const result = state.exports.commissionSummary({
    has_closing: true, cups_sold: 150, commission_minor: 150000,
    tier_min_cups: 100, amount_per_cup_minor: 1000,
    next_tier_min_cups: 200, cups_to_next_tier: 50, locked: false,
  });
  assert.match(result.earned, /150 cup.*Rp 150\.000.*tier ≥100/);
  assert.equal(result.progress, '50 cup lagi buat sampai tier ≥200.');
});

test('Rider menu and route use Closing, with no new sale form', () => {
  const menu = source('src/features/navigation/menu.ts');
  const screen = source('app/(app)/staff/closing.tsx');
  assert.match(menu, /label: 'Closing'/);
  assert.match(menu, /route: '\/staff\/closing'/);
  assert.doesNotMatch(menu, /Catat Penjualan|staff-sell/);
  assert.equal(existsSync(join(root, 'app/(app)/staff/sell.tsx')), false);
  assert.match(screen, /useOfflineSalesQueue\(\)/);
  assert.match(screen, /oldSales\.rejected/);
  assert.doesNotMatch(screen, /oldSales\.enqueue/);
  assert.match(screen, /productImageSource/);
});

test('Closing syncs old pending sales before submit and shows the queue when draft fails', () => {
  const screen = source('app/(app)/staff/closing.tsx');
  const queue = source('src/features/sales/useOfflineSalesQueue.ts');
  assert.match(queue, /syncBeforeClosing/);
  assert.ok(screen.indexOf('oldSales.syncBeforeClosing()') < screen.indexOf('record.mutateAsync'));
  assert.match(screen, /closingSubmissionGate\(sync, \(\) => draft.refetch\(\)\)/);
  assert.ok(screen.indexOf('oldSales.queue.length > 0') > screen.indexOf(') : null}'));
  assert.match(screen, /\(!needsFreshDraft && !totals.valid\)/);
});

test('failed draft refresh after old sales sync cannot unlock Closing submit', async () => {
  const compiledGate = ts.transpileModule(source('src/features/closing/submissionGate.ts'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const gateModule = { exports: {} };
  vm.runInNewContext(compiledGate, { module: gateModule, exports: gateModule.exports });
  const gate = gateModule.exports.closingSubmissionGate;
  assert.equal(await gate({ ready: false, hadPending: true }, async () => ({ isSuccess: true, data: {} })), 'pending');
  assert.equal(await gate({ ready: true, hadPending: true }, async () => ({ isSuccess: false, data: { stale: true } })), 'refresh_failed');
  assert.equal(await gate({ ready: true, hadPending: true }, async () => ({ isSuccess: true, data: { fresh: true } })), 'review');
  assert.equal(await gate({ ready: true, hadPending: false }, async () => { throw new Error('unexpected refresh'); }), 'ready');
});

test('Finance can re-record a stale settlement from current Closing numbers', () => {
  const screen = source('app/(app)/finance/settlements.tsx');
  assert.match(screen, /Catat ulang setoran/);
  assert.match(screen, /draftQuery.refetch\(\)/);
  assert.match(screen, /setReRecord\(true\)/);
  assert.match(screen, /line.qty_wasted/);
});

test('Closing, settlement, and Tutup Coffee Bike use the current name', () => {
  for (const path of [
    'app/(app)/staff/closing.tsx',
    'app/(app)/finance/settlements.tsx',
    'app/(app)/barista/close-out.tsx',
  ]) {
    const screen = source(path);
    assert.match(screen, /Coffee Bike/);
    assert.doesNotMatch(screen, /gerobak/i);
  }
  assert.match(source('app/(app)/barista/close-out.tsx'), /Tutup Coffee Bike/);
});
