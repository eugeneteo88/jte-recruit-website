// Branded in-body graphics in JTE house style (dark bg, gold accents, serif).
// Generated immediately (no photo needed). Types: 'steps', 'list', 'tracks'.
// usage: makeGraphic({type, eyebrow, title, items, out})  — items: array of strings
//        tracks: items = [ [leftLabel, rightLabel], endLabel ]
import { createRequire } from 'module';
const require = createRequire('C:/Users/eugen/jte-website/package.json');
const sharp = require('sharp');
const esc = s => (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
function wrap(t,max){const w=String(t).split(' ');const L=[];let c='';for(const x of w){if((c+' '+x).trim().length>max){if(c)L.push(c);c=x;}else c=(c+' '+x).trim();}if(c)L.push(c);return L;}

const W=1600,H=900,GOLD='#C6A87C',CREAM='#F5F1E8',MUT='#b9ad99';
const defs=`<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#241B12"/><stop offset="0.6" stop-color="#1d160e"/><stop offset="1" stop-color="#120d08"/></linearGradient></defs>`;
const head=(eyebrow,title)=>{
  const tl=wrap(title,34).slice(0,2);
  const ty=tl.length>1?188:210;
  const titleSvg=tl.map((ln,i)=>`<text x="90" y="${ty+i*62}" font-family="Georgia,serif" font-size="52" fill="${CREAM}">${esc(ln)}</text>`).join('');
  return `<rect width="${W}" height="${H}" fill="url(#bg)"/><rect x="0" y="0" width="12" height="${H}" fill="${GOLD}"/>`+
    `<text x="90" y="118" font-family="Arial,sans-serif" font-size="21" fill="${GOLD}" letter-spacing="5">${esc((eyebrow||'').toUpperCase())}</text>`+
    `<rect x="90" y="${ty-58}" width="66" height="3" fill="${GOLD}"/>`+titleSvg+
    `<text x="1510" y="852" text-anchor="end" font-family="Georgia,serif" font-size="30" fill="${CREAM}" letter-spacing="2">JTE</text>`+
    `<text x="1510" y="874" text-anchor="end" font-family="Arial,sans-serif" font-size="11" fill="${MUT}" letter-spacing="6">RECRUIT</text>`;
};

function stepsSvg(items){
  const n=items.length, cy=560, r=40, x0=110, x1=1490, span=(x1-x0)/n;
  let s=`<line x1="${x0+span/2}" y1="${cy}" x2="${x1-span/2}" y2="${cy}" stroke="${GOLD}" stroke-opacity="0.4" stroke-width="3"/>`;
  items.forEach((it,i)=>{
    const cx=x0+span*(i+0.5);
    s+=`<circle cx="${cx}" cy="${cy}" r="${r}" fill="#241B12" stroke="${GOLD}" stroke-width="3"/>`;
    s+=`<text x="${cx}" y="${cy+13}" text-anchor="middle" font-family="Georgia,serif" font-size="34" fill="${GOLD}">${i+1}</text>`;
    const lines=wrap(it,16).slice(0,3);
    lines.forEach((ln,j)=>{ s+=`<text x="${cx}" y="${cy+r+50+j*30}" text-anchor="middle" font-family="Arial,sans-serif" font-size="22" fill="${CREAM}">${esc(ln)}</text>`; });
    if(i<n-1) s+=`<text x="${cx+span/2}" y="${cy+11}" text-anchor="middle" font-family="Arial,sans-serif" font-size="34" fill="${GOLD}" fill-opacity="0.6">&#8250;</text>`;
  });
  return s;
}
function listSvg(items){
  const y0=340, gap=Math.min(96,(H-y0-120)/items.length);
  return items.map((it,i)=>{
    const y=y0+i*gap;
    const tick=`<circle cx="118" cy="${y-8}" r="15" fill="none" stroke="${GOLD}" stroke-width="3"/><path d="M111 ${y-8} l5 6 l9 -12" fill="none" stroke="${GOLD}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`;
    const lines=wrap(it,52).slice(0,2);
    const txt=lines.map((ln,j)=>`<text x="158" y="${y+(j*30)}" font-family="Arial,sans-serif" font-size="27" fill="${CREAM}">${esc(ln)}</text>`).join('');
    return tick+txt;
  }).join('');
}
function tracksSvg(items){
  const [labels,endLabel]=items; // labels=[left,right]
  const laneX=90,laneW=940,lh=120,rad=14;
  const y1=380,y2=560, ex=1100, ew=410, ey=y1-20, eh=(y2+lh)-(y1-20)+20;
  let s='';
  [ [y1,labels[0]], [y2,labels[1]] ].forEach(([y,lab])=>{
    s+=`<rect x="${laneX}" y="${y}" width="${laneW}" height="${lh}" rx="${rad}" fill="#2c2115" stroke="${GOLD}" stroke-opacity="0.5" stroke-width="2"/>`;
    const lines=wrap(lab,34).slice(0,2);
    lines.forEach((ln,j)=>{ s+=`<text x="${laneX+34}" y="${y+lh/2-6+j*32+(lines.length>1?-8:8)}" font-family="Arial,sans-serif" font-size="26" fill="${CREAM}">${esc(ln)}</text>`; });
    s+=`<text x="${laneX+laneW+26}" y="${y+lh/2+12}" font-family="Arial,sans-serif" font-size="40" fill="${GOLD}" fill-opacity="0.7">&#8594;</text>`;
  });
  s+=`<rect x="${ex}" y="${ey}" width="${ew}" height="${eh}" rx="16" fill="#241B12" stroke="${GOLD}" stroke-width="3"/>`;
  const el=wrap(endLabel,16).slice(0,3);
  el.forEach((ln,j)=>{ s+=`<text x="${ex+ew/2}" y="${ey+eh/2-14+j*38+(el.length>1?0:14)}" text-anchor="middle" font-family="Georgia,serif" font-size="34" fill="${CREAM}">${esc(ln)}</text>`; });
  return s;
}

export async function makeGraphic({type,eyebrow,title,items,out}){
  let inner='';
  if(type==='steps') inner=stepsSvg(items);
  else if(type==='list') inner=listSvg(items);
  else if(type==='tracks') inner=tracksSvg(items);
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${defs}${head(eyebrow,title)}${inner}</svg>`;
  await sharp(Buffer.from(svg)).jpeg({quality:88}).toFile(out);
  return out;
}
