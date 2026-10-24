const assert = require('node:assert/strict');
const { existsSync, readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const root = join(__dirname, '..');
const source = (file) => readFileSync(join(root, file), 'utf8');

function loadTs(file) {
  const compiled = ts.transpileModule(source(file), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const moduleState = { exports: {} };
  vm.runInNewContext(compiled, { module: moduleState, exports: moduleState.exports });
  return moduleState.exports;
}

test('CMS URL becomes the image source; an absent or blank URL selects the cup placeholder', () => {
  const { productImageSource } = loadTs('src/domain/productImages.ts');
  const url = 'https://cms.example.test/storage/products/new-photo.jpg';
  assert.equal(productImageSource({ image_url: url }).uri, url);
  assert.equal(productImageSource({ image_url: null }), null);
  assert.equal(productImageSource({ image_url: '  ' }), null);

  const compiled = ts.transpileModule(source('src/components/ui/ProductThumbnail.tsx'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
      jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const moduleState = { exports: {} };
  const jsx = (type, props, key) => ({ type, props, key });
  const modules = {
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-native': { Image: 'Image', View: 'View', StyleSheet: { create: (styles) => styles } },
    '@expo/vector-icons/MaterialCommunityIcons': 'CupIcon',
    '@/domain/productImages': { productImageSource },
    '@/theme': { brand: { 700: '#007277' }, neutral: { 100: '#f4f0e9' },
      productColor: { 'Soul Matcha': { bg: '#E2F2DC', fg: '#2F6B2A' } }, radius: { md: 14 } },
  };
  vm.runInNewContext(compiled, { module: moduleState, exports: moduleState.exports,
    require: (name) => modules[name] });
  const thumbnail = moduleState.exports.ProductThumbnail;
  const photo = thumbnail({ product: { image_url: url } }).props.children;
  assert.equal(photo.type, 'Image');
  assert.equal(photo.props.source.uri, url);
  assert.equal(photo.key, url);
  assert.equal(thumbnail({ product: { image_url: null } }).props.children.props.name, 'cup-outline');
  assert.equal(thumbnail({ product: { image_url: '  ' } }).props.children.props.name, 'cup-outline');
  const matcha = thumbnail({ product: { product_name: 'Soul Matcha', image_url: null } });
  assert.equal(matcha.props.style[1].backgroundColor, '#E2F2DC');
  assert.equal(matcha.props.children.props.color, '#2F6B2A');
  assert.equal(thumbnail({ product: { image_url: null } }).props.style[1].backgroundColor, '#f4f0e9');
  const replacement = 'https://cms.example.test/storage/products/replaced.jpg';
  assert.equal(thumbnail({ product: { image_url: replacement } }).props.children.key, replacement);
});

test('refill mapper carries the API image URL into line cards', () => {
  const { toRefillRequest } = loadTs('src/lib/mappers.ts');
  const url = 'https://cms.example.test/storage/products/refill.jpg';
  const refill = toRefillRequest({
    lines: [{ id: 1, product_id: 7, product_name: 'Kopi', image_url: url, qty_requested: 2,
      qty_approved: null, qty_prepared: null, qty_received: null }],
  }, () => 'cup');
  assert.equal(refill.lines[0].image_url, url);
  assert.equal(toRefillRequest({ lines: [{ id: 1, product_id: 7, product_name: 'Kopi',
    qty_requested: 2, qty_approved: null, qty_prepared: null, qty_received: null }] }, () => 'cup')
    .lines[0].image_url, null);
});

test('all seven screens render the shared thumbnail and no bundled product folder remains', () => {
  const screens = [
    'app/(app)/barista/allocations.tsx',
    'app/(app)/barista/brew.tsx',
    'app/(app)/barista/preparing.tsx',
    'app/(app)/finance/approvals.tsx',
    'app/(app)/finance/settlements.tsx',
    'app/(app)/rider/active.tsx',
    'app/(app)/staff/requests/[id].tsx',
  ];
  for (const screen of screens) {
    assert.match(source(screen), /<ProductThumbnail product=\{(?:product|line)\}(?: size=\{32\})? \/>/, screen);
  }
  assert.match(source('app/(app)/staff/closing.tsx'), /<ProductThumbnail product=\{productById\.get\(line\.product_id\) \?\? \{\}\}/);
  assert.equal(existsSync(join(root, 'assets', 'products')), false);
});
