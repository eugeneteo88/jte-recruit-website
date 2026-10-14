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
  article: { label: 'New article', c: '#8C7350', bg: '#F1E9D9' },
  page: { label: 'Page updated', c: '#2f6b6b', bg: '#e4efee' },
  technical: { label: 'Technical', c: '#6b5a2e', bg: '#f1ead6' },
  fix: { label: 'Fixed', c: '#3f7d5a', bg: '#e6f1ea' },
  seo: { label: 'Search', c: '#9a5a33', bg: '#f3e6da' },
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
<link rel="icon" type="image/png" href="https://cqkzlykkshlzemiiloeo.supabase.co/storage/v1/object/public/jte-images/favicon/JTE%20Favicon.png">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@500;600;700&family=Inter:wght@300;400;500;600&display=swap" rel="stylesheet">
<style>
:root{--bg:#FBF9F4;--surface:#fff;--ink:#241B12;--soft:#5f574c;--muted:#8a8378;--line:rgba(36,27,18,.10);--gold:#B4894E;--gold-ink:#8C7350;--panel:#F4EEE1;--serif:'Playfair Display',Georgia,'Times New Roman',serif;--sans:'Inter',system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
*{box-sizing:border-box;margin:0;padding:0}
html,body{overflow-x:hidden;max-width:100%}
body{background:var(--bg);color:var(--ink);font:16.5px/1.65 var(--sans);-webkit-font-smoothing:antialiased}
.wrap{max-width:760px;margin:0 auto;padding:0 20px 80px}
.head{padding:52px 0 26px;border-bottom:1px solid var(--line)}
.brand{display:flex;align-items:baseline;gap:.5rem;margin-bottom:1.5rem}
.brand b{font-family:var(--serif);font-size:1.3rem;font-weight:600;letter-spacing:.06em}
.brand span{font-size:.6rem;letter-spacing:.3em;text-transform:uppercase;color:var(--muted)}
.kicker{font-size:12px;letter-spacing:.2em;text-transform:uppercase;color:var(--gold-ink);font-weight:700}
h1{font-family:var(--serif);font-size:clamp(30px,5.4vw,44px);font-weight:600;line-height:1.1;margin:.35em 0 .3em}
.head p{color:var(--soft);max-width:58ch;font-weight:300}
.sum{display:flex;gap:12px;flex-wrap:wrap;margin:26px 0 0}
.sum div{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:13px 18px;min-width:118px}
.sum b{display:block;font-family:var(--serif);font-size:26px;font-weight:600;line-height:1.1}
.sum span{font-size:12px;color:var(--soft)}
h2{font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:var(--muted);font-weight:700;margin:40px 0 14px}
ul{list-style:none}
.it{display:flex;gap:14px;background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:15px 17px;margin-bottom:10px}
.tag{flex:none;font-size:10.5px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;padding:5px 11px;border-radius:980px;height:fit-content;white-space:nowrap}
.body{flex:1;min-width:0;overflow-wrap:anywhere}
.t{font-family:var(--serif);font-size:17px;font-weight:600;line-height:1.3}
.t a{color:var(--ink);text-decoration:none;border-bottom:1px solid var(--line)}
.t a:hover{border-color:var(--gold);color:var(--gold-ink)}
.body p{font-size:14.5px;color:var(--soft);margin-top:6px;line-height:1.55;font-weight:300}
.soon .it{background:var(--panel);border-style:dashed}
.d{display:block;font-size:12px;color:var(--muted);margin-top:7px}
.note{background:var(--panel);border-left:3px solid var(--gold);border-radius:0 12px 12px 0;padding:16px 20px;margin:30px 0 0;font-size:14.5px;color:var(--soft);line-height:1.6}
.note b{color:var(--ink)}
.foot{margin-top:34px;padding-top:18px;border-top:1px solid var(--line);font-size:12.5px;color:var(--muted)}
.foot a{color:var(--gold-ink)}
@media(max-width:560px){.it{flex-direction:column;gap:9px}.tag{align-self:flex-start}.sum div{flex:1;min-width:100px}}
</style></head><body>
<div class="wrap">
  <div class="head">
    <div class="brand"><b>JTE</b><span>Recruit</span></div>
    <div class="kicker">Work log</div>
    <h1>What we've done</h1>
    <p>Everything we've changed on your website, newest first. Search work is mostly invisible from the outside &mdash; this is where you can see it.</p>
    <div class="sum">
      <div><b>${all.length}</b><span>things shipped</span></div>
      <div><b>${all.filter((e) => e.kind === 'article').length}</b><span>articles published</span></div>
      <div><b>${months.length}</b><span>months of work</span></div>
    </div>
  </div>

  ${upcoming.length ? `<h2>Coming up</h2><ul class="soon">${upcoming.slice(0, 6).map((e) => `<li class="it">
      <span class="tag" style="color:#8a8378;background:#efe9df">Scheduled</span>
      <div class="body"><div class="t">${raw(e.title)}</div>${e.note ? `<p>${raw(e.note)}</p>` : ''}<span class="d">planned for ${human(e.date)}</span></div>
    </li>`).join('')}</ul>${upcoming.length > 6 ? `<p style="font-size:13px;color:var(--muted);margin:2px 2px 0">+ ${upcoming.length - 6} more articles scheduled through ${human(upcoming[upcoming.length - 1].date)}.</p>` : ''}` : ''}

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
