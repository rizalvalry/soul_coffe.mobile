const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const repo = path.resolve(__dirname, '..');
const denylist = [
  'src/features/**', 'src/lib/**', 'src/domain/**',
  'src/components/ui/quantity.ts', 'src/components/ui/SignaturePad.tsx',
  'android/**', 'scripts/**', 'app.json', 'app.config.js',
];
// These two files establish the guard on its own non-visual preparation branch.
const bootstrapBranch = 'task/T-090-redesign-safety-net';
const bootstrapFiles = new Set(['scripts/redesign-guard.cjs', 'scripts/api-contract-snapshot.cjs']);

function globPattern(glob) {
  let pattern = '^';
  for (let i = 0; i < glob.length; i++) {
    const char = glob[i];
    if (char === '*') {
      if (glob[i + 1] === '*') { pattern += '.*'; i++; }
      else pattern += '[^/]*';
    } else if (char === '?') pattern += '[^/]';
    else pattern += char.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
  }
  return new RegExp(pattern + '$');
}

function validatePaths(changed, allowlist, branch = '') {
  const allowed = allowlist.map(globPattern);
  const denied = denylist.map(globPattern);
  const failures = [];
  for (const file of changed) {
    const bootstrap = branch === bootstrapBranch && bootstrapFiles.has(file);
    if (!bootstrap && denied.some((pattern) => pattern.test(file))) failures.push(`${file}: denylist`);
    else if (!allowed.some((pattern) => pattern.test(file))) failures.push(`${file}: outside allowlist`);
  }
  return failures;
}

function git(args) {
  const result = spawnSync('git', args, { cwd: repo, encoding: 'utf8' });
  if (result.error || result.status !== 0) throw new Error(result.stderr?.trim() || result.error?.message || 'git failed');
  return result.stdout;
}

function run(args) {
  const baseIndex = args.indexOf('--base');
  const allowIndex = args.indexOf('--allow');
  if (baseIndex < 0 || allowIndex < 0 || !args[baseIndex + 1] || !args[allowIndex + 1]) {
    throw new Error('Usage: redesign-guard.cjs --base <sha> --allow <file-allowlist>');
  }
  const base = args[baseIndex + 1];
  const allowFile = path.resolve(process.cwd(), args[allowIndex + 1]);
  const allowlist = fs.readFileSync(allowFile, 'utf8').split(/\r?\n/)
    .map((line) => line.trim()).filter((line) => line && !line.startsWith('#'));
  if (allowlist.length === 0) throw new Error('Allowlist is empty.');
  // A rename must expose both the old protected path and the new destination.
  const changed = git(['diff', '--no-renames', '--name-only', '-z', `${base}...HEAD`]).split('\0').filter(Boolean)
    .map((file) => file.replaceAll('\\', '/'));
  const branch = git(['branch', '--show-current']).trim();
  const failures = validatePaths(changed, allowlist, branch);
  if (failures.length) throw new Error(`Redesign guard failed:\n${failures.join('\n')}`);
  process.stdout.write(`Redesign guard passed: ${changed.length} changed paths checked.\n`);
}

if (require.main === module) {
  try { run(process.argv.slice(2)); }
  catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}
module.exports = { validatePaths, run };
