const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');

const screen = (name) => readFileSync(join(__dirname, '..', `app/(app)/finance/${name}.tsx`), 'utf8');

test('Finance screens use the v2 cream surface and rounded teal heading', () => {
  for (const name of ['approvals', 'history', 'settlements', 'clearing']) {
    const source = screen(name);
    assert.match(source, /<Screen\b/);
    assert.match(source, /color={semantic\.textInverse}/);
    assert.match(source, /borderRadius: radius\??\.card/);
    assert.match(source, /backgroundColor: (?:semantic\.primaryPressed|brand\[700\])/);
  }
});

test('Finance decision surfaces retain product cues and accessible actions', () => {
  const approval = screen('approvals');
  const history = screen('history');
  const settlements = screen('settlements');
  const clearing = screen('clearing');
  assert.match(approval, /<ProductThumbnail product={line} \/>/);
  assert.match(approval, /<RefillCard refill={refill} showCost index={index} \/>/);
  assert.match(approval, /disabled={isPending \|\| hasRetiredLines}/);
  assert.match(history, /<RefillCard refill={item} showCost index={index} \/>/);
  assert.match(settlements, /<ProductThumbnail product={line} \/>/);
  assert.match(settlements, /accessibilityLabel={`Setoran Coffee Bike \$\{row\.cart_code\}`}/);
  assert.match(clearing, /accessibilityLabel={`\$\{row\.sale_date\}, sisa \$\{money\(row\.outstanding_minor\)\}`}/);
});

test('Setoran and Kliring animate direct cards and show a receipt status chip', () => {
  const settlements = screen('settlements');
  const clearing = screen('clearing');
  assert.match(settlements, /<Appear index=\{0\}><Card style=\{styles\.card\}>/);
  assert.match(settlements, /<Appear key=\{row\.cart_id\} index=\{index\}><Touchable/);
  assert.match(clearing, /<Appear index=\{0\}><Card style=\{styles\.card\}>/);
  assert.match(clearing, /<Appear key=\{receipt\.id\} index=\{index \+ 2\}><Card style=\{styles\.card\}>/);
  assert.match(clearing, /<Chip tone=\{receipt\.status === 'POSTED' \? 'brand' : 'neutral'\}/);
});
