const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

function loadTs(path, modules = {}) {
  const source = readFileSync(join(__dirname, '..', path), 'utf8');
  const javascript = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(javascript, { module, exports: module.exports, require: (name) => {
    assert.ok(Object.hasOwn(modules, name), `unexpected import: ${name}`);
    return modules[name];
  } });
  return module.exports;
}

class ApiError extends Error {
  constructor(message, status, body) {
    super(message);
    this.status = status;
    this.body = body;
  }
  get isOffline() { return this.status === 0; }
}

const gate = loadTs('src/features/showcase/riderDayGate.ts', { '@/lib/api': { ApiError } });

test('closed window disables Rider transactions; opening requires own attendance', () => {
  const status = { operating_date: '2026-10-18', has_clocked_in: false, staff_window_open: false };
  assert.equal(gate.riderDayGate(status), 'closed');
  assert.equal(gate.riderGateMessage('closed'), gate.DAY_NOT_OPEN_MESSAGE);
  assert.equal(gate.riderDayGate({ ...status, staff_window_open: true }), 'attendance');
  assert.match(gate.riderGateMessage('attendance'), /Buka Absen/);
  assert.equal(gate.riderDayGate({ ...status, staff_window_open: true, has_clocked_in: true }), 'ready');
  assert.equal(gate.riderGateMessage('ready'), null);
  assert.equal(gate.riderDayGate({ ...status, staff_window_open: undefined }), 'legacy');
  assert.equal(gate.riderGateMessage('legacy'), null);
});

test('only the stable server code identifies DAY_NOT_OPEN', () => {
  assert.equal(gate.isDayNotOpen(new ApiError('changed copy', 422, { code: 'DAY_NOT_OPEN' })), true);
  assert.equal(gate.isDayNotOpen(new ApiError('same copy', 422, { code: 'OTHER' })), false);
  assert.equal(gate.isDayNotOpen(new Error('DAY_NOT_OPEN')), false);
});

test('held queue resumes after a failed refresh followed by a fresh ready status', () => {
  assert.equal(gate.shouldResumeQueuedSales('ready', 'ready', 100, 100), false);
  assert.equal(gate.shouldResumeQueuedSales('ready', 'ready', 101, 100), true);
  assert.equal(gate.shouldResumeQueuedSales('attendance', 'ready', 101, Number.MAX_SAFE_INTEGER), true);
  assert.equal(gate.shouldResumeQueuedSales('closed', 'closed', 101, 100), false);
});

test('mounted queue hook retries after an immediate ready refresh releases its flush lock', async () => {
  const effects = [];
  const refs = [];
  let flushCalls = 0;
  let statusUpdatedAt = 100;
  const client = {
    invalidateQueries: async ({ queryKey }) => {
      if (queryKey.join('/') === 'absen/status') statusUpdatedAt = 101;
    },
    getQueryState: () => ({ dataUpdatedAt: statusUpdatedAt }),
    getQueryData: () => ({ staff_window_open: true, has_clocked_in: true }),
  };
  const useAuth = (selector) => selector({ session: { user: { id: 'rider-1' } } });
  useAuth.getState = () => ({ session: { user: { id: 'rider-1' } } });
  const hook = loadTs('src/features/sales/useOfflineSalesQueue.ts', {
    react: {
      useCallback: (callback) => callback,
      useEffect: (effect) => { effects.push(effect); },
      useRef: (value) => { const ref = { current: value }; refs.push(ref); return ref; },
      useState: (initial) => [initial, () => {}],
    },
    '@react-native-community/netinfo': { addEventListener: () => () => {} },
    '@tanstack/react-query': { useQueryClient: () => client },
    '@/features/refill/queries': { qk: { myStock: ['me', 'stock'] } },
    '@/features/showcase/queries': {
      showcaseKeys: { absenStatus: ['absen', 'status'], stock: ['showcase', 'stock'] },
      useAttendanceStatus: () => ({ data: { staff_window_open: true, has_clocked_in: true }, isPending: false, dataUpdatedAt: statusUpdatedAt }),
    },
    '@/features/showcase/riderDayGate': gate,
    '@/features/auth/store': { useAuth },
    './offlineQueue': {
      loadQueuedSales: async () => [{ uuid: 'sale-1' }],
      legacyQueuedSaleCount: async () => 0,
      flushSalesQueue: async () => {
        flushCalls++;
        return flushCalls === 1
          ? { synced: [], failed: [], waitingForGate: gate.DAY_NOT_OPEN_MESSAGE }
          : { synced: [{ id: 1 }], failed: [], waitingForGate: null };
      },
    },
    './queries': { salesKeys: { today: ['sales', 'today'] } },
  });
  hook.useOfflineSalesQueue();
  effects.forEach((effect) => effect());
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(flushCalls, 2);
  assert.equal(statusUpdatedAt, 101);
  assert.ok(refs.length > 0);
});

