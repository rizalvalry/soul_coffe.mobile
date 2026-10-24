const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const source = readFileSync(join(__dirname, '..', 'src/features/refill/queries.ts'), 'utf8');
const javascript = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
}).outputText;

function harness({ onRequest } = {}) {
  const calls = [];
  const failures = new Set();
  let sequence = 0;
  let kitchenId = null;
  const client = {
    ensureQueryData: async () => [],
    invalidateQueries: async () => {},
  };
  function record(kind, path, options) {
    calls.push({ kind, path, options: structuredClone(options) });
    if (failures.delete(calls.length)) throw new Error('timeout');
  }
  const modules = {
    react: { useRef: (value) => ({ current: value }) },
    '@tanstack/react-query': {
      useMutation: (options) => options,
      useQueryClient: () => client,
    },
    '@/lib/api': {
      uuidv4: () => `attempt-${++sequence}`,
      request: async (path, options) => {
        record('json', path, options);
        await onRequest?.(calls.length);
        return { id: 17 };
      },
      requestWithStatus: async (path, options) => {
        record('delivery-json', path, options);
        return { data: { id: 17 }, status: 200 };
      },
      uploadFileWithStatus: async (path, file, fields, part, operation) => {
        record('delivery-multipart', path, { file, fields, part, operation });
        return { data: { id: 17 }, status: 200 };
      },
    },
    '@/lib/image': { compressForUpload: async (uri) => ({ uri }) },
    '@/features/showcase/kitchenSelection': {
      useKitchenSelection: Object.assign(() => ({ kitchenId }), { getState: () => ({ kitchenId }) }),
    },
    '@/lib/mappers': { toRefillRequest: (raw) => raw },
  };
  const module = { exports: {} };
  vm.runInNewContext(javascript, {
    module, exports: module.exports,
    require: (name) => {
      assert.ok(Object.hasOwn(modules, name), `unexpected import: ${name}`);
      return modules[name];
    },
  });
  async function send(mutation, input) {
    const result = await mutation.mutationFn(input);
    mutation.onSuccess?.(result, input);
    return result;
  }
  return { hooks: module.exports, calls, failures, send, selectKitchen: (id) => { kitchenId = id; } };
}

const submitInput = {
  cartId: 3, evidenceMediaId: 12, gps: null,
  lines: [{ product_id: 4, qty_requested: 2 }], note: 'Butuh es',
};

test('submit timeout replays one header, UUID and complete body; edits, success and remount rotate it', async () => {
  const app = harness();
  const mutation = app.hooks.useSubmitRefill();
  app.failures.add(1);
  await assert.rejects(app.send(mutation, submitInput), /timeout/);
  await app.send(mutation, { ...submitInput, gps: { lat: -6.1, lng: 106.8 } });
  assert.deepEqual(app.calls[1], app.calls[0]);
  assert.equal(app.calls[0].options.idempotencyKey, app.calls[0].options.body.uuid);
  assert.equal(app.calls[0].options.body.gps_unavailable, true);

  const changedLines = { ...submitInput, lines: [{ product_id: 4, qty_requested: 3 }] };
  await app.send(mutation, changedLines);
  assert.notEqual(app.calls[2].options.idempotencyKey, app.calls[1].options.idempotencyKey);
  assert.equal(app.calls[2].options.body.lines[0].qty_requested, 3);

  const changedNote = { ...changedLines, note: 'Butuh sedotan' };
  await app.send(mutation, changedNote);
  assert.notEqual(app.calls[3].options.idempotencyKey, app.calls[2].options.idempotencyKey);
  const changedEvidence = { ...changedNote, evidenceMediaId: 13 };
  await app.send(mutation, changedEvidence);
  assert.notEqual(app.calls[4].options.idempotencyKey, app.calls[3].options.idempotencyKey);
  const changedCart = { ...changedEvidence, cartId: 5 };
  await app.send(mutation, changedCart);
  assert.notEqual(app.calls[5].options.idempotencyKey, app.calls[4].options.idempotencyKey);

  await app.send(mutation, changedCart);
  assert.notEqual(app.calls[6].options.idempotencyKey, app.calls[5].options.idempotencyKey);
  await app.send(app.hooks.useSubmitRefill(), changedCart);
  assert.notEqual(app.calls[7].options.idempotencyKey, app.calls[6].options.idempotencyKey);
});

