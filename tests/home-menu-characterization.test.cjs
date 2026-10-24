const assert = require('node:assert/strict');
const { readFileSync, readdirSync } = require('node:fs');
const { join, relative } = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const root = join(__dirname, '..');
const menuPath = 'app/(app)/menu.tsx';
const marker = (name) => Object.assign(() => null, { displayName: name });
const components = Object.fromEntries([
  'Screen', 'Text', 'Card', 'Banner', 'CountBadge', 'Chip', 'IconButton',
  'NotificationBell', 'Touchable', 'SoulLogo', 'NewsSlider', 'View',
  'MaterialCommunityIcons', 'AnimatedView',
].map((name) => [name, marker(name)]));

function screenFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? screenFiles(path) : /\.[jt]sx?$/.test(entry.name) ? [path] : [];
  });
}

const sitemap = {
  contextKey: './(app)/_layout.tsx', isGenerated: false, isInternal: false,
  children: screenFiles(join(root, 'app', '(app)')).map((path) => ({
    contextKey: `./${relative(join(root, 'app'), path).replaceAll('\\', '/')}`,
    isGenerated: false, isInternal: false, children: [],
  })),
};

function mount(user, options = {}) {
  const state = {
    user, badges: options.badges, attendance: options.attendance,
    navigation: [], calls: [], attendanceEnabled: [], alert: null,
    refreshing: false, invalidations: [],
  };
  const jsx = (type, props) => ({ type, props });
  const react = {
    useCallback: (callback) => callback,
    useMemo: (calculate) => calculate(),
    useState: (initial) => [initial, (value) => { state.refreshing = value; }],
  };
  const themeValue = new Proxy({}, { get: () => 'theme-value' });
  const fixed = {
    react,
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-native': {
      Alert: { alert: (...args) => { state.alert = args; } },
      StyleSheet: { create: (styles) => styles }, View: components.View,
    },
    'expo-router': {
      useRouter: () => ({ push: (route) => { state.navigation.push(route); } }),
      useSitemap: () => sitemap,
    },
    '@tanstack/react-query': {
      useQueryClient: () => ({ invalidateQueries: (...args) => {
        state.invalidations.push(args); return Promise.resolve();
      } }),
    },
    '@expo/vector-icons/MaterialCommunityIcons': components.MaterialCommunityIcons,
    'react-native-reanimated': { View: components.AnimatedView },
    '@/components/ui/Screen': { Screen: components.Screen },
    '@/components/ui/Text': { Text: components.Text },
    '@/components/ui/Card': { Card: components.Card },
    '@/components/ui/Banner': { Banner: components.Banner },
    '@/components/ui/Badge': { CountBadge: components.CountBadge, Chip: components.Chip },
    '@/components/ui/Button': { IconButton: components.IconButton },
    '@/components/ui/NotificationBell': { NotificationBell: components.NotificationBell },
    '@/components/ui/Touchable': { Touchable: components.Touchable },
    '@/components/ui/Motion': { enter: () => 'entry' },
    '@/components/brand/SoulLogo': { SoulLogo: components.SoulLogo },
    '@/components/news/NewsSlider': { NewsSlider: components.NewsSlider },
    '@/features/auth/store': { useAuth: (selector) => selector({
      session: user ? { user } : null,
      signOut: () => { state.calls.push('signOut'); },
      refreshUser: () => { state.calls.push('refreshUser'); return Promise.resolve(); },
    }) },
    '@/features/refill/queries': { useBadges: () => {
      state.calls.push('useBadges'); return { data: state.badges };
    } },
    '@/features/showcase/queries': { useAttendanceStatus: (enabled) => {
      state.attendanceEnabled.push(enabled); return { data: state.attendance };
    } },
    '@/lib/api': { ApiError: Error },
    '@/theme': {
      brand: themeValue, neutral: themeValue, pressScale: themeValue,
      radius: themeValue, shadow: themeValue, semantic: themeValue,
      space: themeValue, touch: themeValue,
    },
  };
  const localPaths = {
    '@/domain/roles': 'src/domain/roles.ts',
    '@/features/navigation/menu': 'src/features/navigation/menu.ts',
    '@/features/showcase/attendanceTile': 'src/features/showcase/attendanceTile.ts',
    '@/features/showcase/riderDayGate': 'src/features/showcase/riderDayGate.ts',
    '@/features/navigation/useHomeController': 'src/features/navigation/useHomeController.ts',
  };
  const cache = new Map();
  function load(path) {
    if (cache.has(path)) return cache.get(path).exports;
    const source = readFileSync(join(root, path), 'utf8');
    const code = ts.transpileModule(source, { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
      jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
    } }).outputText;
    const module = { exports: {} };
    cache.set(path, module);
    vm.runInNewContext(code, { module, exports: module.exports, require: (name) => {
      if (Object.hasOwn(fixed, name)) return fixed[name];
      assert.ok(Object.hasOwn(localPaths, name), `unexpected import ${name} in ${path}`);
      return load(localPaths[name]);
    } }, { filename: path });
    return module.exports;
  }
  const tree = load(menuPath).default();
  const nodes = [];
  function visit(node) {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!node || typeof node !== 'object') return;
    nodes.push(node);
    visit(node.props?.children);
  }
  visit(tree);
  const of = (name) => nodes.filter((node) => node.type === components[name]);
  const tiles = of('Touchable').map((node) => ({
    label: node.props.accessibilityLabel,
    disabled: node.props.disabled,
    hint: node.props.accessibilityHint,
    onPress: node.props.onPress,
  }));
  return { state, nodes, of, tiles, tree, load };
}

