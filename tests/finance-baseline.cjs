// Run Finance characterization against screen source from a pre-extraction commit.
// Usage: node tests/finance-baseline.cjs <commit-sha>
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const { join, relative, sep } = require('node:path');

const revision = process.argv[2];
if (!/^[0-9a-f]{7,40}$/.test(revision ?? '')) {
  throw new Error('Provide a commit SHA for the Finance baseline.');
}

const root = join(__dirname, '..');
const screens = new Set([
  'app/(app)/finance/approvals.tsx',
  'app/(app)/finance/settlements.tsx',
  'app/(app)/finance/clearing.tsx',
]);
const originalRead = fs.readFileSync.bind(fs);
fs.readFileSync = (path, ...options) => {
  const name = relative(root, String(path)).split(sep).join('/');
  return screens.has(name)
    ? execFileSync('git', ['show', `${revision}:${name}`], { cwd: root, encoding: 'utf8' })
    : originalRead(path, ...options);
};

require('./finance-screen-characterization.test.cjs');
require('./settlement-screen.test.cjs');
require('./clearing-queries.test.cjs');
