// Deterministic article assembler for the Growth Engine. Takes a structured
// content object (from the writer role) and produces a full, on-brand, schema'd
// article HTML by cloning the template and replacing only the variable regions.
// The model never emits HTML — it emits content — so output is always well-formed.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const ROOT = new URL('../', import.meta.url);
const TEMPLATE = new URL('blog/how-to-hire-a-process-engineer-singapore/index.html', ROOT);
const esc = (s) => String(s == null ? '' : s).replace(/&(?!(amp|lt|gt|quot|#?\w+);)/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const attr = (s) => String(s == null ? '' : s).replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// Em/long dashes read as AI — strip them from all copy (commas instead). Hyphens and en-dash ranges are left alone.
const deDash = (s) => String(s).replace(/\s*(?:&mdash;|&#8212;|—)\s*/g, ', ').replace(/\s+,/g, ',').replace(/,\s*,/g, ',').replace(/,\s{2,}/g, ', ');
const deepDeDash = (v) => typeof v === 'string' ? deDash(v) : Array.isArray(v) ? v.map(deepDeDash) : (v && typeof v === 'object') ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, deepDeDash(x)])) : v;

export function buildArticle(c, date) {
  c = deepDeDash(c);
  const slug = c.slug;
  const url = `https://jte.com.sg/blog/${slug}/`;
  const heroImg = `${url}hero.jpg`;
  let h = readFileSync(TEMPLATE, 'utf8');

  // ---- head: title / description / canonical / og / twitter / robots ----
  h = h.replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(c.title)} | JTE Recruit</title>`);
  h = h.replace(/(<meta name="description" content=")[^"]*(">)/, `$1${attr(c.metaDescription)}$2`);
  h = h.replace(/(<link rel="canonical" href=")[^"]*(">)/, `$1${url}$2`);
  h = h.replace(/(<meta property="og:title" content=")[^"]*(">)/, `$1${attr(c.title)}$2`);
  h = h.replace(/(<meta property="og:description" content=")[^"]*(">)/, `$1${attr(c.metaDescription)}$2`);
  h = h.replace(/(<meta property="og:url" content=")[^"]*(">)/, `$1${url}$2`);
  h = h.replace(/(<meta property="og:image" content=")[^"]*(">)/, `$1${heroImg}$2`);
  h = h.replace(/(<meta name="twitter:title" content=")[^"]*(">)/, `$1${attr(c.title)}$2`);
  h = h.replace(/(<meta name="twitter:description" content=")[^"]*(">)/, `$1${attr(c.metaDescription)}$2`);
  h = h.replace(/(<meta name="twitter:image" content=")[^"]*(">)/, `$1${heroImg}$2`);
  if (/<meta name="robots"/i.test(h)) h = h.replace(/<meta name="robots"[^>]*>/i, '<meta name="robots" content="noindex, follow">');
  else h = h.replace(/(<\/title>)/, '$1\n    <meta name="robots" content="noindex, follow">');

  // ---- structured data: strip all, insert fresh BlogPosting + one FAQPage ----
  h = h.replace(/\s*<script type="application\/ld\+json">[\s\S]*?<\/script>/g, '');
  const blog = {
    '@context': 'https://schema.org', '@type': 'BlogPosting', headline: c.title, description: c.metaDescription,
    datePublished: date, dateModified: date,
    author: { '@type': 'Person', name: 'Eugene Teo', jobTitle: 'Co-Founder', worksFor: { '@type': 'Organization', '@id': 'https://jte.com.sg/#organization', name: 'JTE Recruit Pte Ltd' }, url: 'https://www.linkedin.com/in/teoeugene', sameAs: ['https://www.linkedin.com/in/teoeugene'] },
    publisher: { '@type': 'Organization', '@id': 'https://jte.com.sg/#organization', name: 'JTE Recruit Pte Ltd', logo: { '@type': 'ImageObject', url: 'https://cqkzlykkshlzemiiloeo.supabase.co/storage/v1/object/public/jte-images/favicon/JTE%20Favicon.png' } },
    mainEntityOfPage: { '@type': 'WebPage', '@id': `https://jte.com.sg/blog/${slug}` },
  };
  const faqLD = { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: (c.faq || []).map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) };
  const crumbLD = { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://jte.com.sg/' },
    { '@type': 'ListItem', position: 2, name: 'Field Notes', item: 'https://jte.com.sg/blog/' },
    { '@type': 'ListItem', position: 3, name: c.title, item: `https://jte.com.sg/blog/${slug}/` },
  ] };
  const schema = `    <script type="application/ld+json">${JSON.stringify(blog)}</script>\n    <script type="application/ld+json">${JSON.stringify(faqLD)}</script>\n    <script type="application/ld+json">${JSON.stringify(crumbLD)}</script>\n    `;
  h = h.replace('<!-- Google Analytics 4 -->', schema + '<!-- Google Analytics 4 -->');

  // ---- H1 ----
  h = h.replace(/(<h1 class="font-serif[^"]*">)[\s\S]*?(<\/h1>)/, `$1${esc(c.h1)}$2`);
  // dek (the italic subtitle under the H1) — the template's must be replaced or it leaks through
  h = h.replace(/(<p class="dek[^"]*">)[\s\S]*?(<\/p>)/, `$1${esc(c.dek || c.metaDescription)}$2`);

  // ---- main body ----
  const links = {}; for (const l of (c.crossLinks || [])) links[l.anchor] = l.slug;
  // Top-level (non-blog) pages the writer may link to — don't prefix these with /blog/.
  const TOPLEVEL = new Set(['free-payroll-singapore', 'cost-of-vacancy', 'services', 'sectors', 'employers', 'contact', 'salary-guide', 'hiring-grants', 'our-story', 'reviews', 'verify']);
  const hrefFor = (sl) => { const bare = String(sl).trim().replace(/^\/?(blog\/)?/, '').replace(/\/$/, ''); if (TOPLEVEL.has(bare)) return `/${bare}/`; if (String(sl).startsWith('/')) return String(sl); return `/blog/${bare}/`; };
  const linkify = (t) => { let s = esc(t); for (const [anchor, sl] of Object.entries(links)) { if (s.includes(anchor)) { s = s.replace(anchor, `<a href="${hrefFor(sl)}">${anchor}</a>`); break; } } return s; };
  const hero = `<figure class="mb-10"><img src="hero.jpg" alt="${attr(c.heroAlt || c.title)}" class="w-full rounded-xl" style="aspect-ratio:1600/820;" loading="eager" width="1600" height="820"></figure>`;
  const graphic = `<figure class="mb-10"><img src="graphic-1.jpg" alt="${attr(c.graphic?.title || c.title)}" class="w-full rounded-xl" loading="lazy" width="1600" height="900"></figure>`;
  const lead = (Array.isArray(c.lead) ? c.lead : [c.lead]).filter(Boolean).map((p) => `<p>${linkify(p)}</p>`).join('\n        ');
  const secHtml = (c.sections || []).map((s, i) => {
    const body = (s.paras || []).map((p) => `<p>${linkify(p)}</p>`).join('\n        ');
    return `<h2>${esc(s.h2)}</h2>\n        ${body}${i === 0 ? '\n\n        ' + graphic : ''}`;
  }).join('\n\n        ');
  const callout = c.callout ? `\n\n        <div class="callout"><p><strong>The takeaway</strong> ${linkify(c.callout)}</p></div>` : '';
  const faqRows = (c.faq || []).map((f) => `<details class="faq"><summary>${esc(f.q)}</summary><div class="faq-a"><p>${esc(f.a)}</p></div></details>`).join('\n        ');
  const faq = `\n\n        <h2>Frequently asked questions</h2>\n        ${faqRows}`;
  const cta = `\n\n        <p style="text-align:center; margin-top:1.5rem"><a href="/contact" class="btn-pill inline-block px-8 py-3.5 rounded-md text-xs uppercase tracking-wider font-semibold" style="text-decoration:none">Let&rsquo;s talk hiring</a></p>`;
  const mainInner = `\n        ${hero}\n\n        ${lead}\n\n        ${secHtml}${callout}${faq}${cta}\n    `;
  h = h.replace(/(<main class="[^"]*">)[\s\S]*?(<\/main>)/, `$1${mainInner}$2`);

  mkdirSync(new URL(`blog/${slug}/`, ROOT), { recursive: true });
  writeFileSync(new URL(`blog/${slug}/index.html`, ROOT), h);
  return slug;
}
