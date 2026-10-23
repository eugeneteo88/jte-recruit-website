// Branded article hero in JTE house style: photo + dark overlay + gold eyebrow
// + serif headline (with a gold italic accent) + JTE mark bottom-right.
// Scales without a photo backlog: reuse a small set of sector background photos.
// usage: makeHero({eyebrow, headline, accent, subtitle, bg, out})
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
const require = createRequire('C:/Users/eugen/jte-website/package.json');
const sharp = require('sharp');

const esc = s => (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

const BG_DIR = path.join(path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Za-z]:)/,'$1'), '..', 'assets', 'hero-bg');

// list available backgrounds for a sector (files named e.g. engineering-1.jpg)
export function heroBgs(sector, dir=BG_DIR){
  try { return fs.readdirSync(dir).filter(f=>f.startsWith(sector+'-') && /\.(jpe?g|png|webp)$/i.test(f)).sort().map(f=>path.join(dir,f)); }
  catch { return []; }
}
// deterministic rotation: same slug always picks the same bg, but spreads across the pool
export function pickBg(sector, seed, dir=BG_DIR){
  const list = heroBgs(sector, dir); if(!list.length) return null;
  let h=2166136261; for(const ch of String(seed)){ h^=ch.charCodeAt(0); h=Math.imul(h,16777619); }
  return list[(h>>>0)%list.length];
}

function wrap(text, max=26){
  const words = String(text).split(' '); const lines=[]; let cur='';
  for(const w of words){ if((cur+' '+w).trim().length>max){ if(cur) lines.push(cur); cur=w; } else cur=(cur+' '+w).trim(); }
  if(cur) lines.push(cur); return lines;
}

export async function makeHero({eyebrow='', headline='', accent='', subtitle='', bg, out}){
  const hlLines = wrap(headline, 24).slice(0,2);
  const HL_SIZE = 64, HL_LH = 74, HL_X = 90, HL_Y0 = 250;
  const headlineSvg = hlLines.map((ln,i)=>{
    const isLast = i===hlLines.length-1;
    const accentSpan = (isLast && accent) ? ` <tspan font-style="italic" fill="#C6A87C">${esc(accent)}</tspan>` : '';
    return `<text x="${HL_X}" y="${HL_Y0+i*HL_LH}" font-family="Georgia,'Times New Roman',serif" font-size="${HL_SIZE}" fill="#F7F4EE">${esc(ln)}${accentSpan}</text>`;
  }).join('');
  const subY = HL_Y0 + hlLines.length*HL_LH + 18;
  const subLines = wrap(subtitle, 52).slice(0,2);
  const subSvg = subLines.map((ln,i)=>`<text x="${HL_X}" y="${subY+i*34}" font-family="Arial,Helvetica,sans-serif" font-size="22" fill="#E9E4DB">${esc(ln)}</text>`).join('');

  const overlay = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="820" viewBox="0 0 1600 820">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="0.15">
        <stop offset="0" stop-color="#0b0906" stop-opacity="0.86"/>
        <stop offset="0.52" stop-color="#0b0906" stop-opacity="0.5"/>
        <stop offset="1" stop-color="#0b0906" stop-opacity="0.28"/>
      </linearGradient>
    </defs>
    <rect width="1600" height="820" fill="url(#g)"/>
    <text x="90" y="160" font-family="Arial,Helvetica,sans-serif" font-size="20" fill="#C6A87C" letter-spacing="5">${esc(eyebrow.toUpperCase())}</text>
    ${headlineSvg}
    ${subSvg}
    <text x="1512" y="690" text-anchor="end" font-family="Georgia,serif" font-size="38" fill="#F7F4EE" letter-spacing="2">JTE</text>
    <text x="1512" y="716" text-anchor="end" font-family="Arial,sans-serif" font-size="13" fill="#d8cfbe" letter-spacing="6">RECRUIT</text>
  </svg>`;

  await sharp(bg)
    .resize(1600,820,{fit:'cover',position:'centre'})
    .composite([{ input: Buffer.from(overlay), top:0, left:0 }])
    .jpeg({quality:86})
    .toFile(out);
  return out;
}

// CLI: node scripts/hero-graphic.mjs "<eyebrow>" "<headline>" "<accent>" "<subtitle>" <bg> <out>
if(process.argv[2]){
  await makeHero({eyebrow:process.argv[2], headline:process.argv[3], accent:process.argv[4]||'', subtitle:process.argv[5]||'', bg:process.argv[6], out:process.argv[7]||'/tmp/hero.jpg'});
  console.log('wrote', process.argv[7]||'/tmp/hero.jpg');
}
