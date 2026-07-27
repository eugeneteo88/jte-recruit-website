// JTE winnable-keyword tracker — pulls Search Console, maps non-branded queries JTE can
// realistically win (pos 4–40) into a prioritised battle plan, grouped by the page that
// should rank. Run monthly to watch keywords climb 🌱 Building → 🔥 Striking → page 1.
//   node keyword-targets.mjs            → print to console
//   (with RESEND_API_KEY set)           → also email REPORT_TO (default eugeneteo1988@gmail.com)
// Auth reuses .ga-key.json (written from GA_KEY_JSON in CI), same SA as growth-report.mjs.
import { readFileSync } from 'node:fs';
import { createSign } from 'node:crypto';
const KEY = JSON.parse(readFileSync(new URL('./.ga-key.json', import.meta.url), 'utf8'));
const SITE = 'https://jte.com.sg/';
const WINDOW_DAYS = 90;          // GSC lookback (JTE is young; widen as history grows)
const MIN_IMPR = 8;              // ignore noise below this many impressions in the window
const { RESEND_API_KEY, REPORT_TO } = process.env;
const b64url = b => Buffer.from(b).toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');

const now = Math.floor(Date.now()/1000);
const head = b64url(JSON.stringify({alg:'RS256',typ:'JWT'}));
const claim = b64url(JSON.stringify({iss:KEY.client_email,scope:'https://www.googleapis.com/auth/webmasters.readonly',aud:KEY.token_uri,iat:now,exp:now+3600}));
const sign = createSign('RSA-SHA256'); sign.update(head+'.'+claim); sign.end();
const jwt = head+'.'+claim+'.'+b64url(sign.sign(KEY.private_key));
const tr = await (await fetch(KEY.token_uri,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:jwt})})).json();
if(!tr.access_token) throw new Error('token: '+JSON.stringify(tr));
const tok = tr.access_token;

