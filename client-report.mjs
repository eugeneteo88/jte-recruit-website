// The monthly report a CLIENT reads.
//
// growth-report.mjs is for Eugene: what moved, what to fix, what to write. This is the
// other document — the one that goes to whoever is paying the monthly fee.
//
// WHY IT EXISTS. On a retainer the client sees nothing between results. The report is
// the only moment the money feels spent, and a retainer with no visible output is one
// that gets quietly cancelled in month four. It is not presentation; it is the product.
//
// THREE RULES, and they are what make it worth reading:
//   1. Say what was DONE. Fees are invisible without it.
//   2. Say what MOVED — including when nothing did. Everyone reports good months.
//      Reporting a flat one is what makes the good ones believable.
//   3. Separate brand from non-brand clicks. On this site roughly half of all clicks
//      are people searching the company by name. Counting those as SEO wins would be
//      flattering and false.
//
// Sends to REPORT_TO, which defaults to Eugene — NOT the client. He reads it, then
// forwards. A report that can email a client without a human seeing it first is one
// bad month away from an awkward conversation.
//
//   node client-report.mjs                 -> print to console
//   MONTH=2026-07 node client-report.mjs   -> a specific month
//   (with RESEND_API_KEY) also emails REPORT_TO

import { readFileSync } from 'node:fs';
import { createSign } from 'node:crypto';

const KEY = JSON.parse(readFileSync(new URL('./.ga-key.json', import.meta.url), 'utf8'));
const SITE = 'https://jte.com.sg/';
const CLIENT = process.env.CLIENT_NAME || 'JTE Recruit';
const { RESEND_API_KEY } = process.env;
const REPORT_TO = process.env.REPORT_TO || 'eugeneteo1988@gmail.com';
const REPORT_FROM = process.env.REPORT_FROM || 'HeyAda <alerts@stockkaki.com>';

