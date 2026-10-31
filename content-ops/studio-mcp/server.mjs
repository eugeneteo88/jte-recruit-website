#!/usr/bin/env node
// JTE Content Studio — MCP server.
// Exposes the article visual + assembly toolbox as MCP tools so Claude (Desktop / Code /
// any MCP client) can compose Field Notes articles interactively and consistently.
// All generators are the same ones the site + engine use, so output matches the standard
// in content-ops/ARTICLE-DESIGN.md. Image generation is capped at US$20/month (per Eugene).
//
// Run:  GEMINI_API_KEY=... node content-ops/studio-mcp/server.mjs   (stdio transport)
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, '../../');           // repo root
const BLOG = join(REPO, 'blog');
const require = createRequire(import.meta.url);
let sharp; try { sharp = require('sharp'); } catch { sharp = createRequire('C:/Users/eugen/jte-website/package.json')('sharp'); }

// import the shared toolbox (same modules the site uses)
const anim = await import('../../scripts/anim-svg.mjs');
const { makeGraphic } = await import('../../scripts/graphic.mjs');
const { makeHero } = await import('../../scripts/hero-graphic.mjs');
const { geminiImage, hasGeminiKey } = await import('../../scripts/gemini-image.mjs');
const { buildArticle } = await import('../build-article.mjs');

const log = (...a) => console.error('[studio-mcp]', ...a);   // NEVER stdout (reserved for MCP)
const ok = (text) => ({ content: [{ type: 'text', text: typeof text === 'string' ? text : JSON.stringify(text, null, 2) }] });
const err = (text) => ({ content: [{ type: 'text', text }], isError: true });

// ---- spend ledger (programmatic cap; monthly, auto-resets) ----
const SPEND = join(REPO, 'content-ops', 'image-spend.json');
const CAP = 20;
const month = () => new Date().toISOString().slice(0, 7);
const today = () => new Date().toISOString().slice(0, 10);
function loadSpend() { try { const j = JSON.parse(readFileSync(SPEND, 'utf8')); if (j.month !== month()) return { month: month(), totalUsd: 0, entries: [] }; return j; } catch { return { month: month(), totalUsd: 0, entries: [] }; } }
function record(cause, images, costUsd) { const s = loadSpend(); s.totalUsd = Math.round((s.totalUsd + costUsd) * 100) / 100; s.entries.push({ date: today(), cause, images, costUsd }); writeFileSync(SPEND, JSON.stringify(s, null, 2) + '\n'); return s; }
function assertCap(costUsd, override) { const s = loadSpend(); if (!override && s.totalUsd + costUsd > CAP) throw new Error(`Monthly image cap US$${CAP} would be exceeded (spent $${s.totalUsd} this month, this run +$${costUsd}). Confirm with Eugene and pass override:true (case-by-case per the spend rule).`); }

async function genPhoto(prompt, outPath, { resize } = {}) {
  if (!hasGeminiKey()) throw new Error('GEMINI_API_KEY not set in the server environment');
  const tmp = join(tmpdir(), `studio-${Date.now()}-${Math.round(performance.now())}.png`);
  await geminiImage({ prompt, out: tmp });
  if (resize) await sharp(tmp).resize(resize[0], resize[1], { fit: 'cover', position: 'centre' }).jpeg({ quality: 84 }).toFile(outPath);
  return tmp;
}

const server = new McpServer({ name: 'jte-content-studio', version: '0.1.0' });

server.registerTool('design_reference', { title: 'Design reference', description: 'Return the JTE Field Notes article design standard (voice, visual mix, toolbox, dates, spend cap). Read this first when composing an article.', inputSchema: {} },
  async () => { try { return ok(readFileSync(join(REPO, 'content-ops', 'ARTICLE-DESIGN.md'), 'utf8')); } catch (e) { return err(e.message); } });

