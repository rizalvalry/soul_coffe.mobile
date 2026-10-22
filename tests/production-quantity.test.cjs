const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

function source(path) { return readFileSync(join(__dirname, '..', path), 'utf8'); }
function load(path) {
  const code = ts.transpileModule(source(path), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports });
  return module.exports;
}

test('Produksi has one 9,999 cup limit shared by Brew, Allocation and Add Stock', () => {
  const { MAX_PRODUCTION_QTY } = load('src/features/showcase/quantity.ts');
  assert.equal(MAX_PRODUCTION_QTY, 9999);
  for (const screen of ['brew.tsx', 'allocations.tsx', 'add-stock.tsx']) {
    assert.match(source(`app/(app)/barista/${screen}`), /MAX_PRODUCTION_QTY/);
  }
  const allocations = source('app/(app)/barista/allocations.tsx');
  assert.match(allocations, /kitchenStock\.data\.find/);
  assert.match(allocations, /stockShortages\.length > 0 \? <Banner tone="warning"/);
  assert.match(allocations, /disabled=\{[^\n]*stockShortages\.length > 0/);
  assert.doesNotMatch(allocations, /setQty\(\(current\) =>/);
  assert.match(source('app/(app)/barista/add-stock.tsx'), /Math\.min\(available, MAX_PRODUCTION_QTY\)/);
  assert.match(source('app/(app)/staff/refill/new.tsx'), /const MAX_PER_LINE = 100/);
});

test('stepper formats four digits and clamps button and typed quantities', () => {
  const { clampQty, formatQty, parseQtyInput } = load('src/components/ui/quantity.ts');
  assert.equal(formatQty(1250), '1.250');
  assert.equal(formatQty(9999), '9.999');
  assert.equal(clampQty(1250, 0, 9999), 1250);
  assert.equal(clampQty(10000, 0, 9999), 9999);
  assert.equal(clampQty(-1, 0, 9999), 0);
  assert.equal(clampQty(151, 0, 150), 150);
  assert.equal(parseQtyInput('1250', 0, 9999), 1250);
  assert.equal(parseQtyInput('1.250', 0, 9999), 1250);
  assert.equal(parseQtyInput('10000', 0, 9999), 9999);
  assert.equal(parseQtyInput('151', 0, 150), 150);
  assert.equal(parseQtyInput('', 0, 9999), 0);
  const stepper = source('src/components/ui/QtyStepper.tsx');
  assert.match(stepper, /value=\{formatQty\(value\)\}/);
  assert.match(stepper, /parseQtyInput\(text, min, max\)/);
  assert.match(stepper, /keyboardType="number-pad"/);
  assert.match(stepper, /Math\.max\(value, max\) >= 1000 && styles\.inputWide/);
  assert.match(stepper, /inputWide: \{ width: 76 \}/);
  assert.match(stepper, /width: 58/);
  // On a 360 dp screen, Screen + Card take 64 dp; the wide control takes 188 dp.
  assert.ok(48 + 76 + 48 + 2 * 8 < 360 - 4 * 16);
});