const b64url = (b) => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
async function token(scope) {
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64url(JSON.stringify({ iss: KEY.client_email, scope, aud: KEY.token_uri, iat: now, exp: now + 3600 }));
  const s = createSign('RSA-SHA256'); s.update(head + '.' + claim); s.end();
  const jwt = `${head}.${claim}.${b64url(s.sign(KEY.private_key))}`;
  const tr = await (await fetch(KEY.token_uri, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }) })).json();
  if (!tr.access_token) throw new Error(`token: ${JSON.stringify(tr)}`);
  return tr.access_token;
}
const tok = await token('https://www.googleapis.com/auth/webmasters.readonly');
const gsc = async (body) => {
  const r = await (await fetch(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(SITE)}/searchAnalytics/query`,
    { method: 'POST', headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json();
  if (r.error) throw new Error(`gsc: ${r.error.message}`);
  return r.rows || [];
};

// ---- period ---------------------------------------------------------------
// Default to the last COMPLETE month. A part-month compared against a whole one
// always looks like a collapse, and that is the fastest way to lose a client's trust
// in a report they cannot audit.
const iso = (d) => d.toISOString().slice(0, 10);
const now = new Date();
let y, m;
if (process.env.MONTH) { [y, m] = process.env.MONTH.split('-').map(Number); }
else { const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)); y = d.getUTCFullYear(); m = d.getUTCMonth() + 1; }
const start = new Date(Date.UTC(y, m - 1, 1));
const end = new Date(Date.UTC(y, m, 0));
const pStart = new Date(Date.UTC(y, m - 2, 1));
const pEnd = new Date(Date.UTC(y, m - 1, 0));

const MON = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const label = `${MON[m - 1]} ${y}`;
const prevLabel = `${MON[(m + 10) % 12]}`;

const totals = async (a, b) => {
  const r = (await gsc({ startDate: iso(a), endDate: iso(b), dimensions: [], type: 'web' }))[0] || {};
  return { clicks: r.clicks || 0, impressions: r.impressions || 0, position: r.position || 0 };
};
const cur = await totals(start, end);
const prev = await totals(pStart, pEnd);

// ---- brand vs the rest ----------------------------------------------------
// The distinction that keeps this honest.
const BRAND = /jte/i;
const queries = await gsc({ startDate: iso(start), endDate: iso(end), dimensions: ['query'], type: 'web', rowLimit: 1000 });
const brandClicks = queries.filter((q) => BRAND.test(q.keys[0])).reduce((n, q) => n + (q.clicks || 0), 0);
const nonBrand = queries.filter((q) => !BRAND.test(q.keys[0]));
const nonBrandClicks = nonBrand.reduce((n, q) => n + (q.clicks || 0), 0);
const topNonBrand = nonBrand.sort((a, b) => (b.clicks || 0) - (a.clicks || 0)).slice(0, 6);

const pages = await gsc({ startDate: iso(start), endDate: iso(end), dimensions: ['page'], type: 'web', rowLimit: 500 });
const topPages = pages.sort((a, b) => (b.clicks || 0) - (a.clicks || 0)).slice(0, 5);

// ---- what was actually done ----------------------------------------------
// Read from the site's own publishing data, so this section fills itself in. A report
// where "what we did" is typed by hand is a report that stops being sent.
let published = [];
try {
  const posts = JSON.parse(readFileSync(new URL('./blog/posts.json', import.meta.url), 'utf8'));
  const arr = Array.isArray(posts) ? posts : (posts.posts || []);
  published = arr.filter((p) => p.date && p.date >= iso(start) && p.date <= iso(end));
} catch { /* no posts file — section is simply omitted */ }

// ---- say it plainly -------------------------------------------------------
// "No previous month at all" is NOT the same as "no change". Running this on July
// produced "a steady month" when June simply had no data — reassuring, and false.
// A client cannot audit that, which is exactly why it has to be right.
const hasBaseline = prev.impressions > 0;
const pct = (from, to) => (from ? Math.round(((to - from) / from) * 100) : null);
const dImp = pct(prev.impressions, cur.impressions);
const dClk = pct(prev.clicks, cur.clicks);
const posMoved = prev.position && cur.position ? prev.position - cur.position : 0;   // positive = improved

const n = (x) => Number(x || 0).toLocaleString();
const arrow = (d) => (!hasBaseline ? 'no prior month' : d === null ? '' : d > 0 ? `up ${d}%` : d < 0 ? `down ${Math.abs(d)}%` : 'flat');

// The headline is written from the data, including when the data is disappointing —
// and including when there is not enough of it to say anything at all.
let headline;
if (!hasBaseline) headline = `This is the first month with search data to report on, so there is nothing yet to compare it against. Next month will show a direction.`;
else if (dImp !== null && dImp > 10 && dClk !== null && dClk > 10) headline = `A good month — more people saw ${CLIENT}, and more of them clicked.`;
else if (dImp !== null && dImp > 10 && (dClk === null || dClk <= 0)) headline = `More people saw ${CLIENT} this month, but not more clicked. That is the thing to work on next.`;
else if (dImp !== null && dImp < -10) headline = `A quieter month — ${CLIENT} appeared less often in search than in ${prevLabel}.`;
else headline = `A steady month. Nothing moved sharply in either direction.`;

const row = (l, v, d) => `<tr><td style="padding:9px 0;border-bottom:1px solid #e2e4eb">${l}</td><td style="padding:9px 0;border-bottom:1px solid #e2e4eb;text-align:right;font-weight:700">${v}</td><td style="padding:9px 0 9px 14px;border-bottom:1px solid #e2e4eb;text-align:right;color:#666c7a;font-size:14px">${d}</td></tr>`;

const html = `<div style="margin:0;padding:0;background:#f5f6f9">
<div style="max-width:620px;margin:0 auto;padding:28px 22px;font:16px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Roboto,Helvetica,Arial,sans-serif;color:#22252e;letter-spacing:-.015em">
  <p style="margin:0 0 22px;font-size:14px;color:#666c7a">HeyAda · ${CLIENT} · ${label}</p>
  <h1 style="margin:0 0 12px;font-size:24px;line-height:1.25;letter-spacing:-.03em">Your website, this month</h1>
  <p style="margin:0 0 22px;font-size:17px">${headline}</p>

  <table style="width:100%;border-collapse:collapse;margin:0 0 8px">
    ${row('Times you appeared in search', n(cur.impressions), arrow(dImp))}
    ${row('Visits from search', n(cur.clicks), arrow(dClk))}
    ${row('Average position', cur.position.toFixed(1), !hasBaseline ? 'no prior month' : posMoved > 0.3 ? `improved by ${posMoved.toFixed(1)}` : posMoved < -0.3 ? `slipped by ${Math.abs(posMoved).toFixed(1)}` : 'unchanged')}
  </table>
  <p style="margin:0 0 24px;font-size:13.5px;color:#666c7a">${hasBaseline ? `Compared with ${prevLabel}.` : `There is no search data for ${prevLabel}, so there is nothing to compare against this month.`} Average position is where you sit in Google's results — lower is better.</p>

  <h2 style="font-size:15px;letter-spacing:.06em;text-transform:uppercase;color:#666c7a;margin:26px 0 10px">People who already knew you, and people who didn't</h2>
  <p style="margin:0 0 8px"><b>${n(brandClicks)}</b> of this month's visits came from someone searching for ${CLIENT} by name. <b>${n(nonBrandClicks)}</b> came from people searching for what you do, who had not heard of you.</p>
  <p style="margin:0 0 18px;font-size:14.5px;color:#666c7a">The second number is the one this work is meant to grow. The first mostly reflects people who were coming anyway.</p>
  ${topNonBrand.length ? `<p style="margin:0 0 6px;font-size:14px;font-weight:700">What strangers searched to find you</p><ul style="margin:0 0 20px;padding-left:20px;font-size:15px">${topNonBrand.map((q) => `<li style="margin:3px 0">“${q.keys[0]}” — ${n(q.clicks)} visit${q.clicks === 1 ? '' : 's'}, position ${Number(q.position || 0).toFixed(0)}</li>`).join('')}</ul>` : ''}

  ${topPages.length ? `<h2 style="font-size:15px;letter-spacing:.06em;text-transform:uppercase;color:#666c7a;margin:26px 0 10px">Your best pages</h2><ul style="margin:0 0 20px;padding-left:20px;font-size:15px">${topPages.map((p) => `<li style="margin:3px 0">${p.keys[0].replace(SITE.replace(/\/$/, ''), '') || '/'} — ${n(p.clicks)} visits</li>`).join('')}</ul>` : ''}

  <h2 style="font-size:15px;letter-spacing:.06em;text-transform:uppercase;color:#666c7a;margin:26px 0 10px">What we did</h2>
  ${published.length
    ? `<ul style="margin:0 0 20px;padding-left:20px;font-size:15px">${published.map((p) => `<li style="margin:4px 0"><b>${p.title}</b><br><span style="color:#666c7a;font-size:14px">published ${p.date}</span></li>`).join('')}</ul>`
    : `<p style="margin:0 0 20px;font-size:15px;color:#666c7a">No new articles published this month — the work was on the existing pages and the technical side.</p>`}

  <div style="background:#edeef4;border-radius:12px;padding:16px 18px;margin:24px 0">
    <p style="margin:0;font-size:15px"><b>A note on timing.</b> Search results move slowly. A month is a data point, not a verdict — the shape only becomes clear over a quarter. If a month is flat, that is normal and not a reason to change course.</p>
  </div>

  <p style="margin:22px 0 0;font-size:15px">Anything here you want to dig into, just reply.</p>
  <p style="margin:14px 0 0;font-size:15px">— Eugene<br><span style="color:#666c7a">HeyAda · heyada.io</span></p>
  <p style="margin:26px 0 0;padding-top:14px;border-top:1px solid #e2e4eb;font-size:12px;color:#8a90a0">
    Figures from Google Search Console for ${iso(start)} to ${iso(end)}. Search Console data lags by two to three days.
  </p>
</div></div>`;

// ---- output ---------------------------------------------------------------
console.log(`\n${CLIENT} — ${label}`);
console.log('='.repeat(52));
console.log(headline);
console.log(`  impressions   ${n(prev.impressions)} -> ${n(cur.impressions)}   ${arrow(dImp)}`);
console.log(`  clicks        ${n(prev.clicks)} -> ${n(cur.clicks)}   ${arrow(dClk)}`);
console.log(`  position      ${prev.position.toFixed(1)} -> ${cur.position.toFixed(1)}`);
console.log(`  brand clicks  ${n(brandClicks)}   non-brand ${n(nonBrandClicks)}`);
console.log(`  published     ${published.length} article(s)`);
console.log('='.repeat(52));

if (RESEND_API_KEY) {
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: REPORT_FROM, to: [REPORT_TO], subject: `${CLIENT} — your website in ${label}`, html }),
  });
  console.log(r.ok ? `emailed to ${REPORT_TO} for review` : `email failed: ${r.status} ${await r.text()}`);
} else {
  console.log('RESEND_API_KEY not set — printed only, nothing sent.');
}