test('changing a failed refill form starts a new attempt even if it is later changed back', async () => {
  const app = harness();
  const mutation = app.hooks.useSubmitRefill();
  const edited = { ...submitInput, lines: [{ product_id: 4, qty_requested: 5 }] };
  for (const index of [1, 2, 3]) app.failures.add(index);
  await assert.rejects(app.send(mutation, submitInput), /timeout/);
  await assert.rejects(app.send(mutation, edited), /timeout/);
  await assert.rejects(app.send(mutation, submitInput), /timeout/);
  const ids = app.calls.map((call) => call.options.idempotencyKey);
  assert.equal(new Set(ids).size, 3);
  assert.equal(app.calls[2].options.body.lines[0].qty_requested, 2);
});

test('all refill transitions replay the exact path, key and body after timeout', async () => {
  const actions = [
    ['useApproveRefill', { id: 17, lines: [{ line_id: 2, qty_approved: 3 }], partialReason: 'Stoknya kurang' },
      '/refills/17/approve', { lines: [{ line_id: 2, qty_approved: 3 }], partial_reason: 'Stoknya kurang' }],
    ['useRejectRefill', { id: 17, reason: 'Stoknya kosong' },
      '/refills/17/reject', { reason: 'Stoknya kosong' }],
    ['useCancelRefill', { id: 17 }, '/refills/17/cancel', undefined],
    ['useStartPreparing', { id: 17 }, '/refills/17/start-preparing', undefined],
    ['useMarkReady', { id: 17, lines: [{ line_id: 2, qty_prepared: 3 }], shortfallReason: 'Stoknya kurang' },
      '/refills/17/ready', { lines: [{ line_id: 2, qty_prepared: 3 }], shortfall_reason: 'Stoknya kurang' }],
    ['useClaimRefill', { id: 17 }, '/refills/17/claim', undefined],
  ];
  for (const [hook, input, path, body] of actions) {
    const app = harness();
    const mutation = app.hooks[hook]();
    app.failures.add(1);
    await assert.rejects(app.send(mutation, input), /timeout/);
    assert.equal(app.calls[0].path, path, hook);
    assert.deepEqual(app.calls[0].options.body, body, hook);
    await app.send(mutation, structuredClone(input));
    assert.deepEqual(app.calls[1], app.calls[0], hook);
    await app.send(mutation, input);
    assert.notEqual(app.calls[2].options.idempotencyKey, app.calls[1].options.idempotencyKey, hook);
  }
});

test('transition attempts are distinct per refill and body, including when another request intervenes', async () => {
  const app = harness();
  const mutation = app.hooks.useApproveRefill();
  const one = { id: 17, lines: [{ line_id: 2, qty_approved: 3 }] };
  const edited = { id: 17, lines: [{ line_id: 2, qty_approved: 2 }] };
  const other = { id: 18, lines: [{ line_id: 8, qty_approved: 3 }] };
  for (const index of [1, 2, 3]) app.failures.add(index);
  await assert.rejects(app.send(mutation, one));
  await assert.rejects(app.send(mutation, edited));
  await assert.rejects(app.send(mutation, other));
  await app.send(mutation, one);
  assert.equal(app.calls[3].options.idempotencyKey, app.calls[0].options.idempotencyKey);
  assert.notEqual(app.calls[1].options.idempotencyKey, app.calls[0].options.idempotencyKey);
  assert.notEqual(app.calls[2].options.idempotencyKey, app.calls[0].options.idempotencyKey);
});

test('overlapping transition success and timeout keep the original key until retry succeeds', async () => {
  let finishFirst;
  let failSecond;
  const firstResponse = new Promise((resolve) => { finishFirst = resolve; });
  const secondResponse = new Promise((_, reject) => { failSecond = reject; });
  const app = harness({ onRequest: async (number) => {
    if (number === 1) await firstResponse;
    if (number === 2) await secondResponse;
  } });
  const mutation = app.hooks.useApproveRefill();
  const input = { id: 17, lines: [{ line_id: 2, qty_approved: 3 }] };
  const first = app.send(mutation, input);
  const second = assert.rejects(app.send(mutation, structuredClone(input)), /timeout/);
  finishFirst();
  await first;
  failSecond(new Error('timeout'));
  await second;
  await app.send(mutation, input);
  assert.equal(app.calls[0].options.idempotencyKey, app.calls[1].options.idempotencyKey);
  assert.equal(app.calls[0].options.idempotencyKey, app.calls[2].options.idempotencyKey);
  await app.send(mutation, input);
  assert.notEqual(app.calls[3].options.idempotencyKey, app.calls[2].options.idempotencyKey);
});

