const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');

const source = (path) => readFileSync(join(__dirname, '..', path), 'utf8');
const screen = (name) => source(`app/(app)/barista/${name}.tsx`);

test('Produksi screens use v2 surfaces, product colors and shared entrance motion', () => {
  const requests = screen('requests');
  const preparing = screen('preparing');
  const stock = screen('stock');
  const index = screen('index');

  assert.match(requests, /<Chip label=\{section\.title\.toUpperCase\(\)\}/);
  assert.match(requests, /<RefillCard refill=\{item\} showCost=\{false\} index=\{index\} \/>/);
  assert.match(preparing, /<Card style=\{styles\.card\}>/);
  assert.match(preparing, /<Button label="Siap Diambil"/);
  assert.match(preparing, /<ProductThumbnail product=\{line\} \/>/);
  assert.match(preparing, /<StatusBadge status=\{refill\.status\} \/>/);
  assert.match(stock, /<ProductThumbnail product=\{productById\.get\(item\.product_id\)/);
  assert.match(stock, /productColor\[item\.product_name/);
  assert.match(index, /<Card style=\{\[styles\.kitchenCard/);
  assert.match(index, /<Animated\.View key=\{kitchen\.id\} entering=\{enter\('below', index\)\}>/);

  const tokens = source('src/theme/tokens.ts');
  const motion = source('src/components/ui/Motion.tsx');
  const button = source('src/components/ui/Button.tsx');
  const screenComponent = source('src/components/ui/Screen.tsx');
  assert.match(tokens, /50: '#FBF8F3'/);
  assert.match(tokens, /card: 24/);
  assert.match(screenComponent, /background = semantic\.bg/);
  assert.match(motion, /reduceMotion\(ReduceMotion\.System\)/);
  assert.match(button, /<Touchable/);
  assert.match(button, /enter\('fade'\)/);
});