test('product photo maps only to the CMS image URL; missing upload shows placeholder', () => {
  const { productImageSource } = loadTs('src/domain/productImages.ts');
  const url = 'https://cms.example.test/storage/products/new-photo.jpg';
  assert.equal(productImageSource({ code: 'KOPSU', image_url: url }).uri, url);
  assert.equal(productImageSource({ code: 'KOPSU', image_url: null }), null);
  assert.equal(productImageSource({ code: 'KOPSU' }), null);
  assert.equal(productImageSource({ image_url: '  ' }), null);
});

test('DAY_NOT_OPEN leaves an offline sale pending with the same retry UUID', async () => {
  const disk = new Map();
  const storage = {
    getItem: async (key) => disk.get(key) ?? null,
    setItem: async (key, value) => { disk.set(key, value); },
  };
  let closed = true;
  const sent = [];
  const useAuth = { getState: () => ({ session: { user: { id: 'rider-1' } } }) };
  const queue = loadTs('src/features/sales/offlineQueue.ts', {
    '@react-native-async-storage/async-storage': storage,
    '@/lib/api': {
      ApiError,
      uuidv4: () => 'sale-uuid-1',
      request: async (_path, options) => {
        sent.push(options.idempotencyKey);
        if (closed) throw new ApiError('server says closed', 422, { code: 'DAY_NOT_OPEN' });
        return { id: 1 };
      },
    },
    '@/features/showcase/riderDayGate': gate,
    '@/features/auth/store': { useAuth },
  });
  await queue.enqueueSale('rider-1', { cartId: 4, lines: [{ product_id: 2, qty: 1 }], paymentMethod: 'cash' });
  const first = await queue.flushSalesQueue('rider-1');
  assert.equal(first.waitingForGate, gate.DAY_NOT_OPEN_MESSAGE);
  assert.equal(first.failed.length, 0);
  assert.equal((await queue.loadQueuedSales('rider-1'))[0].rejection, undefined);
  closed = false;
  const second = await queue.flushSalesQueue('rider-1');
  assert.equal(second.synced.length, 1);
  assert.deepEqual(sent, ['sale-uuid-1', 'sale-uuid-1']);
  assert.equal((await queue.loadQueuedSales('rider-1')).length, 0);
});

test('open window without Rider attendance keeps an offline sale pending until clock-in', async () => {
  const disk = new Map();
  const storage = {
    getItem: async (key) => disk.get(key) ?? null,
    setItem: async (key, value) => { disk.set(key, value); },
  };
  let clockedIn = false;
  const sent = [];
  const useAuth = { getState: () => ({ session: { user: { id: 'rider-1' } } }) };
  const queue = loadTs('src/features/sales/offlineQueue.ts', {
    '@react-native-async-storage/async-storage': storage,
    '@/lib/api': {
      ApiError,
      uuidv4: () => 'sale-uuid-2',
      request: async (path, options) => {
        if (path === '/absen/status') return { staff_window_open: true, has_clocked_in: clockedIn };
        sent.push(options.idempotencyKey);
        if (!clockedIn) throw new ApiError('Absen dulu', 422, {});
        return { id: 2 };
      },
    },
    '@/features/showcase/riderDayGate': gate,
    '@/features/auth/store': { useAuth },
  });
  await queue.enqueueSale('rider-1', { cartId: 4, lines: [{ product_id: 2, qty: 1 }], paymentMethod: 'cash' });
  const first = await queue.flushSalesQueue('rider-1');
  assert.equal(first.waitingForGate, gate.RIDER_ABSEN_MESSAGE);
  assert.equal(first.failed.length, 0);
  assert.equal((await queue.loadQueuedSales('rider-1'))[0].rejection, undefined);
  clockedIn = true;
  const second = await queue.flushSalesQueue('rider-1');
  assert.equal(second.synced.length, 1);
  assert.deepEqual(sent, ['sale-uuid-2', 'sale-uuid-2']);
  assert.equal((await queue.loadQueuedSales('rider-1')).length, 0);
});

