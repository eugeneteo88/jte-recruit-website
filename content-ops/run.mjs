// JTE Growth Engine — orchestrator. Runs the roles and writes content-ops/brief.json
// (the "This week" CEO brief rendered on /seo). Scaffold v1 produces the weekly
// brief (metrics + trend hooks + recommended topics). Article auto-drafting and
// LinkedIn repurposing are the next increments — they slot in where marked.
//
// Safe to run with no key: it writes a brief from the dashboard metrics alone and
// notes that the planning/writing roles are dormant until OPENAI_API_KEY is set.
//   node content-ops/run.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { hasKey, ask, askJSON } from './llm.mjs';

const read = (p, fb) => { try { return JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8')); } catch { return fb; } };
const metrics = read('../seo/data.json', {});
const posts = read('../blog/posts.json', []);
const today = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10); // SGT
const published = posts.filter((p) => !p.draft && p.date <= today).map((p) => p.slug);
const titles = posts.map((p) => (p.title || '').replace(/&[a-z]+;/g, ' ')).join(' | ');

const brief = {
  updated: today,
  metrics: {
    impressions: metrics?.kpis?.impressions ?? null,
    clicks: metrics?.kpis?.clicks ?? null,
    position: metrics?.kpis?.position ?? null,
    wow: metrics?.wow ?? null,
    mover: metrics?.mover ?? null,
  },
  trends: [],       // role 2: trend & competitor watcher
  recommended: [],  // role 3: content planner
  drafts: [],       // roles 4-6: writer/fact-check/QA  (held drafts awaiting approval)
  linkedin: [],     // role 7: repurposer
  notes: '',
};

async function roles() {
  if (!hasKey()) {
    brief.notes = 'Planning + writing roles are dormant — set OPENAI_API_KEY (with a monthly cap) to activate the engine. This brief shows live metrics only.';
    return;
  }
  // Role 2 — trend & competitor watcher (web search)
  try {
    brief.trends = await askJSON({
      tier: 'flagship', web: true, maxTokens: 1200,
      system: 'You scout timely topics for a Singapore recruitment agency (JTE) that writes for EMPLOYERS. Only return items that are genuinely recent/timely and verifiable.',
      user: `Today is ${today}. Find 4-5 timely Singapore hiring/employment hooks from the last few weeks (MOM/policy changes, grants, sector hiring surges, seasonal patterns, competitor moves by Randstad/Manpower/Links/Michael Page). For each return {hook, why_now, source_url, confidence:"verified"|"trend"}. No nationality-based angles.`,
    });
  } catch (e) { brief.notes += ` [trend role skipped: ${e.message}]`; }

  // Role 3 — content planner: pick the next topics not already covered
  try {
    const strike = (metrics.keywords || []).map((k) => `${k.term} (pos ${k.position})`).join('; ');
    brief.recommended = await askJSON({
      tier: 'flagship', maxTokens: 1200,
      system: 'You are the content planner for JTE Recruit. Recommend the next employer-intent articles to write. Problem-led, never job-scope explainers. Avoid topics already covered.',
      user: `Already-covered article titles: ${titles}\n\nStriking-distance keywords (near page 1): ${strike}\n\nTimely hooks: ${JSON.stringify(brief.trends)}\n\nRecommend the next 2 articles. For each return {title, angle, target_keyword, why, timely:true|false}.`,
    });
  } catch (e) { brief.notes += ` [planner role skipped: ${e.message}]`; }

  // Roles 4-7 (writer -> fact-check -> QA -> LinkedIn): next build increment.
  // They will draft held articles from brief.recommended and populate brief.drafts/linkedin.
}

await roles().catch((e) => { brief.notes += ` [engine error: ${e.message}]`; });
writeFileSync(new URL('../seo/brief.json', import.meta.url), JSON.stringify(brief, null, 2) + '\n');
console.log(`brief.json written — ${brief.recommended.length} topic(s), ${brief.trends.length} trend(s), key:${hasKey()}`);
