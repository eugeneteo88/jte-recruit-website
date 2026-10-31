// JTE Growth Engine — orchestrator. Runs the roles and writes content-ops/brief.json
// (the "This week" CEO brief rendered on /seo). Scaffold v1 produces the weekly
// brief (metrics + trend hooks + recommended topics). Article auto-drafting and
// LinkedIn repurposing are the next increments — they slot in where marked.
//
// Safe to run with no key: it writes a brief from the dashboard metrics alone and
// notes that the planning/writing roles are dormant until OPENAI_API_KEY is set.
//   node content-ops/run.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { hasKey, ask, askJSON, lastCitations } from './llm.mjs';
import { buildArticle } from './build-article.mjs';
import { makeHero, pickBg } from '../scripts/hero-graphic.mjs';
import { makeGraphic } from '../scripts/graphic.mjs';

const read = (p, fb) => { try { return JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8')); } catch { return fb; } };
// Models sometimes wrap the array in an object ({hooks:[...]}) — coerce to a bare array.
const toArr = (x) => Array.isArray(x) ? x : (x && (x.hooks || x.items || x.trends || x.topics || x.recommended || x.results)) || [];
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
    leads: metrics?.leads ?? null,
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
    brief.trends = toArr(await askJSON({
      tier: 'flagship', web: true, maxTokens: 1200,
      system: 'You scout timely topics for a Singapore recruitment agency (JTE) that writes for EMPLOYERS. Only return items that are genuinely recent/timely and verifiable.',
      user: `Today is ${today}. Find 4-5 timely Singapore hiring/employment hooks from the last few weeks (MOM/policy changes, grants, sector hiring surges, seasonal patterns, competitor moves by Randstad/Manpower/Links/Michael Page). For each return {hook, why_now, source_url, source_name, confidence:"verified"|"trend"}. source_url MUST be the exact full https:// URL of the page you found (copied from your search results), never a description; source_name is the publisher + page title. No nationality-based angles.`,
    }));
    // Keep only real links: use the model's URL if it is one, else the best-matching
    // web_search citation, else drop the link (the dashboard then offers a search instead).
    const cites = lastCitations();
    const words = (t) => new Set(String(t || '').toLowerCase().match(/[a-z0-9]{3,}/g) || []);
    for (const t of brief.trends) {
      const raw = String(t.source_url || '').trim();
      if (/^https?:\/\//.test(raw)) continue;
      if (!t.source_name) t.source_name = raw;
      const want = words(raw + ' ' + t.hook);
      let best = null, score = 0;
      for (const c of cites) { const n = [...words(c.title + ' ' + c.url)].filter((w) => want.has(w)).length; if (n > score) { score = n; best = c; } }
      t.source_url = best && score >= 2 ? best.url : '';
    }
  } catch (e) { brief.notes += ` [trend role skipped: ${e.message}]`; }

  // Role 3 — content planner: pick the next topics not already covered
  try {
    const strike = (metrics.keywords || []).map((k) => `${k.term} (pos ${k.position})`).join('; ');
    brief.recommended = toArr(await askJSON({
      tier: 'flagship', maxTokens: 1200,
      system: 'You are the content planner for JTE Recruit. Recommend the next employer-intent articles to write. Problem-led, never job-scope explainers. Avoid topics already covered. RIGHT NOW the priority is our flagship offer: we run payroll FREE for the first year for employers in Singapore — startups, overseas companies setting up a sales/support office, and established businesses alike (see /free-payroll-singapore/). Lead most recommendations with payroll / employer-of-record / "who should outsource payroll" / "hiring in Singapore without your own entity" angles, from many different directions so the cluster can run for a long time. Also deepen the sector hiring clusters (engineering, IT, healthcare, manufacturing, logistics, commercial).',
      user: `Already-covered article titles: ${titles}\n\nStriking-distance keywords (near page 1): ${strike}\n\nTimely hooks: ${JSON.stringify(brief.trends)}\n\nRecommend the next 3 articles — mostly fresh payroll / employer-of-record angles that funnel to our free payroll page, plus sector-cluster depth where it fits. Nothing we've already covered. For each return {title, angle, target_keyword, why, timely:true|false}.`,
    }));
  } catch (e) { brief.notes += ` [planner role skipped: ${e.message}]`; }

  // Roles 4-7 — writer -> fact-check/fairness -> build -> LinkedIn. All drafts stay HELD.
  const N = Number(process.env.WRITE_N || 2);
  const existing = new Set(posts.map((p) => p.slug));
  const slugList = posts.map((p) => p.slug).join(', ');
  let addDate = (posts.map((p) => p.date).filter(Boolean).sort().pop()) || today;
  const nextDate = () => { const d = new Date(addDate + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + 3); addDate = d.toISOString().slice(0, 10); return addDate; };

  for (const topic of (brief.recommended || []).slice(0, N)) {
    try {
      const content = await askJSON({
        tier: 'flagship', web: true, maxTokens: 5000,
        system: `You are Eugene Teo, co-founder of JTE Recruit, writing a Field Notes article for EMPLOYERS. Write in MY voice: first-person, friendly, casual, simple plain English — the way I'd explain it to a mate over coffee. Short sentences. Direct and honest, with a bit of personality, NOT corporate or over-polished. Simple everyday words, not big English. NO Singlish slang (no lah/lor/kiasu/sian/blur/tahan). Open on the employer's PROBLEM — never a definition or a job-scope explainer. No nationality or local-vs-foreigner framing (TAFEP landmine). Lean on experience and judgement, which needs no citation. Do NOT state ANY specific statistic, salary, percentage, grant amount, or date UNLESS it appears verbatim in the provided verified facts; when you use one, keep it exact and add "confirm current figures with MOM / the relevant authority". When in doubt, go qualitative instead of inventing a number. Where it fits naturally, point readers to our free payroll for employers at /free-payroll-singapore/ (we run payroll free for the first year).`,
        user: `Write the article. Topic: ${topic.title}. Angle: ${topic.angle}. Target keyword: ${topic.target_keyword}.
Verified facts/sources you may use for hard figures: ${JSON.stringify(brief.trends)}.
Existing JTE articles you may cross-link (use 2-3, EXACT slugs, where natural): ${slugList}.
You may ALSO link to these conversion pages where they fit the argument: "/free-payroll-singapore/" (our free payroll offer — the main thing we want readers to find) and "/cost-of-vacancy/" (the cost calculator).
Return ONLY JSON: {slug (kebab-case, new), title, metaDescription (<=160 chars), h1 (problem-led), heroAlt, lead:[1-2 intro paragraphs], sections:[{h2, paras:[2-4 paragraphs]} x5-7], callout (one-sentence takeaway), faq:[{q,a} x6], hero:{eyebrow, headline (<=4 words), accent (<=3 words), subtitle}, graphic:{type:"list"|"steps", title, items:[3-5 short]}, crossLinks:[{anchor (an exact phrase in your text), slug} x2-3]}`,
      });
      if (!content || !content.slug || existing.has(content.slug)) { brief.notes += ` [writer skipped ${topic.title}: dup/invalid slug]`; continue; }

      let factcheck = { pass: true, issues: [] };
      try {
        factcheck = await askJSON({
          tier: 'flagship', web: true, maxTokens: 1200,
          system: 'You are a strict fact-checker and fairness reviewer for JTE Recruit. Be adversarial.',
          user: `Review this article content. Flag: any hard figure/claim NOT supported by a primary source; any Singlish; any nationality/local-vs-foreigner framing; any logic error. Return {pass:boolean, issues:[strings]}. Content: ${JSON.stringify(content)}`,
        });
      } catch {}

      const date = nextDate();
      buildArticle(content, date);
      const dir = `blog/${content.slug}/`;
      try { const bg = pickBg('general', content.slug) || pickBg('tech', content.slug); await makeHero({ ...(content.hero || {}), bg, out: dir + 'hero.jpg' }); } catch (e) { brief.notes += ` [hero ${content.slug}: ${e.message}]`; }
      try { await makeGraphic({ type: content.graphic?.type || 'list', eyebrow: 'In brief', title: content.graphic?.title || content.title, items: content.graphic?.items || [], out: dir + 'graphic-1.jpg' }); } catch (e) { brief.notes += ` [graphic ${content.slug}: ${e.message}]`; }

      posts.push({ slug: content.slug, title: content.title, tag: 'Employer Guide', excerpt: content.metaDescription, author: 'Eugene Teo', date, readTime: '6 min read', icon: 'file-text', draft: true });
      existing.add(content.slug);
      brief.drafts.push({ slug: content.slug, title: content.title, preview: `https://jte.com.sg/blog/${content.slug}/`, factcheck });

      try {
        const li = await askJSON({
          tier: 'mini', maxTokens: 800,
          system: "Write LinkedIn posts in Eugene's first-person voice. Plain English, hook first, no Singlish, minimal emojis.",
          user: `Two LinkedIn posts promoting "${content.title}" (link https://jte.com.sg/blog/${content.slug}/?utm_source=linkedin&utm_medium=social&utm_campaign=growth_engine). Return {company, profile}. Each ~90 words, end with the link + 3 hashtags.`,
        });
        brief.linkedin.push({ slug: content.slug, company: li.company, profile: li.profile });
      } catch {}
    } catch (e) { brief.notes += ` [writer error ${topic.title}: ${e.message}]`; }
  }
  writeFileSync(new URL('../blog/posts.json', import.meta.url), JSON.stringify(posts, null, 2) + '\n');
}

await roles().catch((e) => { brief.notes += ` [engine error: ${e.message}]`; });
writeFileSync(new URL('../seo/brief.json', import.meta.url), JSON.stringify(brief, null, 2) + '\n');
console.log(`brief.json written — ${brief.recommended.length} topic(s), ${brief.trends.length} trend(s), key:${hasKey()}`);