test('lost online response and queued replay use one UUID and one server sale', async () => {
  const disk = new Map();
  const storage = {
    getItem: async (key) => disk.get(key) ?? null,
    setItem: async (key, value) => { disk.set(key, value); },
  };
  const sent = [];
  let stockMovements = 0;
  const serverSale = { id: 9 };
  const request = async (_path, options) => {
    sent.push(options.idempotencyKey);
    if (stockMovements === 0) {
      stockMovements++;
      throw new ApiError('response lost', 0);
    }
    return serverSale;
  };
  const online = loadTs('src/features/sales/queries.ts', {
    '@tanstack/react-query': { useMutation: (options) => options, useQueryClient: () => ({}) },
    '@/lib/api': { request, uuidv4: () => 'wrong-new-uuid' },
    '@/features/refill/queries': { qk: {} },
    '@/features/showcase/queries': { showcaseKeys: {} },
    './offlineQueue': { buildSaleBody: (uuid, input) => ({ uuid, lines: input.lines }) },
  });
  const input = { uuid: 'one-sale-uuid', cartId: 4, lines: [{ product_id: 1, qty: 2 }], paymentMethod: 'cash', gps: null };
  await assert.rejects(online.useRecordSale().mutationFn(input), /response lost/);
  const useAuth = { getState: () => ({ session: { user: { id: 'rider-1' } } }) };
  const queue = loadTs('src/features/sales/offlineQueue.ts', {
    '@react-native-async-storage/async-storage': storage,
    '@/lib/api': { ApiError, request, uuidv4: () => 'wrong-new-uuid' },
    '@/features/showcase/riderDayGate': gate,
    '@/features/auth/store': { useAuth },
  });
  await queue.enqueueSale('rider-1', input);
  const replay = await queue.flushSalesQueue('rider-1');
  assert.equal(replay.synced[0].id, serverSale.id);
  assert.deepEqual(sent, ['one-sale-uuid', 'one-sale-uuid']);
  assert.equal(stockMovements, 1);
});

test('offline replay keeps its original cart and CART_CHANGED stays rejected on the phone', async () => {
  const disk = new Map();
  const storage = {
    getItem: async (key) => disk.get(key) ?? null,
    setItem: async (key, value) => { disk.set(key, value); },
  };
  const sent = [];
  const useAuth = { getState: () => ({ session: { user: { id: 'rider-1', cartId: 5 } } }) };
  const queue = loadTs('src/features/sales/offlineQueue.ts', {
    '@react-native-async-storage/async-storage': storage,
    '@/lib/api': {
      ApiError,
      uuidv4: () => 'old-cart-sale',
      request: async (path, options) => {
        assert.equal(path, '/sales');
        sent.push(options);
        throw new ApiError('Gerobak kamu sudah berubah. Cek transaksi ini bareng Administrator ya.', 422, { code: 'CART_CHANGED' });
      },
    },
    '@/features/showcase/riderDayGate': gate,
    '@/features/auth/store': { useAuth },
  });
  await queue.enqueueSale('rider-1', {
    cartId: 4, lines: [{ product_id: 1, qty: 2 }], paymentMethod: 'cash', gps: null,
  });
  const result = await queue.flushSalesQueue('rider-1');
  assert.equal(sent.length, 1);
  assert.equal(sent[0].body.cart_id, 4);
  assert.equal(sent[0].idempotencyKey, 'old-cart-sale');
  assert.equal(result.failed.length, 1);
  assert.match((await queue.loadQueuedSales('rider-1'))[0].rejection, /Gerobak kamu sudah berubah/);
  await queue.flushSalesQueue('rider-1');
  assert.equal(sent.length, 1);
});

test('older owned queue entry without origin cart stays visible and is never replayed', async () => {
  const disk = new Map();
  const useAuth = { getState: () => ({ session: { user: { id: 'rider-1', cartId: 5 } } }) };
  let sent = 0;
  const queue = loadTs('src/features/sales/offlineQueue.ts', {
    '@react-native-async-storage/async-storage': {
      getItem: async (key) => disk.get(key) ?? null,
      setItem: async (key, value) => { disk.set(key, value); },
    },
    '@/lib/api': { ApiError, uuidv4: () => 'legacy-owned', request: async () => { sent++; } },
    '@/features/showcase/riderDayGate': gate,
    '@/features/auth/store': { useAuth },
  });
  await queue.enqueueSale('rider-1', {
    lines: [{ product_id: 1, qty: 2 }], paymentMethod: 'cash', gps: null,
  });
  const result = await queue.flushSalesQueue('rider-1');
  assert.equal(sent, 0);
  assert.equal(result.failed.length, 1);
  assert.match((await queue.loadQueuedSales('rider-1'))[0].rejection, /Gerobak asal/);
});
