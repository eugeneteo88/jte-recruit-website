// JTE website daily growth report — Search Console indexing/queries (+ optional GA organic).
//   node growth-report.mjs           → print to console
//   (with RESEND_API_KEY set)        → also email REPORT_TO (default eugeneteo1988@gmail.com)
//
// Auth: reuses the Google service account in .ga-key.json (written from the
// GA_KEY_JSON secret at CI time). That account already has Search Console access
// to https://jte.com.sg/. The GA "organic" card only appears if GA_PROPERTY is set
// (JTE's numeric GA4 property id) AND the same service account has Viewer on it.
import { readFileSync } from 'node:fs';
import { createSign } from 'node:crypto';

const KEY = JSON.parse(readFileSync(new URL('./.ga-key.json', import.meta.url), 'utf8'));
const SITE = 'https://jte.com.sg/';                     // GSC property (URL-prefix)
const HOST = 'https://jte.com.sg';
const GA_PROPERTY = process.env.GA_PROPERTY || '';      // numeric GA4 id, optional
const { RESEND_API_KEY, REPORT_TO } = process.env;
const REPORT_FROM = process.env.REPORT_FROM || 'JTE · Growth <alerts@stockkaki.com>';

const b64url = (b) => Buffer.from(b).toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
async function token(scope){
  const now = Math.floor(Date.now()/1000);
  const head = b64url(JSON.stringify({alg:'RS256',typ:'JWT'}));
  const claim = b64url(JSON.stringify({iss:KEY.client_email,scope,aud:KEY.token_uri,iat:now,exp:now+3600}));
  const s = createSign('RSA-SHA256'); s.update(head+'.'+claim); s.end();
  const jwt = head+'.'+claim+'.'+b64url(s.sign(KEY.private_key));
  const tr = await (await fetch(KEY.token_uri,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:jwt})})).json();
  if(!tr.access_token) throw new Error('token: '+JSON.stringify(tr));
  return tr.access_token;
}
const iso = d => d.toISOString().slice(0,10);
const daysAgo = n => { const d=new Date(); d.setUTCDate(d.getUTCDate()-n); return iso(d); };
const n = x => Number(x||0);
// AI answer-engine referrer → friendly name (AEO)
const AI_RE = 'chatgpt|openai|perplexity|gemini|copilot|claude|you\\.com|poe\\.com|edgeservices|bard|mistral|deepseek|grok';
const AI_LABEL = s => { s=(s||'').toLowerCase();
  if(s.includes('chatgpt')||s.includes('openai')) return 'ChatGPT';
  if(s.includes('perplexity')) return 'Perplexity';
  if(s.includes('gemini')||s.includes('bard')) return 'Gemini';
  if(s.includes('copilot')||s.includes('edgeservices')) return 'Copilot';
  if(s.includes('claude')) return 'Claude';
  if(s.includes('deepseek')) return 'DeepSeek';
  if(s.includes('grok')) return 'Grok';
  if(s.includes('you.com')) return 'You.com';
  if(s.includes('poe')) return 'Poe';
  if(s.includes('mistral')) return 'Mistral';
  return s; };

// ---------- Google Search Console ----------
const gscTok = await token('https://www.googleapis.com/auth/webmasters.readonly');
const gsc = async (body) => {
  const r = await (await fetch(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(SITE)}/searchAnalytics/query`,{method:'POST',headers:{Authorization:'Bearer '+gscTok,'Content-Type':'application/json'},body:JSON.stringify(body)})).json();
  if(r.error) throw new Error('gsc: '+r.error.message); return r.rows||[];
};
const START=daysAgo(28), END=daysAgo(1);
const tot   = (await gsc({startDate:START,endDate:END,dimensions:[],type:'web'}))[0]||{};
const cur7  = (await gsc({startDate:daysAgo(7), endDate:daysAgo(1), dimensions:[],type:'web'}))[0]||{};
const prev7 = (await gsc({startDate:daysAgo(14),endDate:daysAgo(8), dimensions:[],type:'web'}))[0]||{};
const pages   = await gsc({startDate:START,endDate:END,dimensions:['page'],type:'web',rowLimit:1000});
const queries = await gsc({startDate:START,endDate:END,dimensions:['query'],type:'web',rowLimit:1000});
const topQ = await gsc({startDate:START,endDate:END,dimensions:['query'],type:'web',rowLimit:10});
const topP = await gsc({startDate:START,endDate:END,dimensions:['page'],type:'web',rowLimit:8});
const daily = await gsc({startDate:daysAgo(14),endDate:END,dimensions:['date'],type:'web'});

// Non-branded queries = real market discovery (strip anything containing "jte")
const nonBrand = queries.filter(r => !/jte/i.test(r.keys[0])).sort((a,b)=>n(b.impressions)-n(a.impressions)).slice(0,10);

let submitted='?';
try{
  const sm = await (await fetch(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(SITE)}/sitemaps`,{headers:{Authorization:'Bearer '+gscTok}})).json();
  submitted = (sm.sitemap||[]).reduce((a,s)=>a+(s.contents||[]).reduce((b,c)=>b+(+c.submitted||0),0),0) || (sm.sitemap?'listed':'none');
}catch{}