test('home keeps the exact visible tile order and navigation for every role and ability sample', () => {
  const common = ['/news', '/settings'];
  const rider = ['/rider/available', '/rider/active', '/rider/history', ...common];
  const staff = ['/staff/closing', '/staff/refill/new', '/absen', '/staff/requests',
    '/staff/stock', '/staff/settlement', ...common];
  const fullOffice = ['/barista', '/finance/approvals', '/kitchen/reject',
    '/kitchen/close-out', ...common, '/finance/history', '/finance/settlements',
    '/finance/clearing', '/management/rider-location-setup'];
  const cases = [
    { role: 'ADMINISTRATOR', routes: common },
    { role: 'MANAGEMENT', routes: common },
    { role: 'FINANCE', routes: common },
    { role: 'BARISTA', routes: ['/absen', ...common] },
    { role: 'RIDER', routes: rider },
    { role: 'STAFF', routes: staff },
    { role: 'CONTENT_CREATOR', routes: common },
    { role: 'STAFF', abilities: {
      settlements: ['view'], kitchen_operations: ['view', 'edit'],
      cart_close_out: ['view', 'edit'], kitchen_reject: ['create'], refill_approval: ['edit'],
    }, routes: ['/staff/closing', '/barista', '/finance/approvals', '/kitchen/reject',
      '/kitchen/close-out', '/staff/refill/new', '/absen', '/staff/requests',
      '/staff/stock', '/staff/settlement', ...common, '/finance/settlements'] },
    { role: 'FINANCE', abilities: {
      refill_approval: ['view', 'edit'], settlements: ['view'], clearing: ['view'],
      reports: ['view'], rider_location_setup: ['edit'], kitchen_operations: ['view', 'edit'],
      cart_close_out: ['view', 'edit'], kitchen_reject: ['create'],
    }, routes: fullOffice },
    { role: 'BARISTA', abilities: { kitchen_operations: ['view'] },
      routes: ['/absen', '/barista/requests', '/barista/stock', '/barista/history', ...common] },
    { role: 'BARISTA', abilities: { kitchen_operations: ['view', 'edit'], kitchen_reject: ['create'] },
      routes: ['/kitchen/reject', '/barista/add-stock', '/barista/brew',
        '/barista/allocations', '/absen', '/barista/requests', '/barista/preparing',
        '/barista/stock', '/barista/history', ...common] },
    { role: 'ADMINISTRATOR', isSuperAdmin: true, routes: fullOffice },
  ];
  for (const { role, abilities = {}, isSuperAdmin = false, routes } of cases) {
    const app = mount({ name: role, role, abilities, isSuperAdmin });
    assert.equal(app.tiles.length, routes.length, role);
    app.tiles.forEach((tile) => tile.onPress());
    assert.deepEqual(app.state.navigation, routes, role);
    assert.equal(new Set(app.tiles.map((tile) => tile.label)).size, app.tiles.length, role);
  }
});

test('badge numbers come from useBadges and update on a new render with the same server fields', () => {
  const counts = { pendingApprovals: 7, incomingRequests: 4, readyToPick: 3, myRequests: 2 };
  const cases = [
    ['FINANCE', { refill_approval: ['edit'] }, 7],
    ['BARISTA', { kitchen_operations: ['view'] }, 4],
    ['RIDER', {}, 3],
    ['STAFF', {}, 2],
  ];
  for (const [role, abilities, expected] of cases) {
    const user = { name: role, role, abilities };
    const loading = mount(user);
    assert.deepEqual(loading.of('CountBadge').map((node) => node.props.count), [0]);
    const loaded = mount(user, { badges: counts });
    assert.deepEqual(loaded.of('CountBadge').map((node) => node.props.count), [expected]);
    assert.ok(loaded.state.calls.includes('useBadges'));
    const updated = mount(user, { badges: { ...counts, [
      { FINANCE: 'pendingApprovals', BARISTA: 'incomingRequests', RIDER: 'readyToPick', STAFF: 'myRequests' }[role]
    ]: expected + 1 } });
    assert.deepEqual(updated.of('CountBadge').map((node) => node.props.count), [expected + 1]);
  }
});

