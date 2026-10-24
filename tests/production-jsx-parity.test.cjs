const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const ts = require('typescript');

const root = join(__dirname, '..');
const baseline = JSON.parse(readFileSync(join(__dirname, 'fixtures', 'production-jsx.baseline.json'), 'utf8'));

function visualShape(path) {
  const tree = ts.createSourceFile(path, readFileSync(join(root, path), 'utf8'),
    ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const parts = [];
  function visit(node) {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      parts.push(['tag', node.tagName.getText(tree), node.attributes.properties.map((prop) => {
        if (ts.isJsxSpreadAttribute(prop)) return ['spread', 'expression'];
        return [prop.name.text, prop.initializer && ts.isStringLiteral(prop.initializer)
          ? prop.initializer.text : 'expression'];
      })]);
    }
    if (ts.isJsxText(node)) {
      const value = node.getText(tree).replace(/\s+/g, ' ').trim();
      if (value) parts.push(['text', value]);
    }
    ts.forEachChild(node, visit);
  }
  visit(tree);
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex');
}

test('six Produksi screens retain their pre-extraction JSX tags, static props and text', () => {
  for (const [screen, hash] of Object.entries(baseline)) {
    assert.equal(visualShape(`app/(app)/barista/${screen}.tsx`), hash, screen);
  }
});
