// Has the JTE website actually grown, and by how much?
//
// growth-report.mjs answers "how was last week". This answers the question that
// decides whether the work is worth paying for: take the whole history Search Console
// will give us, break it into months, and show the trend plainly — including if the
// answer is "it has not moved".
//
// Prints to stdout. Read it from the Actions log; it sends no email and changes
// nothing. Auth reuses the same service account as growth-report.mjs.

import { readFileSync } from 'node:fs';
import { createSign } from 'node:crypto';

const KEY = JSON.parse(readFileSync(new URL('./.ga-key.json', import.meta.url), 'utf8'));
const SITE = 'https://jte.com.sg/';

const b64url = (b) => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
async function token(scope) {
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64url(JSON.stringify({ iss: KEY.client_email, scope, aud: KEY.token_uri, iat: now, exp: now + 3600 }));
  const s = createSign('RSA-SHA256'); s.update(head + '.' + claim); s.end();
  const jwt = head + '.' + claim + '.' + b64url(s.sign(KEY.private_key));
  const tr = await (await fetch(KEY.token_uri, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }) })).json();
  if (!tr.access_token) throw new Error('token: ' + JSON.stringify(tr));
  return tr.access_token;
}

const tok = await token('https://www.googleapis.com/auth/webmasters.readonly');
const gsc = async (body) => {
  const r = await (await fetch(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(SITE)}/searchAnalytics/query`,
    { method: 'POST', headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json();
  if (r.error) throw new Error('gsc: ' + r.error.message);
  return r.rows || [];
};

const iso = (d) => d.toISOString().slice(0, 10);
const ago = (n) => { const d = new Date(); d.setUTCDate(d.getUTCDate() - n); return iso(d); };

// Search Console keeps ~16 months. Ask for all of it; we only get what exists.
const days = await gsc({ startDate: ago(480), endDate: ago(2), dimensions: ['date'], type: 'web', rowLimit: 500 });

if (!days.length) {
  console.log('No Search Console data at all for ' + SITE);
  console.log('Either the property was verified very recently, or the service account lost access.');
  process.exit(0);
}

days.sort((a, b) => a.keys[0].localeCompare(b.keys[0]));
const first = days[0].keys[0], last = days[days.length - 1].keys[0];
const span = Math.round((new Date(last) - new Date(first)) / 86400000);

console.log('='.repeat(66));
console.log('JTE WEBSITE — WHAT THE SEARCH DATA ACTUALLY SAYS');
console.log('='.repeat(66));
console.log(`Data available: ${first} to ${last}  (${days.length} days with data, ${span} day span)`);
if (span < 60) console.log('NOTE: under two months of history — treat any trend as early, not proven.');
console.log('');

// ---- by month -------------------------------------------------------------
const months = {};
for (const r of days) {
  const m = r.keys[0].slice(0, 7);
  months[m] ||= { clicks: 0, impressions: 0, days: 0, posSum: 0 };
  months[m].clicks += r.clicks || 0;
  months[m].impressions += r.impressions || 0;
  months[m].posSum += (r.position || 0) * (r.impressions || 0);
  months[m].days++;
}
console.log('BY MONTH');
console.log('month      days   impressions    clicks   CTR     avg position');
const keys = Object.keys(months).sort();
for (const m of keys) {
  const v = months[m];
  const ctr = v.impressions ? (v.clicks / v.impressions * 100) : 0;
  const pos = v.impressions ? (v.posSum / v.impressions) : 0;
  console.log(
    `${m}   ${String(v.days).padStart(4)}   ${String(v.impressions).padStart(11)}  ${String(v.clicks).padStart(8)}   ${ctr.toFixed(2).padStart(5)}%  ${pos.toFixed(1).padStart(12)}`
  );
}
console.log('');

// ---- first 28 days with data vs last 28 -----------------------------------
const sum = (rows) => rows.reduce((a, r) => ({
  clicks: a.clicks + (r.clicks || 0),
  impressions: a.impressions + (r.impressions || 0),
  posSum: a.posSum + (r.position || 0) * (r.impressions || 0),
}), { clicks: 0, impressions: 0, posSum: 0 });

if (days.length >= 56) {
  const a = sum(days.slice(0, 28)), b = sum(days.slice(-28));
  const pct = (from, to) => from ? `${to >= from ? '+' : ''}${Math.round((to - from) / from * 100)}%` : 'n/a';
  console.log('FIRST 28 DAYS OF DATA  vs  MOST RECENT 28 DAYS');
  console.log(`  impressions   ${String(a.impressions).padStart(8)}  ->  ${String(b.impressions).padStart(8)}   ${pct(a.impressions, b.impressions)}`);
  console.log(`  clicks        ${String(a.clicks).padStart(8)}  ->  ${String(b.clicks).padStart(8)}   ${pct(a.clicks, b.clicks)}`);
  const pa = a.impressions ? a.posSum / a.impressions : 0, pb = b.impressions ? b.posSum / b.impressions : 0;
  console.log(`  avg position  ${pa.toFixed(1).padStart(8)}  ->  ${pb.toFixed(1).padStart(8)}   ${pb < pa ? 'better' : pb > pa ? 'worse' : 'flat'}`);
  console.log('');
} else {
  console.log(`Only ${days.length} days of data — not enough for a fair 28-vs-28 comparison yet.\n`);
}

// ---- how many pages actually earn anything --------------------------------
const pages28 = await gsc({ startDate: ago(30), endDate: ago(2), dimensions: ['page'], type: 'web', rowLimit: 1000 });
const withClicks = pages28.filter((p) => (p.clicks || 0) > 0).length;
console.log('LAST 28 DAYS — PAGE LEVEL');
console.log(`  pages appearing in search : ${pages28.length}`);
console.log(`  pages that got a click    : ${withClicks}`);
console.log('  top pages by clicks:');
pages28.sort((x, y) => (y.clicks || 0) - (x.clicks || 0)).slice(0, 8).forEach((p) => {
  console.log(`    ${String(p.clicks).padStart(4)} clicks  ${String(p.impressions).padStart(6)} impr  ${p.keys[0].replace('https://jte.com.sg', '')}`);
});
console.log('');

const q28 = await gsc({ startDate: ago(30), endDate: ago(2), dimensions: ['query'], type: 'web', rowLimit: 1000 });
console.log('LAST 28 DAYS — QUERIES');
console.log(`  distinct queries the site appeared for : ${q28.length}`);
console.log(`  queries that produced a click          : ${q28.filter((q) => (q.clicks || 0) > 0).length}`);
console.log('  top queries by clicks:');
q28.sort((x, y) => (y.clicks || 0) - (x.clicks || 0)).slice(0, 10).forEach((q) => {
  console.log(`    ${String(q.clicks).padStart(4)} clicks  ${String(q.impressions).padStart(6)} impr  pos ${(q.position || 0).toFixed(1).padStart(5)}  "${q.keys[0]}"`);
});
console.log('');
console.log('='.repeat(66));
console.log('Read honestly: impressions rising = being found more. Clicks rising =');
console.log('the listing is worth clicking. Position falling = ranking higher.');
console.log('If impressions are up but clicks are flat, the titles are the problem,');
console.log('not the content.');
console.log('='.repeat(66));