const iso = d => d.toISOString().slice(0,10);
const ago = n => { const d=new Date(); d.setUTCDate(d.getUTCDate()-n); return iso(d); };
const n = x => Number(x||0);
const gsc = async body => { const r = await (await fetch(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(SITE)}/searchAnalytics/query`,{method:'POST',headers:{Authorization:'Bearer '+tok,'Content-Type':'application/json'},body:JSON.stringify(body)})).json(); if(r.error)throw new Error('gsc: '+r.error.message); return r.rows||[]; };

const START=ago(WINDOW_DAYS), END=ago(1);
const q  = await gsc({startDate:START,endDate:END,dimensions:['query'],type:'web',rowLimit:1000});
const qp = await gsc({startDate:START,endDate:END,dimensions:['query','page'],type:'web',rowLimit:2000});
const bestPage={};
for(const r of qp){ const [query,page]=r.keys; if(!bestPage[query]||r.impressions>bestPage[query].imp) bestPage[query]={page:page.replace('https://jte.com.sg',''),imp:r.impressions}; }

const theme = s => { s=s.toLowerCase();
  if(/salary|pay|wage/.test(s))return 'Salary';
  if(/cost|fee|price|charge|how much/.test(s))return 'Fees';
  if(/engineer/.test(s))return 'Engineering';
  if(/\bit\b|software|tech|ict|cyber|data|cloud/.test(s))return 'IT & Tech';
  if(/logistic|warehouse|driver|supply chain|freight/.test(s))return 'Logistics';
  if(/manufactur|production|factory/.test(s))return 'Manufacturing';
  if(/healthcare|nurse|clinic|pharmac/.test(s))return 'Healthcare';
  if(/accounting|finance|hr|admin|sales|commercial|marketing/.test(s))return 'Commercial';
  if(/pass|permit|work visa|\bep\b|s pass|mom/.test(s))return 'Work pass';
  if(/scam|verify|fake|legit/.test(s))return 'Trust';
  if(/temp|contract|permanent|outsourc|payroll|headhunt|executive search|staffing|employer brand/.test(s))return 'Service';
  return 'General'; };
const tierOf = p => p<8 ? {k:1,t:'⭐ Page-1 climb (4–8)'} : p<=20 ? {k:0,t:'🔥 Striking (8–20)'} : {k:2,t:'🌱 Building (20–40)'};

const rows = q.map(r=>({q:r.keys[0],imp:n(r.impressions),clk:n(r.clicks),pos:n(r.position),page:(bestPage[r.keys[0]]||{}).page||'—'}))
  .filter(r=>!/jte/i.test(r.q) && r.imp>=MIN_IMPR && r.pos>=3.5 && r.pos<=40)
  .map(r=>({...r,theme:theme(r.q),tier:tierOf(r.pos)}))
  .sort((a,b)=> a.tier.k-b.tier.k || b.imp-a.imp);

// ---------- console ----------
console.log(`\nJTE winnable keywords · GSC ${START}→${END} · ${rows.length} targets (non-branded, pos 4–40, ≥${MIN_IMPR} impressions)`);
for(const T of ['🔥 Striking (8–20)','⭐ Page-1 climb (4–8)','🌱 Building (20–40)']){
  const g=rows.filter(r=>r.tier.t===T); if(!g.length)continue;
  console.log(`\n══════ ${T}  (${g.length}) ══════`);
  g.forEach(r=>console.log(`  pos ${r.pos.toFixed(0).padStart(2)} · ${String(r.imp).padStart(4)} imp · ${String(r.clk).padStart(2)} clk · [${r.theme}]  "${r.q}"  → ${r.page}`));
}

// ---------- email (monthly battle plan) ----------
if(RESEND_API_KEY){
  const to = REPORT_TO || 'eugeneteo1988@gmail.com';
  const GOLD='#8C7350', DARK='#241B12', MUTE='#8a8175', CREAM='#FBF9F4', LINE='#e7e0d3';
  const esc = s => String(s).replace(/</g,'&lt;');
  const section = (T,list) => { if(!list.length) return '';
    const tr = list.map(r=>`<tr><td style="padding:5px 10px;text-align:center;color:${r.pos<=10?'#1a7f4b':GOLD};font-weight:700;white-space:nowrap">${r.pos.toFixed(0)}</td><td style="padding:5px 10px">${esc(r.q)}</td><td style="padding:5px 10px;color:${MUTE};white-space:nowrap">${r.imp} imp</td><td style="padding:5px 10px;color:${MUTE};font-size:11px">${esc(r.page)}</td></tr>`).join('');
    return `<h3 style="font-family:'Playfair Display',Georgia,serif;font-size:16px;color:${DARK};margin:20px 4px 6px">${T} &nbsp;<span style="color:${MUTE};font-size:12px">${list.length}</span></h3>
    <table style="width:100%;border-collapse:collapse;font-size:13px;background:#fff;border:1px solid ${LINE};border-radius:8px;overflow:hidden"><tr style="color:${MUTE};font-size:10px;text-transform:uppercase;letter-spacing:.05em"><td style="padding:5px 10px;text-align:center">Pos</td><td style="padding:5px 10px">Keyword</td><td style="padding:5px 10px">Demand</td><td style="padding:5px 10px">Ranking page</td></tr>${tr}</table>`; };
  const html = `<div style="max-width:640px;margin:0 auto;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#1c1a17;background:${CREAM};padding:24px">
  <div style="font-size:12px;color:${GOLD};letter-spacing:.14em;text-transform:uppercase;font-weight:600">JTE Recruit · keyword battle plan</div>
  <h1 style="font-family:'Playfair Display',Georgia,serif;font-size:24px;font-weight:700;color:${DARK};margin:4px 0 6px">Winnable keywords — where to aim</h1>
  <p style="font-size:13px;color:#6b6459;margin:0 4px 8px">Non-branded searches JTE ranks pos 4–40 for, over the last ${WINDOW_DAYS} days. 🔥 Striking = one push from page 1 (do these first). Where "ranking page" shows <b>/</b>, the generic homepage is ranking instead of the dedicated sector/service page — strengthen that page's title + internal links so it wins. Watch keywords climb month to month.</p>
  ${section('🔥 Striking distance (pos 8–20)', rows.filter(r=>r.tier.t.startsWith('🔥')))}
  ${section('⭐ Page-1 climb (pos 4–8)', rows.filter(r=>r.tier.t.startsWith('⭐')))}
  ${section('🌱 Building (pos 20–40)', rows.filter(r=>r.tier.t.startsWith('🌱')).slice(0,30))}
  <p style="font-size:11px;color:#a8a094;margin-top:22px">Google Search Console · ${START} → ${END} · JTE keyword tracker. Data lags ~2 days.</p>
  </div>`;
  const r = await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${RESEND_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({from:'JTE Growth <alerts@stockkaki.com>',to,subject:`🎯 JTE keyword battle plan · ${rows.filter(r=>r.tier.t.startsWith('🔥')).length} in striking distance`,html})});
  const jr = await r.json();
  console.log(jr.id?`\n✉️  emailed ${to} (${jr.id})`:`\n✉️  email FAILED: ${JSON.stringify(jr)}`);
} else {
  console.log('\n(no RESEND_API_KEY — console only)');
}
