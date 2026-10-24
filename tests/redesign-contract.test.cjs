const assert = require('node:assert/strict');
const fs = require('node:fs');
const { readFileSync } = fs;
const { join } = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');
const ts = require('typescript');
const { snapshot } = require('../scripts/api-contract-snapshot.cjs');
const { validatePaths } = require('../scripts/redesign-guard.cjs');

const root = join(__dirname, '..');
const plain = (value) => JSON.parse(JSON.stringify(value));
const source = (file) => readFileSync(join(root, file), 'utf8');

function load(file, modules) {
  const code = ts.transpileModule(source(file), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true,
  } }).outputText;
  const state = { exports: {} };
  vm.runInNewContext(code, { module: state, exports: state.exports, require: (name) => {
    assert.ok(Object.hasOwn(modules, name), `unexpected import: ${name}`);
    return modules[name];
  } });
  return state.exports;
}

test('all transport calls and Pusher subscriptions match the reviewed baseline', () => {
  const baseline = JSON.parse(source('tests/fixtures/api-contract.baseline.json'));
  assert.deepEqual(snapshot(), baseline);
  assert.ok(baseline.calls.length >= 75);
  assert.ok(baseline.subscriptions.some((item) => item.channel.includes('cart.') && item.event === '.soul.event'));
  const incident = baseline.calls.find((item) => item.path.includes('/incident') && item.transport === 'uploadFile');
  assert.deepEqual(incident.bodyFields, ['lines', 'note', 'photo', 'photo_taken_at', 'uuid']);
});