test('overlapping successes with the same input object reset the transition key', async () => {
  let finishFirst;
  const firstResponse = new Promise((resolve) => { finishFirst = resolve; });
  const app = harness({ onRequest: async (number) => {
    if (number === 1) await firstResponse;
  } });
  const mutation = app.hooks.useClaimRefill();
  const input = { id: 17 };
  const first = app.send(mutation, input);
  await app.send(mutation, input);
  finishFirst();
  await first;
  await app.send(mutation, input);
  assert.equal(app.calls[0].options.idempotencyKey, app.calls[1].options.idempotencyKey);
  assert.notEqual(app.calls[2].options.idempotencyKey, app.calls[0].options.idempotencyKey);
});

test('kitchen transition includes the selected kitchen in its attempt and pins it for the request', async () => {
  const app = harness();
  const mutation = app.hooks.useStartPreparing();
  const input = { id: 17 };
  app.selectKitchen(2);
  app.failures.add(1);
  app.failures.add(2);
  await assert.rejects(app.send(mutation, input), /timeout/);
  app.selectKitchen(3);
  await assert.rejects(app.send(mutation, input), /timeout/);
  app.selectKitchen(2);
  await app.send(mutation, input);
  assert.equal(app.calls[0].options.kitchenId, 2);
  assert.equal(app.calls[1].options.kitchenId, 3);
  assert.equal(app.calls[2].options.kitchenId, 2);
  assert.notEqual(app.calls[1].options.idempotencyKey, app.calls[0].options.idempotencyKey);
  assert.equal(app.calls[2].options.idempotencyKey, app.calls[0].options.idempotencyKey);
});

const deliveryInput = {
  id: 17, handoverMediaId: 30, lines: [{ line_id: 2, qty_received: 3 }], gps: null,
};

test('photo-only delivery retries the same JSON body and header, then rotates after success', async () => {
  const app = harness();
  const mutation = app.hooks.useDeliverRefill();
  app.failures.add(1);
  await assert.rejects(app.send(mutation, deliveryInput), /timeout/);
  await app.send(mutation, { ...deliveryInput, gps: { lat: -6.1, lng: 106.8 } });
  assert.deepEqual(app.calls[1], app.calls[0]);
  assert.equal(app.calls[0].path, '/refills/17/deliver');
  assert.deepEqual(app.calls[0].options.body, {
    handover_media_id: 30, lines: [{ line_id: 2, qty_received: 3 }],
    gps_lat: null, gps_lng: null, gps_unavailable: true,
  });
  await app.send(mutation, deliveryInput);
  assert.notEqual(app.calls[2].options.idempotencyKey, app.calls[1].options.idempotencyKey);
});

test('signed delivery retries identical multipart fields and changes key when proof or lines change', async () => {
  const app = harness();
  const mutation = app.hooks.useDeliverRefill();
  const signed = { ...deliveryInput, signature: { method: 'staff_signature', uri: 'file:///sign.png', strokeCount: 3 } };
  app.failures.add(1);
  await assert.rejects(app.send(mutation, signed), /timeout/);
  await app.send(mutation, { ...signed, gps: { lat: -6.1, lng: 106.8 } });
  assert.deepEqual(app.calls[1], app.calls[0]);
  assert.equal(app.calls[0].path, '/refills/17/deliver');
  assert.equal(app.calls[0].options.part, 'signature');
  assert.deepEqual(app.calls[0].options.fields, {
    handover_media_id: '30', signature_method: 'staff_signature', stroke_count: '3',
    lines: '[{"line_id":2,"qty_received":3}]', gps_lat: '', gps_lng: '', gps_unavailable: '1',
  });
  const changed = { ...signed, lines: [{ line_id: 2, qty_received: 2 }] };
  await app.send(mutation, changed);
  assert.notEqual(app.calls[2].options.operation, app.calls[1].options.operation);
  const pin = { ...deliveryInput, signature: { method: 'pin_fallback', staffPin: '123456' } };
  await app.send(mutation, pin);
  assert.equal(app.calls[3].kind, 'delivery-json');
  assert.equal(app.calls[3].path, '/refills/17/deliver');
  assert.deepEqual(app.calls[3].options.body, {
    handover_media_id: 30, lines: [{ line_id: 2, qty_received: 3 }],
    gps_lat: null, gps_lng: null, gps_unavailable: true,
    signature_method: 'pin_fallback', staff_pin: '123456',
  });
  assert.notEqual(app.calls[3].options.idempotencyKey, app.calls[2].options.operation);
});

