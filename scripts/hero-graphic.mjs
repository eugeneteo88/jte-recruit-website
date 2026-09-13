// Branded, auto-generated article hero — no photos, infinite scale.
// usage: import { makeHero } from './hero-graphic.mjs'; await makeHero({title, eyebrow, sector, out})
import { createRequire } from 'module';
const require = createRequire('C:/Users/eugen/jte-website/package.json');
const sharp = require('sharp');

const SECTORS = {
  engineering: { color:'#6f9fd6', icon:'gear' },
  technology:  { color:'#a996e0', icon:'chip' },
  healthcare:  { color:'#6cc3ae', icon:'cross' },
  general:     { color:'#C6A87C', icon:'briefcase' },
};

const ICONS = {
  // 24x24 stroke paths (Feather/Lucide), drawn large + faint as a motif
  gear:`<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>`,
  chip:`<rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/><line x1="20" y1="9" x2="23" y2="9"/><line x1="20" y1="14" x2="23" y2="14"/><line x1="1" y1="9" x2="4" y2="9"/><line x1="1" y1="14" x2="4" y2="14"/>`,
  cross:`<path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z"/>`,
  briefcase:`<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>`,
};

function wrap(title, max=21){
  const words = title.split(' '); const lines=[]; let cur='';
  for(const w of words){ if((cur+' '+w).trim().length>max){ if(cur) lines.push(cur); cur=w; } else cur=(cur+' '+w).trim(); }
  if(cur) lines.push(cur); return lines.slice(0,3);
}
const esc=s=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

export async function makeHero({title, eyebrow, sector='engineering', out}){
  const S = SECTORS[sector]||SECTORS.general;
  const lines = wrap(title);
  const startY = 470 - (lines.length-1)*38;
  const titleSvg = lines.map((ln,i)=>`<text x="96" y="${startY+i*78}" font-family="Georgia,'Times New Roman',serif" font-size="66" fill="#F5F1E8">${esc(ln)}</text>`).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="820" viewBox="0 0 1600 820">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#241B12"/><stop offset="0.6" stop-color="#1d160e"/><stop offset="1" stop-color="#120d08"/>
      </linearGradient>
      <radialGradient id="glow" cx="0.78" cy="0.35" r="0.5">
        <stop offset="0" stop-color="${S.color}" stop-opacity="0.18"/><stop offset="1" stop-color="${S.color}" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="1600" height="820" fill="url(#bg)"/>
    <rect width="1600" height="820" fill="url(#glow)"/>
    <rect x="0" y="0" width="12" height="820" fill="${S.color}"/>
    <g transform="translate(1140,150) scale(19)" fill="none" stroke="${S.color}" stroke-opacity="0.13" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">${ICONS[S.icon]}</g>
    <text x="96" y="120" font-family="Georgia,serif" font-size="40" fill="#C6A87C" letter-spacing="4">JTE</text>
    <text x="97" y="150" font-family="Arial,sans-serif" font-size="15" fill="#9a8f7d" letter-spacing="7">RECRUIT</text>
    <text x="96" y="300" font-family="Arial,sans-serif" font-size="21" fill="${S.color}" letter-spacing="5">${esc(eyebrow.toUpperCase())}</text>
    <rect x="96" y="322" width="70" height="3" fill="${S.color}"/>
    ${titleSvg}
    <text x="96" y="742" font-family="Arial,sans-serif" font-size="19" fill="#8a8175" letter-spacing="1">jte.com.sg</text>
  </svg>`;
  await sharp(Buffer.from(svg)).resize(1600,820).jpeg({quality:86}).toFile(out);
  return out;
}

// CLI: node scripts/hero-graphic.mjs "<title>" "<eyebrow>" <sector> <out>
if(process.argv[2]){
  await makeHero({title:process.argv[2], eyebrow:process.argv[3]||'Engineering · Hiring guide', sector:process.argv[4]||'engineering', out:process.argv[5]||'/tmp/hero.jpg'});
  console.log('wrote', process.argv[5]||'/tmp/hero.jpg');
}
