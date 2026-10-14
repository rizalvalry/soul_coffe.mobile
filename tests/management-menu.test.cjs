const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

function loadTypeScript(path) {
  const source = readFileSync(join(__dirname, '..', path), 'utf8');
  const javascript = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(javascript, { module, exports: module.exports });
  return module.exports;
}

test('Management login role shows the Finance menu and its own label', () => {
  const roles = loadTypeScript('src/domain/roles.ts');
  const navigation = loadTypeScript('src/features/navigation/menu.ts');
  const demo = loadTypeScript('src/features/demo/seed.ts');

  assert.equal(roles.isRole('MANAGEMENT'), true);
  assert.equal(roles.roleMeta.MANAGEMENT.label, 'Management');
  assert.equal(roles.roleMeta.MANAGEMENT.home, '/menu');
  assert.equal(navigation.menuByRole.MANAGEMENT, navigation.menuByRole.FINANCE);
  assert.equal(demo.USERS.find((user) => user.role === 'MANAGEMENT')?.password, '');
});
