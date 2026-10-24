const assert = require('node:assert/strict');
const { readFileSync, existsSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const root = join(__dirname, '..');
const source = (path) => readFileSync(join(root, path), 'utf8');
const compiled = ts.transpileModule(source('src/features/closing/locationCheck.ts'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const state = { exports: {} };
vm.runInNewContext(compiled, { module: state, exports: state.exports });
const { closingLocationMessage } = state.exports;
const formCompiled = ts.transpileModule(source('src/features/closing/formState.ts'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const formState = { exports: {} };
vm.runInNewContext(formCompiled, { module: formState, exports: formState.exports });
const { closingFormSignature } = formState.exports;

test('closing location copy includes distance and never blocks submit', () => {
  const point = { basis: 'kitchen', label: 'Dapur', lat: -6.1751, lng: 106.865, radius_m: 10 };
  assert.match(closingLocationMessage(point, { lat: -6.1751, lng: 106.865 }), /dekat Dapur \(0 m\)/);
  assert.match(closingLocationMessage(point, { lat: -6.1851, lng: 106.865 }), /1,1 km dari Dapur.*tetap bisa dikirim/);
  assert.match(closingLocationMessage(point, null), /GPS belum tersedia.*tetap bisa dikirim/);
  const noPin = { ...point, lat: null, lng: null };
  assert.match(closingLocationMessage(noPin, null), /Pin Dapur belum tersedia.*tanpa tanda lokasi/);
  assert.match(closingLocationMessage(noPin, { lat: -6.1751, lng: 106.865 }), /tanpa tanda lokasi/);
});

test('checking a fresh Closing point does not reset edited cups and payment fields', () => {
  const base = { cart_id: 1, operating_date: '2026-10-20', closing_id: null,
    lines: [{ product_id: 3, qty_in: 10, qty_carry: 0, qty_remaining: 0, qty_wasted: 0 }],
    qris_minor: 0, transfer_minor: 0, closing_point: { label: 'Dapur' } };
  assert.equal(closingFormSignature(base), closingFormSignature({
    ...base, closing_point: { label: 'Blok M' },
  }));
  assert.notEqual(closingFormSignature(base), closingFormSignature({ ...base, qris_minor: 20000 }));
  assert.notEqual(closingFormSignature(base), closingFormSignature({ ...base,
    lines: [{ ...base.lines[0], qty_in: 12 }],
  }));
  assert.match(source('src/features/closing/useClosingController.ts'), /closingFormSignature\(latest\.data\) !== formSignature/);
});

test('Rider setup, Add Stock, Closing, and Setoran have reachable screens', () => {
  assert.equal(existsSync(join(root, 'app/(app)/management/rider-location-setup.tsx')), true);
  assert.equal(existsSync(join(root, 'app/(app)/staff/settlement.tsx')), true);
  assert.match(source('app/(app)/barista/add-stock.tsx'), /Lokasi belum diatur Management/);
  assert.match(source('src/features/closing/useClosingController.ts'), /closingLocationMessage/);
  assert.match(source('src/features/closing/useClosingController.ts'), /requestForegroundPermissionsAsync/);
  assert.match(source('src/features/closing/useClosingController.ts'), /router\.replace\(\{ pathname: '\/staff\/settlement', params: \{ operating_date: saved\.operating_date \} \}\)/);
  assert.match(source('app/(app)/staff/closing.tsx'), /Ada pembeli lagi\? Ubah sisa cups/);
  assert.doesNotMatch(source('app/(app)/staff/settlement.tsx'), /Ada pembeli lagi\? Ubah sisa cups/);
  assert.match(source('src/features/realtime/RealtimeProvider.tsx'), /riderSettlementKey/);
});
