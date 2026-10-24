const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');

const screen = (path) => readFileSync(join(__dirname, '..', 'app', '(app)', path), 'utf8');

test('home keeps its menu tiles while using v2 hero and card surfaces', () => {
  const source = screen('menu.tsx');
  assert.match(source, /roleCard: \{[^\n]*backgroundColor: brand\[900\]/);
  assert.match(source, /primaryTile: \{[\s\S]*?backgroundColor: neutral\[0\],[\s\S]*?borderRadius: radius\.card/);
  assert.match(source, /<Touchable[\s\S]*?accessibilityLabel=\{item\.label\}/);
});

test('refill uses the cream screen and existing animated product picker and photo controls', () => {
  const source = screen('staff/refill/new.tsx');
  assert.doesNotMatch(source, /background=\{BACKDROP\}/);
  assert.match(source, /<SectionTitle[\s\S]*?title="Pilih produk"/);
  assert.match(source, /<ProductPickerCard[\s\S]*?disabled=\{controlsDisabled\}/);
  assert.match(source, /<Animated\.View entering=\{enter\('below'\)\}>[\s\S]*?<Card style=\{styles\.evidenceCard\}>/);
});

test('stock uses product colors and thumbnails; refill list retains status cards', () => {
  const stock = screen('staff/stock.tsx');
  const list = screen('staff/requests/index.tsx');
  assert.match(stock, /productColor\[item\.product_name/);
  assert.match(stock, /<ProductThumbnail product=\{\{ product_name: item\.product_name/);
  assert.match(stock, /<Animated\.View entering=\{enter\('below', index\)\}/);
  assert.match(list, /<Chip tone=\{isRealtime \? 'brand' : 'amber'\}/);
  assert.match(list, /<RefillCard refill=\{item\} showCost=\{false\} index=\{index\}/);
});

test('tracking shows a blue status hero and the existing animated timeline', () => {
  const source = screen('staff/requests/[id].tsx');
  assert.match(source, /headerCard: \{[^\n]*backgroundColor: feedback\.infoFg, borderRadius: radius\.hero/);
  assert.match(source, /<StatusBadge status=\{refill\.status\} \/>/);
  assert.match(source, /<RefillTimeline refill=\{refill\} \/>/);
  assert.match(source, /<ProductThumbnail product=\{line\} size=\{32\} \/>/);
});