test('the badge query and inbound realtime event keep the same invalidation path without polling', () => {
  const querySource = readFileSync(join(root, 'src/features/refill/queries.ts'), 'utf8');
  const realtimeSource = readFileSync(join(root, 'src/features/realtime/RealtimeProvider.tsx'), 'utf8');
  const screenSource = readFileSync(join(root, menuPath), 'utf8');
  const controllerSource = (() => {
    try { return readFileSync(join(root, 'src/features/navigation/useHomeController.ts'), 'utf8'); }
    catch (error) { if (error.code === 'ENOENT') return ''; throw error; }
  })();
  assert.match(querySource, /badges: \['badges'\] as const/);
  assert.match(querySource, /export function useBadges\(\)[\s\S]*?queryKey: qk\.badges,[\s\S]*?request<BadgeCounts>\('\/badges'\)/);
  assert.match(querySource, /export function invalidateRefillData\([\s\S]*?invalidateQueries\(\{ queryKey: qk\.badges \}\)/);
  assert.match(realtimeSource, /const dispatch = \(raw: unknown\)[\s\S]*?invalidateRefillData\(client, event\.refill_request_id \?\? undefined\)/);
  assert.match(screenSource + controllerSource, /useBadges\(\)/);
  assert.doesNotMatch(screenSource + controllerSource, /setInterval|refetchInterval/);
});

test('Absen gate disables only Closing and Request Refill for Rider and keeps Absen available', () => {
  const closed = { staff_window_open: false, has_clocked_in: false };
  const waiting = { staff_window_open: true, has_clocked_in: false };
  const ready = { staff_window_open: true, has_clocked_in: true };
  for (const [attendance, message] of [
    [closed, 'Produksi belum membuka absen hari ini. Fitur transaksi belum bisa dipakai.'],
    [waiting, 'Absen dulu sebelum memakai fitur transaksi. Buka Absen untuk melanjutkan.'],
    [ready, null], [undefined, null],
  ]) {
    const app = mount({ name: 'Rider', role: 'STAFF', abilities: {} }, { attendance });
    const disabled = app.tiles.filter((tile) => tile.disabled).map((tile) => tile.label);
    assert.deepEqual(disabled, message ? ['Closing', 'Request Refill'] : []);
    assert.equal(app.of('Banner').length, message ? 1 : 0);
    if (message) assert.equal(app.of('Banner')[0].props.message, message);
    assert.equal(app.tiles.find((tile) => tile.label === 'Absen').disabled, false);
    assert.deepEqual(app.state.attendanceEnabled, [true]);
  }
  const production = mount({ name: 'Produksi', role: 'BARISTA', abilities: {} }, { attendance: closed });
  assert.deepEqual(production.state.attendanceEnabled, [true]);
  assert.equal(production.tiles.find((tile) => tile.label === 'Absen').disabled, false);
  assert.equal(production.tiles.find((tile) => tile.label === 'Absen').hint,
    'Absen sendiri, lalu buka absen untuk rider');
  const finance = mount({ name: 'Finance', role: 'FINANCE', abilities: {} });
  assert.deepEqual(finance.state.attendanceEnabled, [false]);
});

test('signout confirmation, cancel, refresh and missing session keep their existing actions', async () => {
  const app = mount({ name: 'Rider', role: 'STAFF', abilities: {} });
  app.of('IconButton')[0].props.onPress();
  assert.equal(app.state.alert[0], 'Keluar dari aplikasi?');
  assert.equal(app.state.alert[1], 'Anda perlu masuk kembali menggunakan nomor HP.');
  assert.deepEqual(Array.from(app.state.alert[2], (button) => [button.text, button.style]),
    [['Batal', 'cancel'], ['Keluar', 'destructive']]);
  assert.deepEqual(app.state.calls, ['useBadges']);
  app.state.alert[2][1].onPress();
  assert.deepEqual(app.state.calls, ['useBadges', 'signOut']);
  app.of('Screen')[0].props.onRefresh();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(app.state.calls.at(-1), 'refreshUser');
  assert.equal(app.state.invalidations.length, 1);
  assert.equal(app.state.refreshing, false);
  const missing = mount(null);
  assert.equal(missing.tree, null);
  assert.deepEqual(missing.state.attendanceEnabled, [false]);
});
