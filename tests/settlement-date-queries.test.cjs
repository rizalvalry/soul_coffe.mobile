const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const source = readFileSync(join(__dirname, '..', 'src/features/settlements/queries.ts'), 'utf8');
const javascript = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
}).outputText;
const requests = [];
const modules = {
  '@tanstack/react-query': {
    useQuery: (options) => options,
    useMutation: (options) => options,
    useQueryClient: () => ({ invalidateQueries() { return Promise.resolve(); } }),
  },
  '@/lib/api': {
    request: (path, options) => { requests.push({ path, options }); return Promise.resolve({ id: 7 }); },
    uuidv4: () => 'test-key',
  },
  '@/features/refill/queries': { qk: {} },
  '@/features/showcase/queries': { showcaseKeys: {} },
};
const sandboxModule = { exports: {} };
vm.runInNewContext(javascript, {
  module: sandboxModule, exports: sandboxModule.exports,
  require: (name) => {
    assert.ok(Object.hasOwn(modules, name), `unexpected import: ${name}`);
    return modules[name];
  },
});
const { useSettlementDraft, useRecordSettlement, invalidateSettlementData } = sandboxModule.exports;

test('settlement invalidation targets queue, list, and only the relevant draft when known', () => {
  const keys = [];
  const client = { invalidateQueries: ({ queryKey }) => { keys.push(Array.from(queryKey)); return Promise.resolve(); } };
  invalidateSettlementData(client, 18);
  assert.deepEqual(keys, [
    ['settlements', 'queue'], ['settlements', 'list'], ['settlements', 'draft', 18],
  ]);
  keys.length = 0;
  invalidateSettlementData(client, null);
  assert.deepEqual(keys.at(-1), ['settlements', 'draft']);
});

test('linked operating date scopes the draft query and the record request to the same day', async () => {
  const draft = useSettlementDraft(18, '2026-10-16');
  assert.deepEqual(Array.from(draft.queryKey), ['settlements', 'draft', 18, '2026-10-16']);
  await draft.queryFn();
  assert.equal(requests.at(-1).path, '/settlements/draft/18?date=2026-10-16');

  const record = useRecordSettlement();
  await record.mutationFn({ cartId: 18, date: '2026-10-16', cash: 12000, qris: 0, transfer: 0 });
  assert.equal(requests.at(-1).path, '/settlements?date=2026-10-16');
  assert.equal(requests.at(-1).options.idempotencyKey, 'test-key');
  assert.equal(requests.at(-1).options.body.cart_id, 18);
});

test('ordinary settlement requests keep the current-day endpoint', async () => {
  const draft = useSettlementDraft(18);
  await draft.queryFn();
  assert.equal(requests.at(-1).path, '/settlements/draft/18');

  const record = useRecordSettlement();
  await record.mutationFn({ cartId: 18, cash: 12000, qris: 0, transfer: 0 });
  assert.equal(requests.at(-1).path, '/settlements');
});