// ---------- Google Analytics (organic + AI referrals) — optional ----------
let orgCurS=null, orgCurU=0, orgPrevS=0, orgDaily=[];
let aiEngines=[], aiTotS=0, aiTotU=0, aiCur7S=0, aiPrev7S=0;
if (GA_PROPERTY) {
  try {
    const gaTok = await token('https://www.googleapis.com/auth/analytics.readonly');
    const ga = async (body)=>{const r=await(await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${GA_PROPERTY}:runReport`,{method:'POST',headers:{Authorization:'Bearer '+gaTok,'Content-Type':'application/json'},body:JSON.stringify(body)})).json(); if(r.error)throw new Error('ga: '+r.error.message); return r.rows||[];};
    const ORG={filter:{fieldName:'sessionDefaultChannelGroup',stringFilter:{value:'Organic Search'}}};
    orgDaily = await ga({dateRanges:[{startDate:'7daysAgo',endDate:'today'}],dimensions:[{name:'date'}],metrics:[{name:'sessions'}],dimensionFilter:ORG,orderBys:[{dimension:{dimensionName:'date'}}]});
    const orgCur = await ga({dateRanges:[{startDate:'7daysAgo',endDate:'today'}],dimensions:[],metrics:[{name:'sessions'},{name:'totalUsers'}],dimensionFilter:ORG});
    const orgPrev= await ga({dateRanges:[{startDate:'14daysAgo',endDate:'8daysAgo'}],dimensions:[],metrics:[{name:'sessions'}],dimensionFilter:ORG});
    orgCurS = orgCur[0]?n(orgCur[0].metricValues[0].value):0;
    orgCurU = orgCur[0]?n(orgCur[0].metricValues[1].value):0;
    orgPrevS= orgPrev[0]?n(orgPrev[0].metricValues[0].value):0;
    // AEO: sessions arriving from AI answer engines (ChatGPT / Perplexity / Gemini / …)
    const aiFilter={filter:{fieldName:'sessionSource',stringFilter:{matchType:'PARTIAL_REGEXP',value:AI_RE}}};
    const aiRows = await ga({dateRanges:[{startDate:START,endDate:END}],dimensions:[{name:'sessionSource'}],metrics:[{name:'sessions'},{name:'totalUsers'}],dimensionFilter:aiFilter,orderBys:[{metric:{metricName:'sessions'},desc:true}]});
    const eng={};
    for(const r of aiRows){ const name=AI_LABEL(r.dimensionValues[0].value); if(!eng[name]) eng[name]={s:0,u:0}; eng[name].s+=n(r.metricValues[0].value); eng[name].u+=n(r.metricValues[1].value); }
    aiEngines = Object.entries(eng).map(([name,v])=>({name,sess:v.s,users:v.u})).sort((a,b)=>b.sess-a.sess);
    aiTotS = aiEngines.reduce((a,b)=>a+b.sess,0);
    aiTotU = aiEngines.reduce((a,b)=>a+b.users,0);
    const aiC7 = await ga({dateRanges:[{startDate:daysAgo(7),endDate:END}],dimensions:[],metrics:[{name:'sessions'}],dimensionFilter:aiFilter});
    const aiP7 = await ga({dateRanges:[{startDate:daysAgo(14),endDate:daysAgo(8)}],dimensions:[],metrics:[{name:'sessions'}],dimensionFilter:aiFilter});
    aiCur7S = aiC7[0]?n(aiC7[0].metricValues[0].value):0;
    aiPrev7S= aiP7[0]?n(aiP7[0].metricValues[0].value):0;
  } catch(e){ console.error('GA skipped:', e.message); }
}

// ---------- deltas ----------
const delta = (c,p)=>{ c=n(c);p=n(p); const d=c-p; const arrow=d>0?'▲':d<0?'▼':'–'; return `${arrow}${d>0?'+':''}${d}`; };
const impΔ = delta(cur7.impressions,prev7.impressions);
const clkΔ = delta(cur7.clicks,prev7.clicks);
const orgΔ = orgCurS!==null ? delta(orgCurS,orgPrevS) : '–';

// ---------- console ----------
console.log('════════ JTE website · growth · '+iso(new Date())+' ════════');
console.log(`\n📈 SEARCH (Search Console 28d, ${START}→${END})`);
console.log(`   impressions ${n(tot.impressions)} · clicks ${n(tot.clicks)} · CTR ${(n(tot.ctr)*100).toFixed(1)}% · avg pos ${n(tot.position).toFixed(1)}`);
console.log(`   indexed & surfacing: ${pages.length} pages of ${submitted} submitted · ${queries.length} distinct queries`);
console.log(`   week-on-week: impressions ${impΔ} · clicks ${clkΔ}` + (orgCurS!==null?` · organic ${orgΔ}`:''));
console.log('\n🔎 TOP QUERIES'); topQ.forEach(r=>console.log(`   ${String(n(r.impressions)).padStart(4)} imp · ${n(r.clicks)} clk · pos ${n(r.position).toFixed(0).padStart(2)}  ${r.keys[0]}`));
console.log('\n🎯 NON-BRANDED (people who don\'t know JTE yet)'); nonBrand.forEach(r=>console.log(`   ${String(n(r.impressions)).padStart(4)} imp · pos ${n(r.position).toFixed(0).padStart(2)}  ${r.keys[0]}`));
console.log('\n📄 TOP PAGES');   topP.forEach(r=>console.log(`   ${String(n(r.impressions)).padStart(4)} imp  ${r.keys[0].replace(HOST,'')||'/'}`));
if(orgCurS!==null){ console.log('\n🌱 ORGANIC (GA 7d)  '+orgCurS+' sess · '+orgCurU+' users'); orgDaily.forEach(r=>{const d=r.dimensionValues[0].value;console.log(`   ${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}  ${n(r.metricValues[0].value)} sess`);}); }
if(orgCurS!==null){ console.log('\n🤖 AI ANSWER ENGINES (AEO 28d)  '+aiTotS+' sess · '+aiTotU+' users · wk '+delta(aiCur7S,aiPrev7S)); aiEngines.length ? aiEngines.forEach(e=>console.log(`   ${String(e.sess).padStart(4)} sess · ${e.users} users  ${e.name}`)) : console.log('   (no AI-engine referrals yet)'); }
console.log('\n📅 IMPRESSIONS TREND (14d)'); daily.forEach(r=>console.log(`   ${r.keys[0]}  ${n(r.impressions)} imp / ${n(r.clicks)} clk`));

// ---------- email ----------
if(RESEND_API_KEY){
  const to = REPORT_TO || 'eugeneteo1988@gmail.com';
  const GOLD='#8C7350', DARK='#241B12', INK='#1c1a17', MUTE='#8a8175', CREAM='#FBF9F4', LINE='#e7e0d3';
  const chip=(v)=>`<b style="color:${String(v).startsWith('▲')?'#1a7f4b':String(v).startsWith('▼')?'#b23a44':'#777'}">${v}</b>`;
  const card=(label,val,sub)=>`<td style="padding:12px 16px;border:1px solid ${LINE};border-radius:12px;background:#fff"><div style="font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:${MUTE}">${label}</div><div style="font-size:26px;font-weight:700;color:${DARK};font-family:'Playfair Display',Georgia,serif">${val}</div><div style="font-size:12px;color:#6b6459">${sub}</div></td>`;
  const rowsQ = topQ.map(r=>`<tr><td style="padding:5px 10px">${r.keys[0].replace(/</g,'&lt;').slice(0,72)}</td><td style="padding:5px 10px;text-align:right;color:#6b6459;white-space:nowrap">${n(r.impressions)} imp</td><td style="padding:5px 10px;text-align:right;color:${GOLD};white-space:nowrap">pos ${n(r.position).toFixed(0)}</td></tr>`).join('');
  const rowsNB = nonBrand.length ? nonBrand.map(r=>`<tr><td style="padding:5px 10px">${r.keys[0].replace(/</g,'&lt;').slice(0,72)}</td><td style="padding:5px 10px;text-align:right;color:#6b6459;white-space:nowrap">${n(r.impressions)} imp</td><td style="padding:5px 10px;text-align:right;color:${GOLD};white-space:nowrap">pos ${n(r.position).toFixed(0)}</td></tr>`).join('') : `<tr><td style="padding:8px 10px;color:${MUTE}">—</td></tr>`;
  const rowsP = topP.map(r=>`<tr><td style="padding:5px 10px">${(r.keys[0].replace(HOST,'')||'/')}</td><td style="padding:5px 10px;text-align:right;color:#6b6459;white-space:nowrap">${n(r.impressions)} imp</td></tr>`).join('');
  const orgCard = orgCurS!==null ? card('Organic visits 7d',orgCurS+' sess',orgCurU+' users · '+orgΔ) : card('Sitemap','of '+submitted,'pages submitted');
  const aiRowsHTML = aiEngines.length ? aiEngines.map(e=>`<tr><td style="padding:5px 10px">${e.name}</td><td style="padding:5px 10px;text-align:right;color:#6b6459;white-space:nowrap">${e.sess} sess</td><td style="padding:5px 10px;text-align:right;color:#6b6459;white-space:nowrap">${e.users} users</td></tr>`).join('') : `<tr><td style="padding:9px 10px;color:${MUTE}">No AI-engine referrals yet — this is where ChatGPT / Perplexity / Gemini traffic will show as AEO grows.</td></tr>`;
  const aiSection = orgCurS!==null ? `<h3 style="font-family:'Playfair Display',Georgia,serif;font-size:16px;color:${DARK};margin:20px 4px 6px">🤖 Found via AI answer engines (AEO)</h3>
  <p style="font-size:12px;color:#6b6459;margin:0 4px 6px">People who arrived from an AI tool in the last 28 days${aiTotS?` — <b>${aiTotS}</b> sessions, ${aiTotU} users, week-on-week ${chip(delta(aiCur7S,aiPrev7S))}`:''}.</p>
  <table style="width:100%;border-collapse:collapse;font-size:13px;background:#fff;border:1px solid ${LINE};border-radius:8px;overflow:hidden">${aiRowsHTML}</table>` : '';
  const html=`<div style="max-width:620px;margin:0 auto;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:${INK};background:${CREAM};padding:24px">
  <div style="font-size:12px;color:${GOLD};letter-spacing:.14em;text-transform:uppercase;font-weight:600">JTE Recruit · website growth</div>
  <h1 style="font-family:'Playfair Display',Georgia,serif;font-size:24px;font-weight:700;color:${DARK};margin:4px 0 16px">Good morning, Eugene ☀️</h1>
  <table cellspacing="8" style="width:100%;border-collapse:separate"><tr>
    ${card('Impressions 28d',n(tot.impressions),'wk '+impΔ)}
    ${card('Pages surfacing',pages.length,'of '+submitted+' submitted')}
    ${orgCard}
  </tr></table>
  <p style="font-size:13px;color:#6b6459;margin:16px 4px">Clicks 28d: <b>${n(tot.clicks)}</b> · CTR ${(n(tot.ctr)*100).toFixed(1)}% · avg position <b>${n(tot.position).toFixed(1)}</b> · ${queries.length} distinct queries. Week-on-week: impressions ${chip(impΔ)}, clicks ${chip(clkΔ)}${orgCurS!==null?`, organic ${chip(orgΔ)}`:''}.</p>
  ${aiSection}
  <h3 style="font-family:'Playfair Display',Georgia,serif;font-size:16px;color:${DARK};margin:20px 4px 6px">🎯 Non-branded — people finding JTE who didn't search for us</h3>
  <table style="width:100%;border-collapse:collapse;font-size:13px;background:#fff;border:1px solid ${LINE};border-radius:8px;overflow:hidden">${rowsNB}</table>
  <h3 style="font-family:'Playfair Display',Georgia,serif;font-size:16px;color:${DARK};margin:20px 4px 6px">🔎 What people Googled to find you</h3>
  <table style="width:100%;border-collapse:collapse;font-size:13px;background:#fff;border:1px solid ${LINE};border-radius:8px;overflow:hidden">${rowsQ}</table>
  <h3 style="font-family:'Playfair Display',Georgia,serif;font-size:16px;color:${DARK};margin:20px 4px 6px">📄 Top pages in search</h3>
  <table style="width:100%;border-collapse:collapse;font-size:13px;background:#fff;border:1px solid ${LINE};border-radius:8px;overflow:hidden">${rowsP}</table>
  <p style="font-size:11px;color:#a8a094;margin-top:22px">Google Search Console${orgCurS!==null?' + Analytics':''} · ${START} → ${END} · your JTE website growth job. Search data lags ~2 days.</p>
  </div>`;
  const subj = `📈 JTE: ${n(tot.impressions)} impressions · ${pages.length} pages indexed · clicks ${clkΔ}`;
  const r = await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${RESEND_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({from:REPORT_FROM,to,subject:subj,html})});
  const jr = await r.json();
  console.log(jr.id?`\n✉️  emailed ${to} (${jr.id})`:`\n✉️  email FAILED: ${JSON.stringify(jr)}`);
} else {
  console.log('\n(no RESEND_API_KEY — console only)');
}
