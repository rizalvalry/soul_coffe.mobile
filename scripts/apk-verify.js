#!/usr/bin/env node
/**
 * Asserts that the APK size work did not strip anything the app needs at runtime.
 *
 * R8 and shrinkResources are the risky half of that work: React Native looks its fonts and
 * image assets up by NAME through Resources.getIdentifier(), which the resource shrinker
 * cannot see. So this checks the shipped APK instead of trusting the gradle flags.
 *
 * Everything is matched by CONTENT, never by path: with shrinkResources on, AAPT rewrites
 * res/raw/....ttf to res/oI.ttf, so any name-based assertion silently reports a false failure.
 *
 * Usage: node scripts/apk-verify.js [path/to.apk]
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const root = path.join(__dirname, '..');
const apk = process.argv[2] ||
  path.join(root, 'android', 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');

if (!fs.existsSync(apk)) {
  console.error(`APK not found: ${apk}\nBuild one first: npm run apk:release`);
  process.exit(1);
}

const buf = fs.readFileSync(apk);

let eocd = -1;
for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 0xffff); i--) {
  if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
}
if (eocd < 0) { console.error('Not a zip: no EOCD record'); process.exit(1); }

let count = buf.readUInt16LE(eocd + 10);
let cdOffset = buf.readUInt32LE(eocd + 16);
if (count === 0xffff || cdOffset === 0xffffffff) {
  let loc = -1;
  for (let i = eocd - 20; i >= 0 && i > eocd - 4096; i--) {
    if (buf.readUInt32LE(i) === 0x07064b50) { loc = i; break; }
  }
  const z64 = Number(buf.readBigUInt64LE(loc + 8));
  count = Number(buf.readBigUInt64LE(z64 + 32));
  cdOffset = Number(buf.readBigUInt64LE(z64 + 48));
}

const entries = [];
let p = cdOffset;
for (let n = 0; n < count; n++) {
  if (buf.readUInt32LE(p) !== 0x02014b50) break;
  const nameLen = buf.readUInt16LE(p + 28);
  entries.push({
    method: buf.readUInt16LE(p + 10),
    compressed: buf.readUInt32LE(p + 20),
    uncompressed: buf.readUInt32LE(p + 24),
    name: buf.toString('utf8', p + 46, p + 46 + nameLen),
    localOffset: buf.readUInt32LE(p + 42),
  });
  p += 46 + nameLen + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32);
}

/** Inflates one entry, resolving the data offset through its local file header. */
function read(entry) {
  const lh = entry.localOffset;
  const start = lh + 30 + buf.readUInt16LE(lh + 26) + buf.readUInt16LE(lh + 28);
  const raw = buf.subarray(start, start + entry.compressed);
  return entry.method === 0 ? raw : zlib.inflateRawSync(raw);
}

/** Width/height from a PNG IHDR chunk, or null if the bytes are not a PNG. */
function pngSize(data) {
  if (data.length < 24 || data.readUInt32BE(0) !== 0x89504e47) return null;
  return { w: data.readUInt32BE(16), h: data.readUInt32BE(20) };
}

const sizeOf = (p) => (fs.existsSync(p) ? fs.statSync(p).size : -1);
const MCI_TTF = sizeOf(path.join(root,
  'node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/MaterialCommunityIcons.ttf'));

const checks = [];
const ok = (label, pass, detail) => checks.push({ label, pass, detail });

const ttfs = entries.filter((e) => e.name.toLowerCase().endsWith('.ttf'));

// The only icon font the app renders — 58 <MaterialCommunityIcons> call sites. If the
// resource shrinker dropped it, every icon in the app becomes a blank box at runtime.
ok('MaterialCommunityIcons font intact',
  MCI_TTF > 0 && ttfs.some((e) => e.uncompressed === MCI_TTF),
  `no TTF of ${MCI_TTF} bytes in the APK — turn off enableShrinkResourcesInReleaseBuilds`);

