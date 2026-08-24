// Build the client-facing work log at /updates/.
//
// WHY. Technical SEO is almost entirely invisible. The client pays every month and
// sees a website that looks the same, which is the honest reason retainers get
// cancelled — not because the work was bad, because nobody could see it. This page is
// the answer: a plain timeline of what was done, in language they can read.
//
// WHAT WILL ACTUALLY BE MAINTAINED — the design constraint that matters.
// A log that must be written by hand decays by month three. So articles fill
// themselves in from blog/posts.json, and the only manual work is one line in
// updates.json when something technical ships. If even that gets skipped, the page
// still shows the published articles and is never empty or stale-looking.
//
//   node build-updates.mjs

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const CLIENT = 'JTE Recruit';
const OUT = 'updates/index.html';

const read = (p, fallback) => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return fallback; } };

// Manual entries: the technical work only a person can describe usefully.
const manual = read('updates.json', []);

// Automatic: every article that has published. Never needs typing.
const postsRaw = read('blog/posts.json', []);
const posts = (Array.isArray(postsRaw) ? postsRaw : (postsRaw.posts || []))
  .filter((p) => p.date)
  .map((p) => ({
    date: p.date,
    kind: 'article',
    title: p.title,
    note: p.excerpt || '',
    href: `/blog/${p.slug}/`,
  }));

const today = new Date().toISOString().slice(0, 10);
const combined = [...manual, ...posts];

// Done is done. Never present scheduled work as delivered — the client can check the
// URL, and one entry that is not really there costs more trust than ten honest ones buy.
const all = combined.filter((e) => e.date && e.date <= today).sort((a, b) => b.date.localeCompare(a.date));

// But scheduled work IS worth showing, clearly labelled as coming. On a retainer the
// question in the client's head is not only "what did I get" but "is anything still
// happening" — and the pipeline answers it better than any reassurance.
const upcoming = combined.filter((e) => e.date && e.date > today).sort((a, b) => a.date.localeCompare(b.date));

const KIND = {
  article: { label: 'New article', c: '#5b57d6', bg: '#e7e6fb' },
  page: { label: 'Page updated', c: '#0b6fb0', bg: '#e2eefb' },
  technical: { label: 'Technical', c: '#7a5c15', bg: '#fdf3d9' },
  fix: { label: 'Fixed', c: '#12a06a', bg: '#e4f5ec' },
  seo: { label: 'Search', c: '#a3306e', bg: '#fbe6f1' },
};

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const human = (d) => { const [y, m, dd] = d.split('-').map(Number); return `${dd} ${MON[m - 1]} ${y}`; };
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// Titles in posts.json already carry HTML entities like &rsquo; — escaping again would
// show them as literal text, so those are trusted and passed through.
const raw = (s) => String(s == null ? '' : s);

// Group by month so the page reads as a story rather than a list.
const months = [];
for (const e of all) {
  const key = e.date.slice(0, 7);
  let g = months.find((x) => x.key === key);
  if (!g) { months.push(g = { key, items: [] }); }
  g.items.push(e);
}
const monthName = (k) => { const [y, m] = k.split('-').map(Number); return `${['January','February','March','April','May','June','July','August','September','October','November','December'][m - 1]} ${y}`; };

const item = (e) => {
  const k = KIND[e.kind] || KIND.technical;
  return `<li class="it">
      <span class="tag" style="color:${k.c};background:${k.bg}">${k.label}</span>
      <div class="body">
        <div class="t">${e.href ? `<a href="${e.href}">${raw(e.title)}</a>` : raw(e.title)}</div>
        ${e.note ? `<p>${raw(e.note)}</p>` : ''}
        <span class="d">${human(e.date)}</span>
      </div>
    </li>`;
};