server.registerTool('spend_status', { title: 'Image spend status', description: 'Current-month AI image spend vs the US$20 cap.', inputSchema: {} },
  async () => { const s = loadSpend(); return ok({ month: s.month, spentUsd: s.totalUsd, capUsd: CAP, remainingUsd: Math.round((CAP - s.totalUsd) * 100) / 100, runs: s.entries.length }); });

server.registerTool('make_animation', {
  title: 'Make animated graphic',
  description: 'Build a self-contained animated SVG data-graphic (free). Returns the SVG string to embed as a section media item {type:"animation", html:<svg>}. kind: bars | steps | trend | stat.',
  inputSchema: {
    kind: z.enum(['bars', 'steps', 'trend', 'stat']),
    title: z.string().optional(), subtitle: z.string().optional(),
    bars: z.array(z.object({ label: z.string(), val: z.number(), top: z.string().optional(), emphasis: z.boolean().optional() })).optional(),
    steps: z.array(z.string()).optional(),
    vals: z.array(z.number()).optional(), breakIndex: z.number().optional(), breakLabel: z.string().optional(),
    big: z.string().optional(), label2: z.string().optional(), sub: z.string().optional(),
  },
}, async (a) => {
  try {
    let svg;
    if (a.kind === 'bars') svg = anim.animBars({ title: a.title, subtitle: a.subtitle, bars: a.bars || [] });
    else if (a.kind === 'steps') svg = anim.animSteps({ title: a.title, subtitle: a.subtitle, steps: a.steps || [] });
    else if (a.kind === 'trend') svg = anim.animTrend({ title: a.title, subtitle: a.subtitle, vals: a.vals || [], breakIndex: a.breakIndex ?? null, breakLabel: a.breakLabel });
    else svg = anim.animStat({ title: a.title, big: a.big, label2: a.label2, sub: a.sub });
    return ok(svg);
  } catch (e) { return err(e.message); }
});

server.registerTool('make_graphic', {
  title: 'Make In-brief graphic',
  description: 'Render the cream, branded In-brief checklist as a JPG into an article folder (free). Dashes auto-removed.',
  inputSchema: { slug: z.string(), title: z.string(), items: z.array(z.string()).min(2).max(6), name: z.string().optional() },
}, async ({ slug, title, items, name }) => {
  try { const out = join(BLOG, slug, `${name || 'graphic-1'}.jpg`); mkdirSync(dirname(out), { recursive: true }); await makeGraphic({ type: 'list', eyebrow: 'In brief', title, items, out }); return ok(`wrote ${out}`); } catch (e) { return err(e.message); }
});

server.registerTool('generate_hero', {
  title: 'Generate branded hero',
  description: 'Generate a candid scene photo (Gemini, ~US$0.04, counts to cap) and composite the JTE branded overlay (headline + watermark) into blog/<slug>/hero.jpg. Use scene photos by default, not faces.',
  inputSchema: { slug: z.string(), prompt: z.string(), eyebrow: z.string(), headline: z.string(), accent: z.string().optional(), subtitle: z.string().optional(), override: z.boolean().optional() },
}, async ({ slug, prompt, eyebrow, headline, accent, subtitle, override }) => {
  try {
    assertCap(0.04, override);
    const out = join(BLOG, slug, 'hero.jpg'); mkdirSync(dirname(out), { recursive: true });
    const style = ' Candid documentary photography, natural light, authentic Singapore, NOT glossy stock, no artificial background blur, darker negative space on the LEFT third for text, no text or logos.';
    const tmp = await genPhoto(prompt + style, out);
    await makeHero({ eyebrow, headline, accent: accent || '', subtitle: subtitle || '', bg: tmp, out });
    record(`hero: ${slug}`, 1, 0.04);
    return ok(`wrote ${out} (spend this month: $${loadSpend().totalUsd})`);
  } catch (e) { return err(e.message); }
});