test('refill screen keeps upload before submit and reuses uploaded evidence after a submit timeout', async () => {
  const screenSource = readFileSync(join(__dirname, '..', 'app/(app)/staff/refill/new.tsx'), 'utf8');
  const screenJavaScript = ts.transpileModule(screenSource, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
      jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const events = [];
  const submissions = [];
  let releaseUpload;
  const uploadHeld = new Promise((resolve) => { releaseUpload = resolve; });
  let stateIndex = 0;
  let submitCount = 0;
  const states = [
    { 4: 2 }, { uri: 'photo://a', takenAt: '2026-10-24T03:00:00Z' },
    null, null, 'unavailable', null, null, 'Butuh es',
  ];
  const jsx = (type, props) => ({ type, props: props ?? {} });
  const ui = new Proxy({}, { get: (_target, name) => String(name) });
  const color = new Proxy({}, { get: () => '#000' });
  const size = new Proxy({}, { get: () => 8 });
  const modules = {
    react: {
      useCallback: (fn) => fn, useEffect: () => {}, useMemo: (fn) => fn(),
      useRef: (value) => ({ current: value }),
      useState: () => [states[stateIndex++], () => {}],
    },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-native': { Image: 'Image', View: 'View', StyleSheet: { create: (styles) => styles } },
    'expo-router': { useFocusEffect: () => {}, useRouter: () => ({ replace: () => {} }) },
    'expo-image-picker': {},
    'expo-location': { LocationAccuracy: { Balanced: 1 } },
    '@expo/vector-icons/MaterialCommunityIcons': 'Icon',
    'expo-status-bar': { StatusBar: 'StatusBar' },
    'react-native-reanimated': { View: 'AnimatedView' },
    '@/features/auth/store': { useAuth: (select) => select({
      session: { user: { role: 'STAFF', cartId: 3 } }, refreshUser: async () => {},
      cartRefreshStatus: 'ready', cartRefreshError: null,
    }) },
    '@/features/refill/queries': {
      useProducts: () => ({ data: [], isLoading: false, isError: false, isRefetching: false }),
      useUploadEvidence: () => ({ isPending: false, mutateAsync: async () => {
        events.push('upload');
        await uploadHeld;
        return { id: 12 };
      } }),
      useSubmitRefill: () => ({ isPending: false, mutateAsync: async (input) => {
        events.push('submit');
        submissions.push(structuredClone(input));
        if (++submitCount === 1) throw new Error('timeout');
        return { id: 17 };
      } }),
    },
    '@/features/showcase/queries': { useAttendanceStatus: () => ({ data: {}, refetch: async () => {} }) },
    '@/features/showcase/riderDayGate': {
      DAY_NOT_OPEN_MESSAGE: '', NO_CART_TODAY_MESSAGE: '', isDayNotOpen: () => false,
      isNoCartToday: () => false, riderDayGate: () => 'ready', riderGateMessage: () => null,
    },
    '@/lib/api': { ApiError: class ApiError extends Error {} },
    '@/theme': {
      brand: color, neutral: color, semantic: color, radius: size, space: size,
      shadow: { card: {} },
    },
  };
  for (const name of ['Screen', 'Text', 'Button', 'Card', 'Badge', 'Banner', 'EmptyState',
    'Skeleton', 'AnimatedNumber', 'Section', 'Input', 'Motion']) {
    modules[`@/components/ui/${name}`] = ui;
  }
  modules['@/components/ui/Motion'] = { enter: () => ({}) };
  modules['@/components/refill/ProductPickerCard'] = ui;
  const module = { exports: {} };
  vm.runInNewContext(screenJavaScript, {
    module, exports: module.exports,
    require: (name) => {
      assert.ok(Object.hasOwn(modules, name), `unexpected import: ${name}`);
      return modules[name];
    },
  });
  function findSubmit(node) {
    if (Array.isArray(node)) return node.map(findSubmit).find(Boolean);
    if (!node || typeof node !== 'object') return null;
    if (node.type === 'Button' && node.props.label === 'Kirim Request') return node;
    return findSubmit(node.props?.children);
  }
  const button = findSubmit(module.exports.default());
  assert.ok(button);
  button.props.onPress();
  button.props.onPress();
  assert.deepEqual(events, ['upload']);
  releaseUpload();
  await new Promise(setImmediate);
  button.props.onPress();
  await new Promise(setImmediate);
  assert.deepEqual(events, ['upload', 'submit', 'submit']);
  assert.deepEqual(submissions, [
    { cartId: 3, evidenceMediaId: 12, gps: null,
      lines: [{ product_id: 4, qty_requested: 2 }], note: 'Butuh es' },
    { cartId: 3, evidenceMediaId: 12, gps: null,
      lines: [{ product_id: 4, qty_requested: 2 }], note: 'Butuh es' },
  ]);
});

test('delivery sheet reuses the handover upload when delivery times out', async () => {
  const screenSource = readFileSync(join(__dirname, '..', 'app/(app)/rider/active.tsx'), 'utf8');
  const screenJavaScript = ts.transpileModule(screenSource, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
      jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const events = [];
  const submissions = [];
  let releaseUpload;
  const uploadHeld = new Promise((resolve) => { releaseUpload = resolve; });
  let stateIndex = 0;
  let deliveryCount = 0;
  const states = [
    { 2: 3 }, { uri: 'photo://handover', takenAt: '2026-10-24T03:00:00Z' },
    'none', null, '', null, 'unavailable', null,
  ];
  const jsx = (type, props) => ({ type, props: props ?? {} });
  const ui = new Proxy({}, { get: (_target, name) => String(name) });
  const color = new Proxy({}, { get: () => '#000' });
  const size = new Proxy({}, { get: () => 8 });
  const modules = {
    react: {
      useEffect: () => {}, useMemo: (fn) => fn(), useRef: (value) => ({ current: value }),
      useState: (initial) => {
        const index = stateIndex++;
        return [index < states.length ? states[index] : typeof initial === 'function' ? initial() : initial, () => {}];
      },
    },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-native': {
      Alert: { alert: () => {} }, FlatList: 'FlatList', Image: 'Image', Modal: 'Modal',
      ScrollView: 'ScrollView', View: 'View', StyleSheet: { create: (styles) => styles },
    },
    '@expo/vector-icons/MaterialCommunityIcons': 'Icon',
    'expo-image-picker': {}, 'expo-location': {},
    '@/features/refill/queries': {
      useUploadHandoverPhoto: () => ({ isPending: false, mutateAsync: async () => {
        events.push('upload');
        await uploadHeld;
        return { id: 30 };
      } }),
      useDeliverRefill: () => ({ isPending: false, mutateAsync: async (input) => {
        events.push('deliver');
        submissions.push(structuredClone(input));
        if (++deliveryCount === 1) throw new Error('timeout');
        return { refill: { id: 17 }, ledgerPending: false };
      } }),
    },
    '@/features/incidents/queries': { useReportIncident: () => ({}) },
    '@/lib/api': { ApiError: class ApiError extends Error {} },
    '@/theme': { brand: color, feedback: color, neutral: color, radius: size, semantic: color, space: size },
  };
  for (const name of ['Screen', 'Text', 'Card', 'Button', 'Input', 'QtyStepper', 'Badge',
    'Banner', 'EmptyState', 'Skeleton', 'ProductThumbnail', 'Touchable', 'SignaturePad']) {
    modules[`@/components/ui/${name}`] = ui;
  }
  const module = { exports: {} };
  vm.runInNewContext(`${screenJavaScript}\nmodule.exports.DeliverySheet = DeliverySheet;`, {
    module, exports: module.exports,
    require: (name) => {
      assert.ok(Object.hasOwn(modules, name), `unexpected import: ${name}`);
      return modules[name];
    },
  });
  function findSubmit(node) {
    if (Array.isArray(node)) return node.map(findSubmit).find(Boolean);
    if (!node || typeof node !== 'object') return null;
    if (node.type === 'Button' && node.props.label === 'Konfirmasi Pengiriman') return node;
    return findSubmit(node.props?.children);
  }
  const refill = {
    id: 17, code: 'REF-17', staff_name: 'Rider', cart_code: '0003',
    lines: [{ id: 2, qty_prepared: 3, product_name: 'Kopi', unit: 'cup' }],
  };
  const button = findSubmit(module.exports.DeliverySheet({ refill, onClose: () => {} }));
  assert.ok(button);
  button.props.onPress();
  button.props.onPress();
  assert.deepEqual(events, ['upload']);
  releaseUpload();
  await new Promise(setImmediate);
  button.props.onPress();
  await new Promise(setImmediate);
  assert.deepEqual(events, ['upload', 'deliver', 'deliver']);
  assert.deepEqual(submissions, [
    { id: 17, handoverMediaId: 30, lines: [{ line_id: 2, qty_received: 3 }], gps: null },
    { id: 17, handoverMediaId: 30, lines: [{ line_id: 2, qty_received: 3 }], gps: null },
  ]);
});
