const assert = require('node:assert/strict');
const { readFileSync, readdirSync } = require('node:fs');
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

test('BARISTA keeps its role code and routes while showing Produksi', () => {
  const roles = loadTypeScript('src/domain/roles.ts');
  const navigation = loadTypeScript('src/features/navigation/menu.ts');
  const demo = loadTypeScript('src/features/demo/seed.ts');

  assert.equal(roles.isRole('BARISTA'), true);
  assert.equal(roles.roleMeta.BARISTA.label, 'Produksi');
  assert.ok(navigation.menuByRole.BARISTA.some((item) => item.route === '/barista/add-stock'));
  assert.equal(navigation.menuByRole.STAFF.find((item) => item.id === 'staff-absen')?.sublabel,
    'Aktif setelah Produksi membuka absen');
  assert.equal(demo.USERS.find((user) => user.role === 'BARISTA')?.name, 'Dimas Produksi');
  assert.match(readFileSync(join(__dirname, '..', 'app', '(app)', 'absen.tsx'), 'utf8'),
    /\{roleMeta\[row\.role\]\.label\}/);
});

function screenFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? screenFiles(path) : /\.[jt]sx?$/.test(entry.name) ? [path] : [];
  });
}

function sitemapFor(files) {
  return {
    contextKey: './(app)/_layout.tsx',
    isGenerated: false,
    isInternal: false,
    children: files.map((file) => ({
      contextKey: `./${file.replaceAll('\\', '/')}`,
      isGenerated: false,
      isInternal: false,
      children: [],
    })),
  };
}

test('every visible role menu item has a real app screen', () => {
  const { menuByRole, menuItemsWithScreens } = loadTypeScript('src/features/navigation/menu.ts');
  const files = screenFiles(join(__dirname, '..', 'app', '(app)'))
    .map((file) => file.slice(join(__dirname, '..', 'app').length + 1));
  const sitemap = sitemapFor(files);
  const missing = ['/staff/settlement', '/finance/reports', '/admin/users', '/creator/studio'];
  const routes = new Set(files.map((file) => `/${file.replace(/\.[jt]sx?$/, '').split(/[\\/]/)
    .filter((part) => part !== 'index' && !/^\(.+\)$/.test(part)).join('/')}`));

  for (const [role, items] of Object.entries(menuByRole)) {
    const visible = menuItemsWithScreens(items, sitemap);
    assert.ok(visible.length > 0, `${role} should retain its implemented screens`);
    assert.ok(visible.every((item) => !missing.includes(item.route)), `${role} shows a missing route`);
    assert.deepEqual(visible.map((item) => item.route), items.filter((item) => routes.has(item.route)).map((item) => item.route));
    for (const item of visible) {
      assert.ok(routes.has(item.route), `${role} ${item.route} has no screen`);
    }
  }
});

test('assignment menu and route are gone for every role', () => {
  const { menuByRole } = loadTypeScript('src/features/navigation/menu.ts');
  for (const [role, items] of Object.entries(menuByRole)) {
    assert.ok(!items.some((item) => item.id === 'admin-assignments' || item.route === '/admin/assignments'), role);
  }

  const routes = screenFiles(join(__dirname, '..', 'app'));
  assert.ok(!routes.some((path) => /[\\/]admin[\\/]assignments\.[jt]sx?$/.test(path)));
});

test('adding a screen exposes its existing menu item without changing the menu config', () => {
  const { menuByRole, menuItemsWithScreens } = loadTypeScript('src/features/navigation/menu.ts');
  const sitemap = sitemapFor(['(app)/finance/reports.tsx']);
  assert.equal(menuItemsWithScreens(menuByRole.FINANCE, sitemap)[0]?.route, '/finance/reports');
  assert.equal(menuItemsWithScreens(menuByRole.MANAGEMENT, sitemap)[0]?.route, '/finance/reports');
});

test('mobile src has no periodic refresh outside the GPS heartbeat', () => {
  const sourceRoot = join(__dirname, '..', 'src');
  const matches = screenFiles(sourceRoot)
    .filter((file) => /refetchInterval|setInterval/.test(readFileSync(file, 'utf8')))
    .map((file) => file.slice(sourceRoot.length + 1).replaceAll('\\', '/'));
  assert.deepEqual(matches, ['features/location/reporter.ts']);
});
