const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const source = readFileSync(join(__dirname, '..', 'src/features/incidents/queries.ts'), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true,
} }).outputText;
const input = { refillId: 17, photoUri: 'camera://incident', takenAt: '2026-10-25T00:00:00Z',
  lines: [{ line_id: 4, qty_damaged: 2 }], note: 'Jatuh' };

function harness(shouldFail) {
  const calls = [];
  let compressions = 0;
  let uuids = 0;
  const modules = {
    react: { useRef: (value) => ({ current: value }) },
    '@tanstack/react-query': { useMutation: (options) => options, useQuery: (options) => options,
      useQueryClient: () => ({ invalidateQueries: async () => {} }) },
    '@/lib/api': { request: async () => [], uuidv4: () => `incident-${++uuids}`,
      uploadFile: async (path, file, fields, part, key) => {
        calls.push(JSON.parse(JSON.stringify({ path, file, fields, part, key })));
        if (shouldFail(calls.length)) throw new Error('timeout');
        return { id: calls.length };
      } },
    '@/lib/image': { compressForUpload: async (uri) => ({ uri: `${uri}.compressed-${++compressions}` }) },
    '@/features/refill/queries': { invalidateRefillData: () => {} },
  };
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, require: (name) => {
    assert.ok(Object.hasOwn(modules, name), `unexpected import ${name}`);
    return modules[name];
  } });
  return { report: () => module.exports.useReportIncident(), calls,
    counts: () => ({ compressions, uuids }) };
}

test('incident timeout retry resends the same UUID, fields, and compressed photo', async () => {
  const app = harness((call) => call === 1);
  const mutation = app.report();
  await assert.rejects(mutation.mutationFn(input), /timeout/);
  await mutation.mutationFn({ ...input, lines: input.lines.map((line) => ({ ...line })) });

  assert.deepEqual(app.calls[0], app.calls[1]);
  assert.equal(app.calls[0].fields.uuid, app.calls[0].key);
  assert.equal(app.calls[0].file.uri, 'camera://incident.compressed-1');
  assert.deepEqual(app.counts(), { compressions: 1, uuids: 1 });
});

test('a changed incident body or a newly opened form starts a new UUID', async () => {
  const app = harness(() => true);
  const mutation = app.report();
  await assert.rejects(mutation.mutationFn(input), /timeout/);
  await assert.rejects(mutation.mutationFn({ ...input, note: 'Kardus jatuh' }), /timeout/);
  await assert.rejects(mutation.mutationFn({ ...input,
    lines: [{ line_id: 4, qty_damaged: 1 }] }), /timeout/);
  await assert.rejects(mutation.mutationFn({ ...input, photoUri: 'camera://new-incident' }), /timeout/);
  await assert.rejects(app.report().mutationFn(input), /timeout/);

  assert.deepEqual(app.calls.map((call) => call.key), [
    'incident-1', 'incident-2', 'incident-3', 'incident-4', 'incident-5',
  ]);
  assert.equal(app.calls[1].fields.note, 'Kardus jatuh');
  assert.equal(app.calls[2].fields.lines, '[{"line_id":4,"qty_damaged":1}]');
  assert.equal(app.calls[3].file.uri, 'camera://new-incident.compressed-4');
  assert.equal(app.calls[4].fields.uuid, app.calls[4].key);
});

test('a completed report releases the attempt for a later submission', async () => {
  const app = harness(() => false);
  const mutation = app.report();
  await mutation.mutationFn(input);
  await mutation.mutationFn(input);

  assert.notEqual(app.calls[0].key, app.calls[1].key);
  assert.deepEqual(app.counts(), { compressions: 2, uuids: 2 });
});
