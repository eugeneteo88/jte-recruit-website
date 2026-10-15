// Generates seo/data.json for the private /seo dashboard — the live numbers.
// Reuses the Google service account in .ga-key.json (same one growth-report.mjs
// uses; it already has Search Console access to https://jte.com.sg/ and GA4
// Viewer on property 419040281). Run in CI after writing .ga-key.json from the
// GA_KEY_JSON secret:   node seo-data.mjs
//
// Resilient by design: if anything fails it logs and exits 0 WITHOUT touching
// seo/data.json, so the dashboard simply keeps its last good snapshot and the
// surrounding deploy never breaks.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createSign } from 'node:crypto';

const SITE = 'https://jte.com.sg/';
const GA_PROPERTY = process.env.GA_PROPERTY || '419040281';

const b64url = (b) => Buffer.from(b).toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const iso = (d) => d.toISOString().slice(0,10);
const daysAgo = (n) => { const d = new Date(); d.setUTCDate(d.getUTCDate()-n); return iso(d); };
const num = (x) => Number(x||0);

async function main(){
  const KEY = JSON.parse(readFileSync(new URL('./.ga-key.json', import.meta.url),'utf8'));
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

  const START = daysAgo(28), END = daysAgo(1);

  // ---- Google Search Console ----
  const gscTok = await token('https://www.googleapis.com/auth/webmasters.readonly');
  const gsc = async (body) => {
    const r = await (await fetch(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(SITE)}/searchAnalytics/query`,{method:'POST',headers:{Authorization:'Bearer '+gscTok,'Content-Type':'application/json'},body:JSON.stringify(body)})).json();
    if(r.error) throw new Error('gsc: '+r.error.message); return r.rows||[];
  };
  const tot     = (await gsc({startDate:START,endDate:END,dimensions:[],type:'web'}))[0] || {};
  const cur7    = (await gsc({startDate:daysAgo(7), endDate:daysAgo(1), dimensions:[],type:'web'}))[0] || {};
  const prev7   = (await gsc({startDate:daysAgo(14),endDate:daysAgo(8),dimensions:[],type:'web'}))[0] || {};
  const pctD = (c,p) => p ? Math.round((c-p)/p*100) : null;
  const wow = {
    impressions: pctD(num(cur7.impressions), num(prev7.impressions)),
    clicks: pctD(num(cur7.clicks), num(prev7.clicks)),
    position: (num(prev7.position) || num(cur7.position)) ? +(num(prev7.position) - num(cur7.position)).toFixed(1) : null,
  };
  const queries = await gsc({startDate:START,endDate:END,dimensions:['query'],type:'web',rowLimit:1000});
  const pages   = await gsc({startDate:START,endDate:END,dimensions:['page'],type:'web',rowLimit:1000});
  const daily   = await gsc({startDate:daysAgo(35),endDate:END,dimensions:['date'],type:'web'});

  // 5 weekly impression buckets, oldest -> newest
  const dmap = {}; for(const r of daily) dmap[r.keys[0]] = num(r.impressions);
  const trend = [];
  for(let w=4; w>=0; w--){ let s=0; for(let i=0;i<7;i++) s += dmap[daysAgo(1 + w*7 + i)]||0; trend.push(Math.round(s)); }
  const changePct = trend[0]>0 ? Math.round((trend[trend.length-1]-trend[0])/trend[0]*100) : 0;

  // non-branded, bottom of page 1 / top of page 2 — the winnable terms
  const keywords = queries
    .filter(r => !/jte/i.test(r.keys[0]))
    .map(r => ({term:r.keys[0], position:num(r.position), impressions:num(r.impressions)}))
    .filter(k => k.position>=8 && k.position<=45 && k.impressions>=20)
    .sort((a,b) => a.position-b.position || b.impressions-a.impressions)
    .slice(0,12)
    .map(k => ({term:k.term, position:Math.round(k.position), impressions:Math.round(k.impressions)}));

  // biggest week-over-week mover — non-branded queries with real volume
  let mover = null;
  try{
    const curQ  = await gsc({startDate:daysAgo(7), endDate:daysAgo(1), dimensions:['query'],type:'web',rowLimit:1000});
    const prevQ = await gsc({startDate:daysAgo(14),endDate:daysAgo(8),dimensions:['query'],type:'web',rowLimit:1000});
    const pm = {}; for(const r of prevQ) pm[r.keys[0]] = {pos:num(r.position), impr:num(r.impressions)};
    const cand = [];
    for(const r of curQ){
      const term = r.keys[0]; if(/jte/i.test(term)) continue;
      const prev = pm[term]; if(!prev) continue;
      const cur = {pos:num(r.position), impr:num(r.impressions)};
      if(cur.impr < 10) continue;
      cand.push({term, fromPosition:Math.round(prev.pos), toPosition:Math.round(cur.pos), deltaPosition:+(prev.pos-cur.pos).toFixed(1), imprChange:Math.round(cur.impr-prev.impr)});
    }
    const climbers = cand.filter(c=>c.deltaPosition>=1).sort((a,b)=> b.deltaPosition-a.deltaPosition || b.imprChange-a.imprChange);
    if(climbers.length) mover = {...climbers[0], kind:'climb'};
    else { const gain = cand.filter(c=>c.imprChange>0).sort((a,b)=>b.imprChange-a.imprChange); if(gain.length) mover = {...gain[0], kind:'impressions'}; }
  }catch(e){ console.error('mover skipped:', e.message); }

  let submitted = null;
  try{
    const sm = await (await fetch(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(SITE)}/sitemaps`,{headers:{Authorization:'Bearer '+gscTok}})).json();
    submitted = (sm.sitemap||[]).reduce((a,s)=>a+(s.contents||[]).reduce((b,c)=>b+(+c.submitted||0),0),0) || null;
  }catch{}

  // ---- Google Analytics (channels + AI answer engines + leads) ----
  let sources = [], ai = {total:0, breakdown:[]}, leads = null, calcViews = null;
  try{
    const gaTok = await token('https://www.googleapis.com/auth/analytics.readonly');
    const ga = async (body) => { const r = await (await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${GA_PROPERTY}:runReport`,{method:'POST',headers:{Authorization:'Bearer '+gaTok,'Content-Type':'application/json'},body:JSON.stringify(body)})).json(); if(r.error) throw new Error('ga: '+r.error.message); return r.rows||[]; };
    const ch = await ga({dateRanges:[{startDate:START,endDate:END}],dimensions:[{name:'sessionDefaultChannelGroup'}],metrics:[{name:'sessions'}],orderBys:[{metric:{metricName:'sessions'},desc:true}]});
    const chTot = ch.reduce((a,r)=>a+num(r.metricValues[0].value),0) || 1;
    sources = ch.map(r=>({name:r.dimensionValues[0].value||'(unknown)', pct:Math.round(num(r.metricValues[0].value)/chTot*100)})).filter(s=>s.pct>0).slice(0,6);
    const AI_RE = 'chatgpt|openai|perplexity|gemini|copilot|claude|you\\.com|poe\\.com|edgeservices|bard|mistral|deepseek|grok';
    const AI_LABEL = (s)=>{ s=(s||'').toLowerCase();
      if(s.includes('chatgpt')||s.includes('openai')) return 'ChatGPT';
      if(s.includes('perplexity')) return 'Perplexity';
      if(s.includes('gemini')||s.includes('bard')) return 'Gemini';
      if(s.includes('copilot')||s.includes('edgeservices')) return 'Copilot';
      if(s.includes('claude')) return 'Claude';
      if(s.includes('deepseek')) return 'DeepSeek';
      if(s.includes('grok')) return 'Grok';
      return s; };
    const aiRows = await ga({dateRanges:[{startDate:START,endDate:END}],dimensions:[{name:'sessionSource'}],metrics:[{name:'sessions'}],dimensionFilter:{filter:{fieldName:'sessionSource',stringFilter:{matchType:'PARTIAL_REGEXP',value:AI_RE}}},orderBys:[{metric:{metricName:'sessions'},desc:true}]});
    const eng = {}; for(const r of aiRows){ const nm=AI_LABEL(r.dimensionValues[0].value); eng[nm]=(eng[nm]||0)+num(r.metricValues[0].value); }
    const br = Object.entries(eng).map(([name,sessions])=>({name,sessions:Math.round(sessions)})).sort((a,b)=>b.sessions-a.sessions);
    ai = {total: br.reduce((a,b)=>a+b.sessions,0), breakdown: br};

    // leads = the real KPI — cost-of-vacancy calculator form submissions (+ page views)
    try{
      const leadRows = await ga({dateRanges:[{startDate:START,endDate:END}],dimensions:[{name:'eventName'}],metrics:[{name:'eventCount'}],dimensionFilter:{filter:{fieldName:'eventName',stringFilter:{value:'generate_lead'}}}});
      leads = leadRows.length ? Math.round(num(leadRows[0].metricValues[0].value)) : 0;
      const calcRows = await ga({dateRanges:[{startDate:START,endDate:END}],dimensions:[{name:'pagePath'}],metrics:[{name:'screenPageViews'}],dimensionFilter:{filter:{fieldName:'pagePath',stringFilter:{matchType:'CONTAINS',value:'cost-of-vacancy'}}}});
      calcViews = calcRows.reduce((a,r)=>a+num(r.metricValues[0].value),0);
      calcViews = Math.round(calcViews);
    }catch(e){ console.error('leads skipped:', e.message); }
  }catch(e){ console.error('GA skipped:', e.message); }

  const data = {
    updated: iso(new Date(Date.now()+288e5)),        // Singapore date
    source: 'Google Search Console + Analytics (auto)',
    window: 'last 28 days',
    kpis: {
      impressions: Math.round(num(tot.impressions)),
      clicks: Math.round(num(tot.clicks)),
      ctr: (num(tot.ctr)*100).toFixed(1)+'%',
      position: num(tot.position).toFixed(1),
    },
    trend,
    trendChange: (changePct>=0 ? '▲ +' : '▼ ') + Math.abs(changePct) + '% vs a month ago',
    wow,
    pagesSurfacing: pages.length,
    submitted,
    keywords,
    mover,
    sources,
    ai,
    leads,
    calcViews,
  };

  mkdirSync('seo', {recursive:true});
  writeFileSync('seo/data.json', JSON.stringify(data,null,2)+'\n');
  console.log('Wrote seo/data.json —', JSON.stringify(data.kpis), '| kw:'+keywords.length, 'src:'+sources.length, 'ai:'+ai.total);
}

main().catch(e => { console.error('seo-data skipped:', e.message); process.exit(0); });