test('snapshot changes when a transition path, typed body field, or actual Pusher target changes', () => {
  const baseline = snapshot();
  const original = fs.readFileSync;
  function changed(fileSuffix, edit) {
    fs.readFileSync = (file, ...args) => {
      const content = original(file, ...args);
      return String(file).replaceAll('\\', '/').endsWith(fileSuffix) ? edit(content) : content;
    };
    try { return snapshot(); }
    finally { fs.readFileSync = original; }
  }
  assert.notDeepEqual(changed('src/features/refill/queries.ts', (content) =>
    content.replace('/approve`', '/tampered`')), baseline);
  assert.notDeepEqual(changed('src/features/clearing/queries.ts', (content) =>
    content.replace('export type ClearingInput = {', 'export type ClearingInput = {\n  extra_review_field: number;')), baseline);
  assert.notDeepEqual(changed('src/features/realtime/RealtimeProvider.tsx', (content) =>
    content.replace('echo.private(name).listen(', "echo.private('wrong-channel').listen(")), baseline);
  assert.notDeepEqual(changed('src/features/realtime/RealtimeProvider.tsx', (content) =>
    content.replace(/(const names = channelsFor\(\s*)session\.user\.role,/, "$1'MANAGEMENT',")), baseline);
});

test('snapshot discovers aliased transport imports and member fetch calls', () => {
  const original = fs.readFileSync;
  fs.readFileSync = (file, ...args) => {
    const content = original(file, ...args);
    return String(file).replaceAll('\\', '/').endsWith('src/features/clearing/queries.ts')
      ? `${content}\nimport { request as ask } from '@/lib/api';\nask('/alias-test');\nglobalThis.fetch('/member-test');\n`
      : content;
  };
  try {
    const calls = snapshot().calls;
    assert.ok(calls.some((item) => item.path === '/alias-test' && item.transport === 'request'));
    assert.ok(calls.some((item) => item.path === '/member-test' && item.transport === 'fetch'));
  } finally { fs.readFileSync = original; }
});

test('visual path guard rejects every protected area and paths outside a task allowlist', () => {
  const allow = ['src/theme/tokens.ts', 'src/components/ui/*.tsx', 'app/(app)/menu.tsx'];
  assert.deepEqual(validatePaths(['src/theme/tokens.ts', 'app/(app)/menu.tsx'], allow), []);
  for (const file of [
    'src/features/refill/queries.ts', 'src/lib/api.ts', 'src/domain/types.ts',
    'src/components/ui/quantity.ts', 'src/components/ui/SignaturePad.tsx',
    'android/app/build.gradle', 'scripts/alter.cjs', 'app.json', 'app.config.js',
  ]) assert.match(validatePaths([file], [...allow, file]).join(''), /denylist/, file);
  assert.match(validatePaths(['app/(app)/staff/closing.tsx'], allow).join(''), /outside allowlist/);
});

test('bootstrap exception is exact to T-090 scripts and its branch', () => {
  const allow = ['scripts/redesign-guard.cjs', 'scripts/api-contract-snapshot.cjs'];
  assert.deepEqual(validatePaths([...allow], allow, 'task/T-090-redesign-safety-net'), []);
  assert.match(validatePaths([allow[0]], allow, 'task/T-092-visual').join(''), /denylist/);
  assert.match(validatePaths(['scripts/other.cjs'], ['scripts/other.cjs'],
    'task/T-090-redesign-safety-net').join(''), /denylist/);
});

test('guard CLI rejects a dry-run protected runtime path without changing the repository', () => {
  const result = spawnSync(process.execPath, [join(root, 'scripts/redesign-guard.cjs'),
    '--base', 'HEAD', '--allow', join(root, 'tests/fixtures/redesign-task.allowlist'),
    '--check-path', 'src/features/visual-dummy.ts'], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /src\/features\/visual-dummy\.ts: denylist/);
});

test('refill evidence upload precedes submit and preserves multipart names and GPS unavailable payload', async () => {
  const calls = [];
  let uuid = 0;
  const queries = load('src/features/refill/queries.ts', {
    '@tanstack/react-query': {
      useMutation: (options) => options,
      useQuery: (options) => options,
      useQueryClient: () => ({ ensureQueryData: async () => [], invalidateQueries: async () => {} }),
    },
    '@/lib/api': {
      request: async (path, options) => { calls.push({ kind: 'request', path, options }); return {}; },
      requestWithStatus: async () => ({ data: {}, status: 200 }),
      uploadFile: async (path, file, fields, fieldName, key) => {
        calls.push({ kind: 'upload', path, file, fields, fieldName: fieldName ?? 'file', key });
        return { id: 44 };
      },
      uploadFileWithStatus: async () => ({ data: {}, status: 200 }),
      uuidv4: () => `uuid-${++uuid}`,
    },
    '@/lib/image': { compressForUpload: async (uri) => ({ uri: `${uri}.small` }) },
    '@/features/showcase/kitchenSelection': { useKitchenSelection: () => null },
    '@/lib/mappers': { toRefillRequest: (raw) => raw, toAppNotification: (raw) => raw,
      toStockRow: (raw) => raw },
  });
  const uploaded = await queries.useUploadEvidence().mutationFn({ uri: 'capture.jpg', takenAt: '2026-10-24T01:00:00Z' });
  await queries.useSubmitRefill().mutationFn({ cartId: 8, evidenceMediaId: uploaded.id,
    gps: null, lines: [{ product_id: 2, qty_requested: 3 }], note: 'dekat lobi' });
  const write = calls.find((call) => call.path === '/refills');
  assert.equal(calls[0].path, '/media/evidence');
  assert.equal(calls[0].fieldName, 'file');
  assert.deepEqual(plain(calls[0].fields), { taken_at: '2026-10-24T01:00:00Z' });
  assert.equal(calls[0].file.uri, 'capture.jpg.small');
  assert.deepEqual(plain(write.options.body.lines), [{ product_id: 2, qty_requested: 3 }]);
  assert.equal(write.options.body.evidence_media_id, 44);
  assert.equal(write.options.body.gps_unavailable, true);
  assert.equal(write.options.body.gps_lat, null);
  assert.equal(write.options.body.gps_lng, null);
  assert.equal(Number.isInteger(write.options.body.lines[0].qty_requested), true);
  // T-091 owns the existing mismatch and the stable retry guarantee.
  assert.notEqual(write.options.idempotencyKey, write.options.body.uuid);
});

test.todo('T-091: refill submit retry reuses one UUID in both header and body');

test('delivery uploads handover photo first, then sends exact signature multipart and GPS-unavailable fields', async () => {
  const calls = [];
  const queries = load('src/features/refill/queries.ts', {
    '@tanstack/react-query': { useMutation: (options) => options, useQuery: (options) => options,
      useQueryClient: () => ({ ensureQueryData: async () => [], invalidateQueries: async () => {} }) },
    '@/lib/api': {
      request: async () => ({}), requestWithStatus: async () => ({ data: {}, status: 200 }),
      uploadFile: async (path, file, fields) => { calls.push({ path, file, fields }); return { id: 55 }; },
      uploadFileWithStatus: async (path, file, fields, fieldName, key) => {
        calls.push({ path, file, fields, fieldName, key }); return { data: { id: 9 }, status: 202 };
      }, uuidv4: () => 'delivery-key',
    },
    '@/lib/image': { compressForUpload: async (uri) => ({ uri: `${uri}.small` }) },
    '@/features/showcase/kitchenSelection': { useKitchenSelection: () => null },
    '@/lib/mappers': { toRefillRequest: (raw) => raw, toAppNotification: (raw) => raw,
      toStockRow: (raw) => raw },
  });
  const media = await queries.useUploadHandoverPhoto().mutationFn({ uri: 'handover.jpg', takenAt: '2026-10-24T02:00:00Z' });
  const result = await queries.useDeliverRefill().mutationFn({ id: 9, handoverMediaId: media.id,
    lines: [{ line_id: 3, qty_received: 2 }], gps: null,
    signature: { method: 'staff_signature', uri: 'draw.png', strokeCount: 7 } });
  assert.equal(calls[0].path, '/media/handover');
  assert.deepEqual(plain(calls[0].fields), { taken_at: '2026-10-24T02:00:00Z' });
  assert.equal(calls[1].path, '/refills/9/deliver');
  assert.equal(calls[1].fieldName, 'signature');
  assert.equal(calls[1].key, 'delivery-key');
  assert.deepEqual(plain(calls[1].fields), { handover_media_id: '55', signature_method: 'staff_signature',
    stroke_count: '7', lines: '[{"line_id":3,"qty_received":2}]', gps_lat: '', gps_lng: '', gps_unavailable: '1' });
  assert.equal(result.ledgerPending, true);
});

test('incident compresses once and submits photo and line JSON with the same UUID in multipart and header', async () => {
  const calls = [];
  const incidents = load('src/features/incidents/queries.ts', {
    '@tanstack/react-query': { useMutation: (options) => options, useQuery: (options) => options,
      useQueryClient: () => ({ invalidateQueries: async () => {} }) },
    '@/lib/api': { request: async () => [], uuidv4: () => 'incident-uuid',
      uploadFile: async (...args) => { calls.push(args); return { id: 5 }; } },
    '@/lib/image': { compressForUpload: async (uri) => ({ uri: `${uri}.small` }) },
    '@/features/refill/queries': { invalidateRefillData: () => {} },
  });
  await incidents.useReportIncident().mutationFn({ refillId: 9, photoUri: 'damage.jpg',
    takenAt: '2026-10-24T03:00:00Z', lines: [{ line_id: 3, qty_damaged: 1 }], note: 'pecah' });
  const [path, file, fields, part, key] = calls[0];
  assert.equal(path, '/refills/9/incident');
  assert.equal(file.uri, 'damage.jpg.small');
  assert.equal(part, 'photo');
  assert.equal(fields.uuid, key);
  assert.equal(fields.lines, '[{"line_id":3,"qty_damaged":1}]');
  assert.equal(fields.photo_taken_at, '2026-10-24T03:00:00Z');
});