const html = `<!doctype html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>What we've done — ${CLIENT}</title>
<!-- Not secret, but not advertised: this is a working record for the client, not a
     page for search engines. -->
<meta name="robots" content="noindex, nofollow">
<link rel="icon" href="/favicon.ico">
<style>
:root{--ink:#22252e;--soft:#5b6472;--muted:#666c7a;--line:#e2e4eb;--bg:#f5f6f9;--bg2:#edeef4;--accent:#5b57d6}
*{box-sizing:border-box;margin:0;padding:0}
html,body{overflow-x:hidden;max-width:100%}
body{background:var(--bg);color:var(--ink);font:16.5px/1.6 -apple-system,BlinkMacSystemFont,"SF Pro Display","Segoe UI",Inter,Roboto,sans-serif;letter-spacing:-.015em;-webkit-font-smoothing:antialiased}
.wrap{max-width:720px;margin:0 auto;padding:0 20px 70px}
.head{padding:48px 0 22px;border-bottom:2px solid var(--ink)}
.kicker{font-size:12.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--accent);font-weight:800}
h1{font-size:clamp(28px,5.2vw,40px);font-weight:800;letter-spacing:-.035em;line-height:1.08;margin:.3em 0 .25em}
.head p{color:var(--soft);max-width:56ch}
.sum{display:flex;gap:10px;flex-wrap:wrap;margin:20px 0 0}
.sum div{background:#fff;border:1px solid var(--line);border-radius:12px;padding:11px 15px;min-width:120px}
.sum b{display:block;font-size:23px;line-height:1.15}
.sum span{font-size:12.5px;color:var(--soft)}
h2{font-size:13px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);font-weight:800;margin:34px 0 12px}
ul{list-style:none}
.it{display:flex;gap:12px;background:#fff;border:1px solid var(--line);border-radius:13px;padding:14px 16px;margin-bottom:9px}
.tag{flex:none;font-size:11px;font-weight:800;letter-spacing:.03em;padding:4px 10px;border-radius:980px;height:fit-content;white-space:nowrap}
.body{flex:1;min-width:0;overflow-wrap:anywhere}
.t{font-size:16.5px;font-weight:700;line-height:1.3;overflow-wrap:break-word}
.t a{color:var(--ink);text-decoration:none;border-bottom:1.5px solid var(--line)}
.t a:hover{border-color:var(--accent);color:var(--accent)}
.body p{font-size:14.5px;color:#3a404d;margin-top:5px;line-height:1.5}
.soon .it{background:#fbfbfd;border-style:dashed}
.d{display:block;font-size:12.5px;color:var(--muted);margin-top:6px}
.note{background:var(--bg2);border-radius:13px;padding:16px 18px;margin:26px 0 0;font-size:15px;color:#3a404d}
.foot{margin-top:30px;padding-top:16px;border-top:1px solid var(--line);font-size:13px;color:var(--muted)}
.foot a{color:var(--accent)}
@media(max-width:560px){.it{flex-direction:column;gap:8px}.tag{align-self:flex-start}}
</style></head><body>
<div class="wrap">
  <div class="head">
    <div class="kicker">${esc(CLIENT)} · work log</div>
    <h1>What we've done</h1>
    <p>Everything we've changed on your website, newest first. Search work is mostly invisible from the outside — this is where you can see it.</p>
    <div class="sum">
      <div><b>${all.length}</b><span>things shipped</span></div>
      <div><b>${all.filter((e) => e.kind === 'article').length}</b><span>articles published</span></div>
      <div><b>${months.length}</b><span>months of work</span></div>
    </div>
  </div>

  ${upcoming.length ? `<h2>Coming up</h2><ul class="soon">${upcoming.map((e) => `<li class="it">
      <span class="tag" style="color:#666c7a;background:#edeef4">Scheduled</span>
      <div class="body"><div class="t">${raw(e.title)}</div>${e.note ? `<p>${raw(e.note)}</p>` : ''}<span class="d">planned for ${human(e.date)}</span></div>
    </li>`).join('')}</ul>` : ''}

  ${months.map((g) => `<h2>${monthName(g.key)}</h2><ul>${g.items.map(item).join('')}</ul>`).join('')}

  <div class="note"><b>Why some months look quieter.</b> Search work is not evenly spaced. A month spent fixing how Google reads the site produces one line here and more effect than four articles. The measure that matters is the monthly report, not the length of this page.</div>

  <p class="foot">Built and maintained by <a href="https://heyada.io">HeyAda</a>. Last updated ${human(today)}.</p>
</div></body></html>`;

mkdirSync('updates', { recursive: true });
writeFileSync(OUT, html, 'utf8');
console.log(`built ${OUT}`);
console.log(`  ${all.length} shipped — ${manual.filter(e=>e.date<=today).length} written by hand, ${posts.filter(e=>e.date<=today).length} published articles`);
console.log(`  ${upcoming.length} scheduled and shown as coming up, not as done`);
console.log(`  spanning ${months.length} month(s), newest ${all[0] ? all[0].date : 'n/a'}`);
