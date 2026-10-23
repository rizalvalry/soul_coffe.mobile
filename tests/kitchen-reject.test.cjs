const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

function load(path) {
  const source = readFileSync(join(__dirname, '..', path), 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
  } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(output, { module, exports: module.exports });
  return module.exports;
}

test('Reject Dapur tile follows create ability, including override to Runner', () => {
  const { menuForUser } = load('src/features/navigation/menu.ts');
  const route = '/kitchen/reject';
  assert.ok(menuForUser({ role: 'BARISTA', abilities: { kitchen_reject: ['view', 'create'] } })
    .some((item) => item.route === route));
  assert.ok(!menuForUser({ role: 'BARISTA', abilities: { kitchen_reject: ['view'] } })
    .some((item) => item.route === route));
  assert.ok(menuForUser({ role: 'RIDER', abilities: { kitchen_reject: ['view', 'create'] } })
    .some((item) => item.route === route));
  assert.ok(menuForUser({ role: 'FINANCE', abilities: { kitchen_reject: ['view', 'create', 'edit'] } })
    .some((item) => item.route === route));
  assert.ok(!menuForUser({ role: 'CONTENT_CREATOR', abilities: {} })
    .some((item) => item.route === route));
});

test('Reject form requires product, reason, fresh photo selection, and OTHER note', () => {
  const { validateKitchenReject: check } = load('src/features/kitchenReject/validation.ts');
  const line = [{ product_id: 1, qty: 2 }];
  assert.ok(check([], { 1: 5 }, 'DROPPED', '', 'photo.jpg'));
  assert.ok(check(line, { 1: 5 }, null, '', 'photo.jpg'));
  assert.ok(check(line, { 1: 5 }, 'OTHER', '', 'photo.jpg'));
  assert.ok(check(line, { 1: 5 }, 'DROPPED', '', null));
  assert.ok(check(line, { 1: 1 }, 'DROPPED', '', 'photo.jpg'));
  assert.ok(check([{ product_id: 1, qty: 10000 }], { 1: 10000 }, 'DROPPED', '', 'photo.jpg'));
  assert.equal(check(line, { 1: 5 }, 'DROPPED', '', 'photo.jpg'), null);
});
