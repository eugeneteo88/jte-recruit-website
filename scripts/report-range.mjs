#!/usr/bin/env node
/*
 * Pulls a full date range from Search Console and GA4 for a client report.
 *
 * seo-data.mjs only ever looks at the last 28 days, and the history archive it
 * writes was being discarded by the workflow until 25 Nov 2026, so there is no
 * long series in the repo to report from. This fetches the real thing.
 *
 * Run in CI, where .ga-key.json is written from the GA_KEY_JSON secret:
 *   FROM=2026-06-01 node scripts/report-range.mjs
 *
 * Writes seo/report-range.json. Never throws on a partial failure: whatever it
 * managed to fetch gets written, with a `missing` list saying what did not, so
 * a half-answer is visibly a half-answer rather than a silent gap.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createSign } from 'node:crypto';

const SITE = 'https://jte.com.sg/';
const GA_PROPERTY = process.env.GA_PROPERTY || '419040281';
const FROM = process.env.FROM || '2026-06-01';
const iso = (d) => d.toISOString().slice(0, 10);
const TO = process.env.TO || iso(new Date(Date.now() - 864e5));
const num = (x) => Number(x || 0);
const b64url = (b) => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

// Anything matching this is someone searching for JTE by name. Counting those
// as SEO wins would be flattering and false, so brand is split out everywhere.
const BRAND = /\bjte\b|jterecruit|jte recruit/i;

const KEY = JSON.parse(readFileSync(new URL('../.ga-key.json', import.meta.url), 'utf8'));
const missing = [];

async function token(scope) {
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64url(JSON.stringify({ iss: KEY.client_email, scope, aud: KEY.token_uri, iat: now, exp: now + 3600 }));
  const s = createSign('RSA-SHA256'); s.update(head + '.' + claim); s.end();
  const jwt = head + '.' + claim + '.' + b64url(s.sign(KEY.private_key));
  const tr = await (await fetch(KEY.token_uri, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
  })).json();
  if (!tr.access_token) throw new Error('token: ' + JSON.stringify(tr));
  return tr.access_token;
}

const out = { from: FROM, to: TO, generatedAt: new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC', missing };

// ---------------- Search Console ----------------
try {
  const tok = await token('https://www.googleapis.com/auth/webmasters.readonly');
  const gsc = async (body) => {
    const r = await (await fetch(
      `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(SITE)}/searchAnalytics/query`,
      { method: 'POST', headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
    )).json();
    if (r.error) throw new Error(r.error.message);
    return r.rows || [];
  };

  const totals = (await gsc({ startDate: FROM, endDate: TO, dimensions: [], type: 'web' }))[0] || {};
  out.totals = {
    impressions: Math.round(num(totals.impressions)),
    clicks: Math.round(num(totals.clicks)),
    ctr: +(num(totals.ctr) * 100).toFixed(2),
    position: +num(totals.position).toFixed(1),
  };

  // Month by month, so the report can show a shape rather than one number.
  const byDate = await gsc({ startDate: FROM, endDate: TO, dimensions: ['date'], type: 'web', rowLimit: 500 });
  const months = {};
  for (const r of byDate) {
    const m = r.keys[0].slice(0, 7);
    (months[m] ||= { month: m, impressions: 0, clicks: 0, posSum: 0, days: 0 });
    months[m].impressions += num(r.impressions);
    months[m].clicks += num(r.clicks);
    months[m].posSum += num(r.position);
    months[m].days++;
  }
  out.monthly = Object.values(months).sort((a, b) => a.month.localeCompare(b.month)).map((m) => ({
    month: m.month,
    impressions: Math.round(m.impressions),
    clicks: Math.round(m.clicks),
    days: m.days,
    // Mean of daily positions, NOT impression-weighted like the headline figure.
    // Keep it out of any client-facing chart; it is here for internal sanity only.
    dailyMeanPosition: +(m.posSum / Math.max(m.days, 1)).toFixed(1),
  }));

  // Daily series, so coverage is provable rather than assumed. A part-month at
  // either end would otherwise read as growth or as a drop.
  out.daily = byDate
    .map((r) => ({ date: r.keys[0], impressions: Math.round(num(r.impressions)), clicks: Math.round(num(r.clicks)) }))
    .sort((a, b) => a.date.localeCompare(b.date));
  out.coverage = {
    firstDate: out.daily[0]?.date || null,
    lastDate: out.daily[out.daily.length - 1]?.date || null,
    daysWithData: out.daily.length,
  };

  // Brand vs non-brand. The honest version of "how much did SEO do".
  const queries = await gsc({ startDate: FROM, endDate: TO, dimensions: ['query'], type: 'web', rowLimit: 5000 });
  const split = { brand: { clicks: 0, impressions: 0 }, nonBrand: { clicks: 0, impressions: 0 } };
  for (const r of queries) {
    const b = BRAND.test(r.keys[0]) ? split.brand : split.nonBrand;
    b.clicks += num(r.clicks); b.impressions += num(r.impressions);
  }
  for (const k of ['brand', 'nonBrand']) {
    split[k].clicks = Math.round(split[k].clicks);
    split[k].impressions = Math.round(split[k].impressions);
  }
  out.brandSplit = split;

  out.topQueries = queries
    .filter((r) => !BRAND.test(r.keys[0]))
    .sort((a, b) => num(b.clicks) - num(a.clicks)).slice(0, 15)
    .map((r) => ({ term: r.keys[0], clicks: Math.round(num(r.clicks)), impressions: Math.round(num(r.impressions)), position: +num(r.position).toFixed(1) }));

  const pages = await gsc({ startDate: FROM, endDate: TO, dimensions: ['page'], type: 'web', rowLimit: 500 });
  out.topPages = pages.sort((a, b) => num(b.clicks) - num(a.clicks)).slice(0, 12)
    .map((r) => ({ url: (r.keys[0] || '').replace(/^https?:\/\/[^/]+/, '') || '/', clicks: Math.round(num(r.clicks)), impressions: Math.round(num(r.impressions)), position: +num(r.position).toFixed(1) }));

  // First and last full month side by side, which is the growth claim.
  const full = out.monthly.filter((m) => m.month !== TO.slice(0, 7));
  if (full.length >= 2) out.firstVsLast = { first: full[0], last: full[full.length - 1] };
} catch (e) {
  missing.push('Search Console: ' + e.message);
}

// ---------------- GA4 ----------------
try {
  const tok = await token('https://www.googleapis.com/auth/analytics.readonly');
  const ga = async (body) => {
    const r = await (await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${GA_PROPERTY}:runReport`,
      { method: 'POST', headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json();
    if (r.error) throw new Error(r.error.message);
    return r.rows || [];
  };
  const range = [{ startDate: FROM, endDate: TO }];
  const leadFilter = { filter: { fieldName: 'eventName', stringFilter: { value: 'generate_lead' } } };

  const totalLeads = await ga({ dateRanges: range, metrics: [{ name: 'eventCount' }], dimensionFilter: leadFilter });
  out.leadsTotal = Math.round(num(totalLeads[0]?.metricValues[0]?.value));

  const byMonth = await ga({ dateRanges: range, dimensions: [{ name: 'yearMonth' }], metrics: [{ name: 'eventCount' }], dimensionFilter: leadFilter });
  out.leadsMonthly = byMonth.map((r) => ({
    month: r.dimensionValues[0].value.replace(/^(\d{4})(\d{2})$/, '$1-$2'),
    leads: Math.round(num(r.metricValues[0].value)),
  })).sort((a, b) => a.month.localeCompare(b.month));

  // Leads day by day, and sessions day by day. Together these say whether a
  // month with no leads had none, or whether GA4's retention window simply ate
  // the history: no sessions either means the data is gone, not that it was zero.
  const leadsByDate = await ga({ dateRanges: range, dimensions: [{ name: 'date' }], metrics: [{ name: 'eventCount' }], dimensionFilter: leadFilter });
  out.leadsDaily = leadsByDate
    .map((r) => ({ date: r.dimensionValues[0].value.replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3'), leads: Math.round(num(r.metricValues[0].value)) }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const sessDaily = await ga({ dateRanges: range, dimensions: [{ name: 'date' }], metrics: [{ name: 'sessions' }] });
  const sessDates = sessDaily
    .map((r) => r.dimensionValues[0].value.replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3'))
    .sort();
  out.ga4Coverage = {
    firstDate: sessDates[0] || null,
    lastDate: sessDates[sessDates.length - 1] || null,
    daysWithData: sessDates.length,
  };

  const byChannel = await ga({ dateRanges: range, dimensions: [{ name: 'sessionDefaultChannelGroup' }], metrics: [{ name: 'eventCount' }], dimensionFilter: leadFilter, orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }] });
  out.leadsByChannel = byChannel.map((r) => ({ channel: r.dimensionValues[0].value || '(unknown)', leads: Math.round(num(r.metricValues[0].value)) })).filter((x) => x.leads > 0);

  const sessions = await ga({ dateRanges: range, dimensions: [{ name: 'sessionDefaultChannelGroup' }], metrics: [{ name: 'sessions' }], orderBys: [{ metric: { metricName: 'sessions' }, desc: true }] });
  out.sessionsByChannel = sessions.map((r) => ({ channel: r.dimensionValues[0].value || '(unknown)', sessions: Math.round(num(r.metricValues[0].value)) })).filter((x) => x.sessions > 0);

  // AI assistants as a referral source, which is new enough to be worth naming.
  const AI = /chatgpt|openai|perplexity|gemini|copilot|claude|you\.com|poe\.com|bard|mistral|deepseek|grok/i;
  const refs = await ga({ dateRanges: range, dimensions: [{ name: 'sessionSource' }], metrics: [{ name: 'sessions' }], orderBys: [{ metric: { metricName: 'sessions' }, desc: true }] });
  const ai = refs.filter((r) => AI.test(r.dimensionValues[0].value || ''));
  out.aiSessions = {
    total: ai.reduce((a, r) => a + Math.round(num(r.metricValues[0].value)), 0),
    breakdown: ai.slice(0, 6).map((r) => ({ source: r.dimensionValues[0].value, sessions: Math.round(num(r.metricValues[0].value)) })),
  };
} catch (e) {
  missing.push('GA4: ' + e.message);
}

mkdirSync('seo', { recursive: true });
writeFileSync('seo/report-range.json', JSON.stringify(out, null, 2) + '\n');
console.log(`report-range: ${FROM} to ${TO}`);
if (out.totals) console.log(`  GSC  ${out.totals.impressions} impressions, ${out.totals.clicks} clicks, pos ${out.totals.position}`);
if (out.coverage) console.log(`  GSC  data from ${out.coverage.firstDate} to ${out.coverage.lastDate} (${out.coverage.daysWithData} days)`);
if (out.ga4Coverage) console.log(`  GA4  data from ${out.ga4Coverage.firstDate} to ${out.ga4Coverage.lastDate} (${out.ga4Coverage.daysWithData} days)`);
if (out.brandSplit) console.log(`  brand ${out.brandSplit.brand.clicks} clicks vs non-brand ${out.brandSplit.nonBrand.clicks}`);
if (out.leadsTotal != null) console.log(`  GA4  ${out.leadsTotal} leads, ${out.leadsMonthly?.length || 0} months`);
if (missing.length) { console.log('  MISSING:'); missing.forEach((m) => console.log('    ' + m)); }
