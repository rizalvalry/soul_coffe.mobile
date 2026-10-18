const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

function source(path) { return readFileSync(join(__dirname, '..', path), 'utf8'); }

function renderRequestDetail(role) {
  const enabled = [];
  const Button = () => null;
  const Banner = () => null;
  const jsx = (type, props) => ({ type, props });
  const code = ts.transpileModule(source('app/(app)/staff/requests/[id].tsx'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} };
  const theme = new Proxy({}, { get: () => 'x' });
  const modules = {
    react: { useCallback: (fn) => fn, useState: (value) => [value, () => {}] },
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: Symbol('Fragment') },
    'react-native': { Alert: {}, StyleSheet: { create: (styles) => styles }, View: () => null, Image: () => null },
    'expo-router': { useLocalSearchParams: () => ({ id: '4' }), useRouter: () => ({ back() {}, push() {} }) },
    '@expo/vector-icons/MaterialCommunityIcons': () => null,
    'react-native-reanimated': { View: () => null },
    '@/components/ui/Screen': { Screen: () => null },
    '@/components/ui/Text': { Text: () => null },
    '@/components/ui/Button': { Button, IconButton: () => null },
    '@/components/ui/Card': { Card: () => null },
    '@/components/ui/Badge': { StatusBadge: () => null },
    '@/components/ui/EmptyState': { EmptyState: () => null },
    '@/components/ui/Banner': { Banner },
    '@/components/ui/Skeleton': { SkeletonCard: () => null },
    '@/components/ui/Section': { MetaRow: () => null },
    '@/components/ui/Motion': { enter: () => null },
    '@/components/refill/RefillTimeline': { RefillTimeline: () => null },
    '@/components/refill/RefillCard': { formatRupiah: () => '' },
    '@/features/refill/queries': { useRefill: () => ({ isLoading: true }), useCancelRefill: () => ({ isPending: false }) },
    '@/features/auth/store': { useAuth: (selector) => selector({ session: { user: { role } } }) },
    '@/features/showcase/queries': { useAttendanceStatus: (value) => { enabled.push(value); return { data: { staff_window_open: true, has_clocked_in: false } }; } },
    '@/features/showcase/riderDayGate': { riderDayGate: () => 'attendance', riderGateMessage: () => 'Buka Absen dulu', isDayNotOpen: () => false },
    '@/lib/api': { ApiError: Error },
    '@/theme': { brand: theme, feedback: theme, neutral: theme, radius: theme, semantic: theme, space: theme },
  };
  vm.runInNewContext(code, { module, exports: module.exports, require: (name) => {
    assert.ok(Object.hasOwn(modules, name), `unexpected import: ${name}`);
    return modules[name];
  } });
  const tree = module.exports.default();
  const nodes = [];
  function visit(node) {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!node || typeof node !== 'object') return;
    nodes.push(node);
    visit(node.props?.children);
  }
  visit(tree);
  return { enabled, buttons: nodes.filter((node) => node.type === Button).map((node) => node.props.label), banners: nodes.filter((node) => node.type === Banner) };
}

test('Finance and Management request detail shows no attendance banner or button', () => {
  for (const role of ['FINANCE', 'MANAGEMENT']) {
    const screen = renderRequestDetail(role);
    assert.deepEqual(screen.enabled, [false]);
    assert.deepEqual(screen.buttons, []);
    assert.deepEqual(screen.banners, []);
  }
});

test('Rider request detail still offers Absen when the day gate requires it', () => {
  const screen = renderRequestDetail('STAFF');
  assert.deepEqual(screen.enabled, [true]);
  assert.deepEqual(screen.buttons, ['Buka Absen']);
  assert.equal(screen.banners.length, 1);
});

test('other roles get a read-only attendance screen; Rider-only forms scope the gate', () => {
  const absen = source('app/(app)/absen.tsx');
  assert.match(absen, /if \(!canAttend\) \{/);
  assert.match(absen, /<Text variant="h2">Daftar Hadir<\/Text>/);
  assert.match(absen, /if \(canAttend\) void locate\(\)/);
  for (const path of ['app/(app)/staff/refill/new.tsx']) {
    const file = source(path);
    assert.match(file, /useAttendanceStatus\(user\?\.role === 'STAFF'\)/);
    assert.match(file, /user\?\.role === 'STAFF' \? riderDayGate\(.*?\.data\) : 'legacy'/);
  }
  assert.match(source('app/(app)/staff/closing.tsx'), /useClosingDraft\(\)/);
});

test('only Produksi and Rider have an Absen menu entry', () => {
  const code = ts.transpileModule(source('src/features/navigation/menu.ts'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, require: (name) => {
    assert.fail(`unexpected import: ${name}`);
  } });
  for (const [role, items] of Object.entries(module.exports.menuByRole)) {
    assert.equal(items.some((item) => item.route === '/absen'), role === 'BARISTA' || role === 'STAFF', role);
  }
});
