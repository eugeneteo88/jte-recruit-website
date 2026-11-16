#!/usr/bin/env node
// GEO watch. Checks that AI crawlers can still reach jte.com.sg and writes the
// verdict to seo/geo.json for the /seo hub.
//
// Why this exists: in November 2026 Cloudflare's AI Crawl Control was set to
// Training: Disallow, and Bot Preference Sync prepended that into robots.txt as
// `Disallow: /` for ClaudeBot, GPTBot, Google-Extended and ~28 others. The repo's
// own robots.txt was clean the whole time, so nothing in the codebase showed it
// and it went unnoticed. The block is applied at the edge, above the repo, which
// means the only way to catch it is to fetch the live file. That is what this does.
//
// Never fails the build. A broken deploy helps nobody; a loud warning does.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';

const SITE = 'https://jte.com.sg';

// Crawlers worth knowing about, split by what losing them actually costs.
const WATCH = [
  // Answer and search bots. These are the ones earning referral traffic today,
  // so a block here is an emergency.
  { ua: 'Googlebot',        kind: 'search', why: 'Google search indexing' },
  { ua: 'Bingbot',          kind: 'search', why: 'Bing indexing, also feeds Copilot' },
  { ua: 'OAI-SearchBot',    kind: 'answer', why: 'ChatGPT search results' },
  { ua: 'ChatGPT-User',     kind: 'answer', why: 'ChatGPT fetching a page for a user' },
  { ua: 'PerplexityBot',    kind: 'answer', why: 'Perplexity answers' },
  { ua: 'Claude-SearchBot', kind: 'answer', why: 'Claude search results' },
  // Crawlers that also feed training. Losing these costs citations and model
  // familiarity rather than live traffic, so it is a warning, not an emergency.
  { ua: 'ClaudeBot',        kind: 'model',  why: 'Claude citing jte.com.sg' },
  { ua: 'GPTBot',           kind: 'model',  why: 'OpenAI crawl' },
  { ua: 'Google-Extended',  kind: 'model',  why: 'Gemini and AI Overviews grounding' },
];

// Minimal robots.txt evaluation: does this UA end up with `Disallow: /`?
// Handles the stacked `User-agent:` lines that Cloudflare's managed block uses.
function disallowsRoot(robots, ua) {
  const lines = robots.split('\n').map((l) => l.replace(/#.*$/, '').trim());
  let active = [];
  let collecting = false;
  const groups = [];
  for (const line of lines) {
    const m = /^user-agent:\s*(.+)$/i.exec(line);
    if (m) {
      if (collecting) { active = []; collecting = false; }
      active.push(m[1].trim());
      continue;
    }
    if (!line) continue;
    if (active.length) { collecting = true; groups.push({ agents: [...active], line }); }
  }
  const target = ua.toLowerCase();
  // A named group wins over the wildcard group, same as a real crawler would read it.
  const named = groups.filter((g) => g.agents.some((a) => a.toLowerCase() === target));
  const scope = named.length ? named : groups.filter((g) => g.agents.includes('*'));
  return scope.some((g) => /^disallow:\s*\/\s*$/i.test(g.line));
}

async function get(url) {
  try {
    const r = await fetch(url, { redirect: 'follow' });
    return { status: r.status, body: r.ok ? await r.text() : '' };
  } catch {
    // Node's fetch ignores HTTPS_PROXY, which some sandboxes require. curl
    // honours it and is always present, so fall back rather than report a
    // false "site unreachable".
    try {
      const { execFileSync } = await import('node:child_process');
      const out = execFileSync('curl', ['-sSL', '--max-time', '25', '-w', '\n%{http_code}', url],
        { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
      const cut = out.lastIndexOf('\n');
      const status = Number(out.slice(cut + 1).trim()) || 0;
      return { status, body: status >= 200 && status < 300 ? out.slice(0, cut) : '' };
    } catch (e2) {
      return { status: 0, body: '', error: String(e2.message || e2) };
    }
  }
}

const robotsRes = await get(`${SITE}/robots.txt`);
const llmsRes = await get(`${SITE}/llms.txt`);

const crawlers = robotsRes.status === 200
  ? WATCH.map((c) => ({ ...c, blocked: disallowsRoot(robotsRes.body, c.ua) }))
  : WATCH.map((c) => ({ ...c, blocked: null }));

const blocked = crawlers.filter((c) => c.blocked === true);
const criticalBlocked = blocked.filter((c) => c.kind !== 'model');

let status = 'ok';
if (robotsRes.status !== 200) status = 'unknown';
else if (criticalBlocked.length) status = 'critical';
else if (blocked.length) status = 'warn';

const out = {
  checkedAt: new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC',
  status,
  robotsStatus: robotsRes.status,
  robotsLines: robotsRes.body ? robotsRes.body.trim().split('\n').length : 0,
  // A managed block gets prepended above the repo's own file, so a sudden jump
  // in line count is the tell even if the UA names change.
  managedBlockLikely: robotsRes.body.toLowerCase().includes('cloudflare managed'),
  llms: { status: llmsRes.status, bytes: llmsRes.body.length },
  crawlers: crawlers.map(({ ua, kind, why, blocked }) => ({ ua, kind, why, blocked })),
  blocked: blocked.map((c) => c.ua),
};

mkdirSync('seo', { recursive: true });
writeFileSync('seo/geo.json', JSON.stringify(out, null, 2) + '\n');

const warn = (m) => console.log(`::warning title=GEO watch::${m}`);
console.log(`geo-watch: robots.txt ${robotsRes.status} (${out.robotsLines} lines), llms.txt ${llmsRes.status} (${out.llms.bytes} bytes)`);
if (status === 'critical') warn(`Search/answer crawlers BLOCKED: ${criticalBlocked.map((c) => c.ua).join(', ')}. Check Cloudflare AI Crawl Control.`);
else if (status === 'warn') warn(`AI crawlers blocked: ${blocked.map((c) => c.ua).join(', ')}. Cloudflare AI Crawler and Agent access policies -> Training.`);
else if (status === 'unknown') warn(`Could not fetch robots.txt (status ${robotsRes.status}).`);
else console.log('geo-watch: all watched crawlers allowed.');
if (out.managedBlockLikely) warn('robots.txt contains a Cloudflare managed block. The repo file is not what is being served.');
if (llmsRes.status !== 200) warn(`llms.txt is not reachable (status ${llmsRes.status}).`);
