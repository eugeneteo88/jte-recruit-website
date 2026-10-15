// CEO approval: un-hold a draft so it publishes. Driven by the "Approve draft"
// GitHub Action (workflow_dispatch). Removes the draft flag for one slug (and
// optionally sets its publish date); build-blog then indexes it on that date.
//   SLUG=<slug> [DATE=YYYY-MM-DD] node content-ops/approve.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const slug = (process.env.SLUG || '').trim();
const date = (process.env.DATE || '').trim();
if (!slug) { console.error('SLUG is required'); process.exit(1); }

const P = JSON.parse(readFileSync('blog/posts.json', 'utf8'));
const post = P.find((p) => p.slug === slug);
if (!post) { console.error(`slug not found in posts.json: ${slug}`); process.exit(1); }
if (!post.draft && !date) { console.log(`${slug} is already approved (not a draft) — nothing to do.`); process.exit(0); }

delete post.draft;
if (date) { if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { console.error('DATE must be YYYY-MM-DD'); process.exit(1); } post.date = date; }
writeFileSync('blog/posts.json', JSON.stringify(P, null, 2) + '\n');
console.log(`Approved + un-held: ${slug} — publishes ${post.date}`);
