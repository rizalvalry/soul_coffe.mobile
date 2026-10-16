const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const source = readFileSync(join(__dirname, '..', 'src/features/settlements/expectations.ts'), 'utf8');
const javascript = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const sandboxModule = { exports: {} };
vm.runInNewContext(javascript, { module: sandboxModule, exports: sandboxModule.exports });
const { settlementExpectations } = sandboxModule.exports;

test('current draft wins over queue values and preserves zero rupiah methods', () => {
  const row = { expected_total: 90000, expected_cash_minor: 90000, expected_qris_minor: 0, expected_transfer_minor: 0 };
  const draft = { expected_total: 80000, expected_total_minor: 80000, expected_cash_minor: 40000,
    expected_qris_minor: 40000, expected_transfer_minor: 0 };
  assert.deepEqual({ ...settlementExpectations(draft, row) }, {
    total: 80000, cash: 40000, qris: 40000, transfer: 0,
  });
});

test('old API without method fields falls back to expected_total_minor', () => {
  const row = { expected_total_minor: 90000 };
  const draft = { expected_total_minor: 80000 };
  assert.deepEqual({ ...settlementExpectations(draft, row) }, {
    total: 80000, cash: null, qris: null, transfer: null,
  });
});

test('old draft keeps its total and does not mix in a newer queue snapshot', () => {
  const row = { expected_total: 90000, expected_total_minor: 90000,
    expected_cash_minor: 50000, expected_qris_minor: 30000, expected_transfer_minor: 10000 };
  const draft = { expected_total: 80000 };
  assert.deepEqual({ ...settlementExpectations(draft, row) }, {
    total: 80000, cash: null, qris: null, transfer: null,
  });
});
