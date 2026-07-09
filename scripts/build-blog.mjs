#!/usr/bin/env node
/*
 * JTE blog auto-publisher.
 * Single source of truth: blog/posts.json (each post has a `date` = publish date).
 * Regenerates the card list in blog/index.html and the blog-post URLs in
 * sitemap.xml, including ONLY posts whose publish date has arrived (Singapore
 * time) and that are not marked draft. Deterministic + idempotent: safe to run
 * on every deploy and on a daily schedule.
 *
 * Usage: node scripts/build-blog.mjs [--date=YYYY-MM-DD]   (--date is for testing)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('..', import.meta.url);
const p = (rel) => fileURLToPath(new URL(rel, root));

const POSTS = JSON.parse(readFileSync(p('blog/posts.json'), 'utf8'));

// "Today" in Singapore (UTC+8), as YYYY-MM-DD. Override with --date= for tests.
const override = (process.argv.find(a => a.startsWith('--date=')) || '').slice(7);
const todayISO = override || new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const fmtDate = (iso) => { const [y,m,d] = iso.split('-').map(Number); return `${d} ${MONTHS[m-1]} ${y}`; };

// lucide-style icon paths, keyed by post.icon
const ICONS = {
  shield:  '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/>',
  coins:   '<circle cx="8" cy="8" r="6"/><path d="M18.09 10.37A6 6 0 1 1 10.34 18"/><path d="M7 6h1v4"/><path d="m16.71 13.88.7.71-2.82 2.82"/>',
  idcard:  '<rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/>',
  file:    '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" x2="8" y1="13" y2="13"/><line x1="16" x2="8" y1="17" y2="17"/>',
  users:   '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
};
const arrow = '<svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>';

const live = POSTS
  .filter(post => !post.draft && post.date <= todayISO)
  .sort((a, b) => (a.date < b.date ? 1 : -1)); // newest first

const featuredCard = (post) => `            <a href="/blog/${post.slug}" class="group grid md:grid-cols-[minmax(0,0.85fr)_minmax(0,1.3fr)] bg-white rounded-2xl border border-black/5 shadow-[0_18px_50px_-30px_rgba(60,45,25,.5)] overflow-hidden hover:shadow-[0_28px_60px_-28px_rgba(60,45,25,.55)] transition-shadow">
                <div class="relative hidden md:flex items-center justify-center p-10 overflow-hidden" style="background:linear-gradient(150deg,#241B12 0%,#3a2c1c 100%);">
                    <span class="absolute top-6 left-7 text-[#E5D4B3] text-[10px] uppercase tracking-[0.2em] font-medium">Featured</span>
                    <div class="absolute -bottom-10 -right-10 w-40 h-40 rounded-full border border-luxury-gold/15"></div>
                    <svg class="w-24 h-24 text-luxury-gold" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">${ICONS[post.icon] || ICONS.file}</svg>
                </div>
                <div class="p-8 md:p-10">
                    <span class="text-luxury-goldDark text-[11px] uppercase tracking-[0.15em] font-medium">${post.tag}</span>
                    <h2 class="font-serif text-2xl md:text-[1.7rem] leading-snug text-luxury-black mt-3 mb-4 group-hover:text-luxury-goldDark transition-colors">${post.title}</h2>
                    <p class="text-sm md:text-[0.95rem] text-gray-600 font-light leading-relaxed">${post.excerpt}</p>
                    <p class="text-[11px] text-gray-400 mt-5 uppercase tracking-wider">${post.author} &middot; ${fmtDate(post.date)} &middot; ${post.readTime}</p>
                    <span class="inline-flex items-center gap-1.5 text-luxury-goldDark text-xs font-medium uppercase tracking-[0.12em] mt-6 group-hover:gap-3 transition-all">Read the article
                        ${arrow}
                    </span>
                </div>
            </a>`;

const regularCard = (post) => `                <a href="/blog/${post.slug}" class="group bg-white rounded-2xl border border-black/5 shadow-[0_18px_50px_-30px_rgba(60,45,25,.5)] p-8 hover:shadow-[0_28px_60px_-28px_rgba(60,45,25,.55)] transition-shadow flex flex-col">
                    <span class="text-luxury-goldDark text-[11px] uppercase tracking-[0.15em] font-medium">${post.tag}</span>
                    <h2 class="font-serif text-xl md:text-2xl leading-snug text-luxury-black mt-3 mb-3 group-hover:text-luxury-goldDark transition-colors">${post.title}</h2>
                    <p class="text-sm text-gray-600 font-light leading-relaxed flex-1">${post.excerpt}</p>
                    <p class="text-[11px] text-gray-400 mt-5 uppercase tracking-wider">${post.author} &middot; ${fmtDate(post.date)} &middot; ${post.readTime}</p>
                    <span class="inline-flex items-center gap-1.5 text-luxury-goldDark text-xs font-medium uppercase tracking-[0.12em] mt-5 group-hover:gap-3 transition-all">Read the article
                        ${arrow}
                    </span>
                </a>`;

let cards = '';
if (live.length) {
  cards = featuredCard(live[0]);
  if (live.length > 1) {
    cards += `\n            <div class="grid md:grid-cols-2 gap-8">\n${live.slice(1).map(regularCard).join('\n')}\n            </div>`;
  }
} else {
  cards = '            <!-- No published articles yet -->';
}

const sitemapEntries = live.map(post => `  <url>
    <loc>https://jte.com.sg/blog/${post.slug}</loc>
    <lastmod>${post.updated || post.date}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>`).join('\n');

// --- inject between markers ---
const between = (text, start, end, replacement) => {
  const re = new RegExp(`(${start})[\\s\\S]*?(${end})`);
  if (!re.test(text)) throw new Error(`Markers not found: ${start} .. ${end}`);
  return text.replace(re, `$1\n${replacement}\n            $2`);
};

let index = readFileSync(p('blog/index.html'), 'utf8');
index = between(index, '<!-- POSTS:START -->', '<!-- POSTS:END -->', cards);
writeFileSync(p('blog/index.html'), index);

let sitemap = readFileSync(p('sitemap.xml'), 'utf8');
sitemap = sitemap.replace(
  /(<!-- BLOGPOSTS:START -->)[\s\S]*?(<!-- BLOGPOSTS:END -->)/,
  `$1\n${sitemapEntries}\n  $2`
);
writeFileSync(p('sitemap.xml'), sitemap);

// --- "Keep reading" block injected into each live article (between markers) ---
const relatedCard = (post) => `          <a href="/blog/${post.slug}" class="group block bg-white rounded-xl border border-black/5 shadow-[0_14px_40px_-28px_rgba(60,45,25,.5)] p-6 hover:shadow-[0_22px_50px_-26px_rgba(60,45,25,.55)] transition-shadow">
            <span class="text-luxury-goldDark text-[11px] uppercase tracking-[0.15em] font-medium">${post.tag}</span>
            <h3 class="font-serif text-lg leading-snug text-luxury-black mt-2 group-hover:text-luxury-goldDark transition-colors">${post.title}</h3>
            <span class="inline-flex items-center gap-1.5 text-luxury-goldDark text-xs font-medium uppercase tracking-[0.12em] mt-4 group-hover:gap-3 transition-all">Read the article
              ${arrow}
            </span>
          </a>`;

const relatedBlock = (current) => {
  const others = live.filter(x => x.slug !== current.slug).slice(0, 2);
  if (!others.length) return '';
  return `        <div class="border-t border-black/10 pt-10">
          <p style="color:#8C7350;font-size:.72rem;letter-spacing:.2em;text-transform:uppercase;font-weight:600;">Keep reading</p>
          <div class="grid sm:grid-cols-2 gap-6 mt-5">
${others.map(relatedCard).join('\n')}
          </div>
        </div>`;
};

const liveSlugs = new Set(live.map(x => x.slug));
let related = 0;
for (const post of POSTS) {
  const fp = p(`blog/${post.slug}/index.html`);
  let html;
  try { html = readFileSync(fp, 'utf8'); } catch { continue; }
  if (!html.includes('<!-- RELATED:START -->')) continue;
  const block = liveSlugs.has(post.slug) ? relatedBlock(post) : ''; // clear for not-yet-live posts
  html = html.replace(
    /(<!-- RELATED:START -->)[\s\S]*?(<!-- RELATED:END -->)/,
    `$1\n${block}\n        $2`
  );
  writeFileSync(fp, html);
  related++;
}

console.log(`build-blog: ${todayISO} — ${live.length} live post(s): ${live.map(x => x.slug).join(', ') || '(none)'}; related blocks updated: ${related}`);
const pending = POSTS.filter(post => post.draft || post.date > todayISO);
if (pending.length) console.log(`  pending: ${pending.map(x => `${x.slug}@${x.draft ? 'draft' : x.date}`).join(', ')}`);
