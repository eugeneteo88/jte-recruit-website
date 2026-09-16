// Generates review/drafts.json — the manifest the private review console reads.
// Scans posts.json for held (draft:true) articles and computes a QA snapshot for each.
import fs from 'fs';
const posts = JSON.parse(fs.readFileSync('blog/posts.json','utf8'));
let prompts = {}; try { prompts = JSON.parse(fs.readFileSync('scripts/review-prompts.json','utf8')); } catch {}

const drafts = posts.filter(p=>p.draft).map(p=>{
  const file = `blog/${p.slug}/index.html`;
  let html=''; try{ html=fs.readFileSync(file,'utf8'); }catch{}
  const main = (html.match(/<main class="max-w-3xl mx-auto px-6 py-14 article">([\s\S]*?)<\/main>/)||[])[1]||'';
  const text = main.replace(/<[^>]+>/g,' ').replace(/&[a-z]+;/g,' ').replace(/\s+/g,' ').trim();
  const words = text ? text.split(' ').length : 0;
  const faqCount = (main.match(/class="faq"/g)||[]).length;
  const imgCount = (main.match(/<img/g)||[]).length;
  return {
    slug: p.slug,
    title: p.title,
    tag: p.tag || '',
    date: p.date || '',
    excerpt: p.excerpt || '',
    previewUrl: `/blog/${p.slug}/`,
    heroUrl: fs.existsSync(`blog/${p.slug}/hero.jpg`) ? `/blog/${p.slug}/hero.jpg` : null,
    words,
    faqCount,
    hasFaqSchema: /"FAQPage"/.test(html),
    hasBlogSchema: /"BlogPosting"/.test(html),
    supportingImages: Math.max(0, imgCount - 1),   // minus the hero figure
    internalLinks: (main.match(/href="\/(blog|services|salary-guide|sectors|hiring-grants|contact)/g)||[]).length,
    prompts: (prompts[p.slug] && Array.isArray(prompts[p.slug])) ? prompts[p.slug] : []
  };
}).sort((a,b)=> (a.date||'').localeCompare(b.date||''));

fs.mkdirSync('review', {recursive:true});
fs.writeFileSync('review/drafts.json', JSON.stringify({ generated: new Date().toISOString(), count: drafts.length, drafts }, null, 2));
console.log('build-review:', drafts.length, 'held article(s) ->', 'review/drafts.json');
