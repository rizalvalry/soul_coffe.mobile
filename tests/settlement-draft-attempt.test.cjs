const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const source = readFileSync(join(__dirname, '..', 'src/features/settlements/draftAttempt.ts'), 'utf8');
const javascript = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
}).outputText;

function harness() {
  const disk = new Map();
  let nextKey = 0;
  let rejectWrites = false;
  const storage = {
    getItem: async (key) => disk.get(key) ?? null,
    setItem: async (key, value) => {
      if (rejectWrites) throw new Error('storage full');
      disk.set(key, value);
    },
    removeItem: async (key) => { disk.delete(key); },
  };
  const load = () => {
    const sandboxModule = { exports: {} };
    vm.runInNewContext(javascript, {
      module: sandboxModule, exports: sandboxModule.exports,
      require: (name) => {
        if (name === '@react-native-async-storage/async-storage') return storage;
        if (name === '@/lib/api') return { uuidv4: () => `key-${++nextKey}` };
        throw new Error(`unexpected import: ${name}`);
      },
    });
    return sandboxModule.exports;
  };
  return { load, disk, rejectWrites: (value) => { rejectWrites = value; } };
}

const input = { cartId: 18, date: '2026-10-18', cash: 12000, qris: 0, transfer: 0 };

test('one persisted draft survives module remount and retries with the original key and money', async () => {
  const app = harness();
  const first = await app.load().loadOrCreateSettlementAttempt('finance-1', input);
  const restarted = app.load();
  const retry = await restarted.loadOrCreateSettlementAttempt('finance-1', { ...input, cash: 99999 });
  assert.deepEqual({ ...retry }, { ...first });
  assert.equal(retry.idempotencyKey, 'key-1');
  assert.equal(retry.cash, 12000);
  assert.deepEqual({ ...await restarted.readSettlementAttempt('finance-1', 18, input.date) }, { ...first });
});

test('only success or explicit cancellation clears a draft, and another account has its own key', async () => {
  const app = harness();
  const drafts = app.load();
  const first = await drafts.loadOrCreateSettlementAttempt('finance-1', input);
  const other = await drafts.loadOrCreateSettlementAttempt('finance-2', input);
  assert.notEqual(first.idempotencyKey, other.idempotencyKey);
  await drafts.clearSettlementAttempt('finance-1', 18, input.date);
  const next = await drafts.loadOrCreateSettlementAttempt('finance-1', input);
  assert.notEqual(next.idempotencyKey, first.idempotencyKey);
  assert.equal((await drafts.readSettlementAttempt('finance-2', 18, input.date)).idempotencyKey, other.idempotencyKey);
});

test('storage failure refuses to issue an unsafe unsaved key', async () => {
  const app = harness();
  app.rejectWrites(true);
  await assert.rejects(app.load().loadOrCreateSettlementAttempt('finance-1', input));
  assert.equal(app.disk.size, 0);
});

test('an unreadable saved draft can be explicitly cancelled and replaced', async () => {
  const app = harness();
  const drafts = app.load();
  await drafts.loadOrCreateSettlementAttempt('finance-1', input);
  const key = app.disk.keys().next().value;
  app.disk.set(key, '{broken-json');
  await assert.rejects(drafts.readSettlementAttempt('finance-1', 18, input.date));
  await drafts.clearSettlementAttempt('finance-1', 18, input.date);
  const next = await drafts.loadOrCreateSettlementAttempt('finance-1', input);
  assert.equal(next.idempotencyKey, 'key-2');
});