server.registerTool('generate_photo', {
  title: 'Generate inline photo',
  description: 'Generate a plain candid inline photo (Gemini, ~US$0.04, counts to cap), cropped 1600x900, into blog/<slug>/<name>.jpg. For emotional beats inside an article.',
  inputSchema: { slug: z.string(), name: z.string(), prompt: z.string(), override: z.boolean().optional() },
}, async ({ slug, name, prompt, override }) => {
  try {
    assertCap(0.04, override);
    const out = join(BLOG, slug, `${name}.jpg`); mkdirSync(dirname(out), { recursive: true });
    const style = ' Candid documentary photography, natural light, authentic Singapore, everything in sharp focus, no artificial background blur, not glossy.';
    await genPhoto(prompt + style, out, { resize: [1600, 900] });
    record(`photo: ${slug}/${name}`, 1, 0.04);
    return ok(`wrote ${out} (spend this month: $${loadSpend().totalUsd})`);
  } catch (e) { return err(e.message); }
});

server.registerTool('assemble_article', {
  title: 'Assemble article HTML',
  description: 'Deterministically build a Field Notes article from a content object (JSON string). Supports media[] per section ({type:"image"|"graphic"|"animation", src|html, alt, caption}) and autoGraphic:false. Em-dashes auto-removed. Writes blog/<slug>/index.html.',
  inputSchema: { contentJson: z.string(), date: z.string().optional() },
}, async ({ contentJson, date }) => {
  try { const c = JSON.parse(contentJson); const slug = buildArticle(c, date || today()); return ok(`assembled blog/${slug}/index.html`); } catch (e) { return err('assemble failed: ' + e.message); }
});

server.registerTool('upsert_post', {
  title: 'Upsert blog post entry',
  description: 'Add or update a post in blog/posts.json (single source of truth for dates/listing). Set updated to show the Updated/Published byline. draft:true holds it unpublished.',
  inputSchema: { slug: z.string(), title: z.string(), excerpt: z.string(), date: z.string(), tag: z.string().optional(), readTime: z.string().optional(), icon: z.string().optional(), draft: z.boolean().optional(), updated: z.string().optional() },
}, async (p) => {
  try {
    const f = join(BLOG, 'posts.json'); const posts = JSON.parse(readFileSync(f, 'utf8'));
    const entry = { slug: p.slug, title: p.title, tag: p.tag || 'Field Notes', excerpt: p.excerpt, author: 'Eugene Teo', date: p.date, readTime: p.readTime || '6 min read', icon: p.icon || 'file-text', draft: !!p.draft };
    if (p.updated) entry.updated = p.updated;
    const i = posts.findIndex((x) => x.slug === p.slug);
    if (i >= 0) posts[i] = { ...posts[i], ...entry }; else posts.push(entry);
    writeFileSync(f, JSON.stringify(posts, null, 2) + '\n');
    return ok(`${i >= 0 ? 'updated' : 'added'} post ${p.slug}`);
  } catch (e) { return err(e.message); }
});

server.registerTool('rebuild_site', {
  title: 'Rebuild + QA',
  description: 'Run build-blog (listing/sitemap/byline/related) then the QA scanner. Returns the QA summary — must be FAIL: 0 before publishing.',
  inputSchema: {},
}, async () => {
  try {
    const bb = execFileSync('node', ['scripts/build-blog.mjs'], { cwd: REPO, encoding: 'utf8' });
    const qa = execFileSync('node', ['scripts/qa-check.mjs'], { cwd: REPO, encoding: 'utf8' });
    const line = (qa.match(/Pages:[^\n]*/) || ['(no QA line)'])[0];
    const pend = (bb.match(/pending:[^\n]*/) || [''])[0];
    return ok(`${line}\n${pend}`.trim());
  } catch (e) { return err('rebuild failed: ' + (e.stdout || e.message)); }
});

await server.connect(new StdioServerTransport());
log('JTE Content Studio MCP server ready');
