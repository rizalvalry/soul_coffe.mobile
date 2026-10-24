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
const snapshot = (value) => JSON.parse(JSON.stringify(value));

function harness() {
  const calls = [];
  let nextUuid = 0;
  let failures = 0;
  let activeRef;
  const modules = {
    react: { useRef: () => activeRef },
    '@tanstack/react-query': {
      useMutation: (options) => options,
      useQueryClient: () => ({ invalidateQueries: () => Promise.resolve() }),
    },
    '@/lib/api': {
      uuidv4: () => `approve-${++nextUuid}`,
      request: async (path, options) => {
        calls.push({ path, options: snapshot(options) });
        if (failures > 0) {
          failures--;
          throw new Error('timeout');
        }
        return { id: 7 };
      },
    },
    '@/features/refill/queries': { qk: { kitchenStock: ['stock'] } },
    '@/features/showcase/queries': { showcaseKeys: { stock: ['showcase'] } },
  };
  const state = { exports: {} };
  vm.runInNewContext(javascript, { module: state, exports: state.exports,
    require: (name) => {
      assert.ok(Object.hasOwn(modules, name), `unexpected import: ${name}`);
      return modules[name];
    },
  });
  return {
    calls,
    failNext: () => { failures++; },
    openForm: () => {
      activeRef = { current: null };
      return state.exports.useApproveSettlement();
    },
    rerender: () => state.exports.useApproveSettlement(),
    get uuidCount() { return nextUuid; },
  };
}

const input = { settlementId: 7, lines: [
  { product_id: 3, qty_returned: 2, qty_rejected: 0 },
  { product_id: 4, qty_returned: 0, qty_rejected: 0 },
] };

test('lost approval response retries with the same UUID and exact filtered body after rerender', async () => {
  const app = harness();
  const firstRender = app.openForm();
  app.failNext();
  await assert.rejects(firstRender.mutationFn(input), /timeout/);
  const nextRender = app.rerender();
  await nextRender.mutationFn(snapshot(input));

  assert.deepEqual(app.calls[0], app.calls[1]);
  assert.deepEqual(app.calls[1], { path: '/settlements/7/approve', options: {
    method: 'POST', idempotencyKey: 'approve-1',
    body: { lines: [{ product_id: 3, qty_returned: 2, qty_rejected: 0 }] },
  } });
  assert.equal(app.uuidCount, 1);
});

test('a new form or changed approval body starts a new UUID', async () => {
  const app = harness();
  const firstForm = app.openForm();
  app.failNext();
  await assert.rejects(firstForm.mutationFn(input), /timeout/);

  const changed = { ...input, lines: [{ product_id: 3, qty_returned: 1, qty_rejected: 1 }] };
  app.failNext();
  await assert.rejects(firstForm.mutationFn(changed), /timeout/);
  assert.notEqual(app.calls[0].options.idempotencyKey, app.calls[1].options.idempotencyKey);
  assert.deepEqual(app.calls[0].options.body, {
    lines: [{ product_id: 3, qty_returned: 2, qty_rejected: 0 }],
  });
  assert.deepEqual(app.calls[1].options.body, { lines: changed.lines });

  const nextForm = app.openForm();
  await nextForm.mutationFn(changed);
  assert.notEqual(app.calls[1].options.idempotencyKey, app.calls[2].options.idempotencyKey);
  assert.deepEqual(app.calls[1].options.body, app.calls[2].options.body);
  assert.equal(app.uuidCount, 3);
});
