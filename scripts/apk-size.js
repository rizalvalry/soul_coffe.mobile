#!/usr/bin/env node
/**
 * Prints the compressed-size breakdown of a release APK by top-level group.
 * `du` on the extracted tree lies about download size — this reads the zip
 * central directory, so the numbers are what a user actually downloads.
 *
 * Usage: node scripts/apk-size.js [path/to.apk]
 */
const fs = require('fs');
const path = require('path');

const apk = process.argv[2] ||
  path.join(__dirname, '..', 'android', 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');

if (!fs.existsSync(apk)) {
  console.error(`APK not found: ${apk}\nBuild one first: npm run apk:release`);
  process.exit(1);
}

const buf = fs.readFileSync(apk);

// Locate End Of Central Directory (scan back over the max 64K comment field).
const EOCD = 0x06054b50;
let eocd = -1;
for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 0xffff); i--) {
  if (buf.readUInt32LE(i) === EOCD) { eocd = i; break; }
}
if (eocd < 0) { console.error('Not a zip: no EOCD record'); process.exit(1); }

let count = buf.readUInt16LE(eocd + 10);
let cdOffset = buf.readUInt32LE(eocd + 16);

// Zip64 fallback for >65535 entries / >4GB — an APK can legitimately trip the entry count.
if (count === 0xffff || cdOffset === 0xffffffff) {
  const Z64_LOC = 0x07064b50;
  let loc = -1;
  for (let i = eocd - 20; i >= 0 && i > eocd - 4096; i--) {
    if (buf.readUInt32LE(i) === Z64_LOC) { loc = i; break; }
  }
  if (loc < 0) { console.error('Zip64 locator missing'); process.exit(1); }
  const z64 = Number(buf.readBigUInt64LE(loc + 8));
  count = Number(buf.readBigUInt64LE(z64 + 32));
  cdOffset = Number(buf.readBigUInt64LE(z64 + 48));
}

const groups = new Map();
let total = 0;
let p = cdOffset;

for (let n = 0; n < count; n++) {
  if (buf.readUInt32LE(p) !== 0x02014b50) break;
  const compressed = buf.readUInt32LE(p + 20);
  const nameLen = buf.readUInt16LE(p + 28);
  const extraLen = buf.readUInt16LE(p + 30);
  const commentLen = buf.readUInt16LE(p + 32);
  const name = buf.toString('utf8', p + 46, p + 46 + nameLen);

  const seg = name.split('/');
  let key;
  if (seg[0] === 'lib') key = `lib/${seg[1] || '?'}`;                 // native libs, per ABI
  else if (name.endsWith('.dex')) key = 'dex (java/kotlin)';
  else if (seg[0] === 'assets') key = 'assets (js bundle, fonts)';
  else if (seg[0] === 'res') key = 'res (images, layouts)';
  else if (name === 'resources.arsc') key = 'resources.arsc';
  else key = 'other (META-INF, manifest)';

  groups.set(key, (groups.get(key) || 0) + compressed);
  total += compressed;
  p += 46 + nameLen + extraLen + commentLen;
}

const mb = (b) => (b / 1024 / 1024).toFixed(2).padStart(7) + ' MB';
const rows = [...groups.entries()].sort((a, b) => b[1] - a[1]);

console.log(`\n${path.basename(apk)} — ${(fs.statSync(apk).size / 1024 / 1024).toFixed(2)} MB on disk\n`);
for (const [k, v] of rows) {
  const pct = ((v / total) * 100).toFixed(1).padStart(5);
  console.log(`  ${k.padEnd(30)} ${mb(v)}  ${pct}%`);
}
console.log(`  ${''.padEnd(30)} ${'-'.repeat(10)}`);
console.log(`  ${'compressed total'.padEnd(30)} ${mb(total)}\n`);