// The Metro alias in metro.config.js is supposed to keep this one OUT (963 KB, unused).
ok('MaterialSymbols font excluded', ttfs.length === 1,
  `expected exactly 1 font, found ${ttfs.length} — the metro.config.js stub is not taking effect`);

const bundle = entries.find((e) => e.name === 'assets/index.android.bundle');
ok('Hermes/JS bundle present', !!bundle, 'release bundle missing from APK');

// Assets are matched on DIMENSIONS, not filename or byte size: crunchPngs re-encodes every PNG,
// and shrinkResources renames them to res/xx.png, so the size is the only stable identity left.
//
// These are checked because shrinkResources decides what to keep by scanning for references it
// can see statically, and a JS `require()` is not one of those. If it ever guesses wrong, the app
// installs and launches perfectly and simply has no logo and no product photos — a failure that
// looks like a design change rather than a build fault.
const pngDims = entries
  .filter((e) => e.name.endsWith('.png'))
  .map((e) => { try { return pngSize(read(e)); } catch { return null; } })
  .filter(Boolean);

const countOf = (w, h) => pngDims.filter((d) => d.w === w && d.h === h).length;

// Two at these dimensions: the teal mark and its reversed white twin, which share a size because
// one is generated from the other.
ok('brand marks (349x512 x2) present', countOf(349, 512) >= 2,
  `expected logo-mark.png AND logo-mark-white.png, found ${countOf(349, 512)}`);
ok('brand lockup (563x1024) present', countOf(563, 1024) >= 1,
  'shrinkResources stripped assets/logo-lockup.png');
ok('splash wave (1080x420) present', countOf(1080, 420) >= 1,
  'shrinkResources stripped assets/splash-wave.png — the splash loses its lower band');
ok('9 product tiles (360x360) present', countOf(360, 360) >= 9,
  `expected 9 drink photos for the request grid, found ${countOf(360, 360)}`);

ok('dex present', entries.some((e) => /^classes\d*\.dex$/.test(e.name)), 'no dex in APK');

// APK Signature Scheme v2/v3 lives in the signing block before the central directory,
// NOT in META-INF — checking for a .RSA file reports a false failure on every modern APK.
ok('signed (APK Signing Block)', buf.includes(Buffer.from('APK Sig Block 42')),
  'APK is unsigned — it will not install');

const abis = [...new Set(entries.filter((e) => e.name.startsWith('lib/'))
  .map((e) => e.name.split('/')[1]))].sort();
ok('arm64-v8a shipped', abis.includes('arm64-v8a'), 'no 64-bit lib — required by every modern device');
ok('emulator ABIs dropped', !abis.includes('x86') && !abis.includes('x86_64'),
  'x86 libs still bundled — check buildArchs in app.json');

// useLegacyPackaging=true is what makes the .so files DEFLATE instead of STORE.
const libs = entries.filter((e) => e.name.endsWith('.so'));
ok('native libs compressed', libs.length > 0 && libs.every((e) => e.method !== 0),
  'native libs are STORED — expo.useLegacyPackaging did not apply');

ok('JS bundle compressed', !!bundle && bundle.method !== 0,
  'bundle is STORED — android.enableBundleCompression did not apply');

console.log(`\n${path.basename(apk)} — ${(fs.statSync(apk).size / 1024 / 1024).toFixed(2)} MB\n`);
let failed = 0;
for (const c of checks) {
  console.log(`  ${c.pass ? 'PASS' : 'FAIL'}  ${c.label}${c.pass ? '' : `\n          -> ${c.detail}`}`);
  if (!c.pass) failed++;
}
const libBytes = libs.reduce((a, e) => a + e.compressed, 0);
console.log(`\n  ABIs:        ${abis.join(', ') || '(none)'}`);
console.log(`  native libs: ${libs.length} files, ${(libBytes / 1024 / 1024).toFixed(2)} MB compressed`);
console.log(`  fonts:       ${ttfs.length} (${ttfs.map((e) => e.uncompressed).join(', ')} bytes)\n`);

process.exit(failed ? 1 : 0);
