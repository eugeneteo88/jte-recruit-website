#!/usr/bin/env node
/*
 * JTE hero watermark stamper — keeps the "JTE / RECRUIT" mark IDENTICAL across every Field Notes hero,
 * so it never gets eyeballed / drifts again.
 *
 *   node scripts/watermark.mjs <input> [output] [--color=auto|white|black|gold] [--op=0.5]
 *
 * - "RECRUIT" is centred under "JTE", bottom-right, sized to the image (works for 1600x820, 1440x736, etc).
 * - --color=auto (default) samples the watermark corner: LIGHT background -> dark (black) mark, DARK -> white.
 *   Override with white / black / gold when a specific image reads better a certain way.
 * - Run it on the FINISHED hero (after any retouching/resize). It only stamps the mark.
 * - sharp is loaded from the jte-website package (same as StockKaki's gen-og.mjs).
 */
import { createRequire } from 'node:module';
import { renameSync } from 'node:fs';
const require = createRequire('C:/Users/eugen/jte-website/package.json');
const sharp = require('sharp');

const argv = process.argv.slice(2);
const flags = Object.fromEntries(argv.filter(a => a.startsWith('--')).map(a => { const [k, v] = a.slice(2).split('='); return [k, v ?? true]; }));
const pos = argv.filter(a => !a.startsWith('--'));
const IN = pos[0], OUT = pos[1] || pos[0];
if (!IN) { console.error('usage: node scripts/watermark.mjs <input> [output] [--color=auto|white|black|gold] [--op=0.5]'); process.exit(1); }

// The canonical mark: colour + default opacity per variant.
const VARIANTS = { white: { fill: '#ffffff', op: 0.60 }, black: { fill: '#141210', op: 0.50 }, gold: { fill: '#8C7350', op: 0.55 } };

const meta = await sharp(IN).metadata();
const W = meta.width, H = meta.height;

// geometry, all relative to the image so every size matches
const jteSize = Math.round(W * 0.0208);          // JTE cap height (1600 -> 33)
const recSize = Math.max(9, Math.round(jteSize * 0.35));
const cx = Math.round(W - W * 0.058);            // block centre x (bottom-right)
const jy = Math.round(H - H * 0.058);            // JTE baseline
const ry = jy + Math.round(jteSize * 0.64);      // RECRUIT baseline

// colour: explicit variant, or auto by corner luminance
let key = (typeof flags.color === 'string' && VARIANTS[flags.color]) ? flags.color : 'auto';
if (key === 'auto') {
  // sample the exact patch the mark sits on (not the whole corner) so mixed corner content doesn't fool it
  const bx = Math.max(0, cx - Math.round(jteSize * 2.6));
  const by = Math.max(0, jy - jteSize - 4);
  const bw = Math.min(W - bx, Math.round(jteSize * 5.2));
  const bh = Math.min(H - by, (ry - jy) + jteSize + 10);
  const { data } = await sharp(IN).extract({ left: bx, top: by, width: bw, height: bh }).greyscale().raw().toBuffer({ resolveWithObject: true });
  let sum = 0; for (const v of data) sum += v;
  const lum = sum / data.length;
  // Only a clearly-bright patch gets a dark mark; everything else defaults to white. Mid-tones are ambiguous
  // and the "right" colour is an aesthetic call — pass --color=black/gold to override. (Auto is a suggestion.)
  key = lum > 175 ? 'black' : 'white';
  console.log(`  (auto: corner luminance ${lum.toFixed(0)} -> ${key}; override with --color=black|white|gold)`);
}
const C = VARIANTS[key];
const op = flags.op != null ? +flags.op : C.op;

const svg = Buffer.from(`<svg width="${W}" height="${H}">
  <text x="${cx}" y="${jy}" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="${jteSize}" letter-spacing="${Math.round(jteSize * 0.09)}" fill="${C.fill}" fill-opacity="${op}">JTE</text>
  <text x="${cx}" y="${ry}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="${recSize}" letter-spacing="${Math.round(recSize * 0.55)}" fill="${C.fill}" fill-opacity="${(op * 0.9).toFixed(3)}">RECRUIT</text>
</svg>`);

const tmp = OUT + '.wm.tmp.jpg';
await sharp(IN).composite([{ input: svg }]).jpeg({ quality: 88, mozjpeg: true }).toFile(tmp);
renameSync(tmp, OUT);
console.log(`watermark: ${key} (op ${op}) on ${W}x${H} -> ${OUT}`);
