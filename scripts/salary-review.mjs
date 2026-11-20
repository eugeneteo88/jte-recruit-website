#!/usr/bin/env node
/*
 * The whole salary guide, laid out for Eugene to mark up.
 *
 * Every published role, what it currently says, and crucially where that number
 * came from, because "JTE told us" and "a job ad said so" are not the same
 * quality of figure and the guide should not pretend otherwise.
 *
 * Writes content-ops/salary-review.md. Not published; content-ops is excluded
 * from the deploy.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const res = JSON.parse(readFileSync(join(ROOT, 'salary-resolved.json'), 'utf8'));
const ov = JSON.parse(readFileSync(join(ROOT, 'salary-overrides.json'), 'utf8'));
const rr = JSON.parse(readFileSync(join(ROOT, 'salary-research.json'), 'utf8'));

const fmt = (n) => n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const money = (c) => !c ? '—' : (c.high == null ? `from $${fmt(c.low)}` : `$${fmt(c.low)} – $${fmt(c.high)}`);

// Where did this number actually come from?
function provenance(role, band) {
  const c = role.bands[band];
  if (!c) return { tag: '—', rank: 9 };
  if (c.verified) return { tag: '**JTE**', rank: 0 };
  if (c.floored) return { tag: 'ad data, floored', rank: 2 };
  return { tag: 'ad data', rank: 1 };
}

const L = [];
L.push('# Salary guide: everything, for your review');
L.push('');
L.push(`Generated ${new Date().toISOString().slice(0, 10)}. Market pull dated ${res.updated}, ${fmt(res.totalPostings)} postings.`);
L.push('');
L.push('Every published role is below with where its number came from. Mark up anything that');
L.push('looks wrong and I will put it in as a JTE figure, which then survives every weekly refresh.');
L.push('');
L.push('| Tag | Means |');
L.push('|---|---|');
L.push('| **JTE** | Your figure. Badged on the live page. |');
L.push('| ad data | 25th–75th percentile of advertised basic pay. Advertised, not agreed. |');
L.push('| ad data, floored | Advertised pay fell below the sector floor, so the floor is showing instead. **Least trustworthy.** |');
L.push('| — | Blank on the page. We would not publish a number we could not stand behind. |');
L.push('');

// ---- the part that needs his eye most ----
L.push('## Read this first');
L.push('');
const hc = rr.benchmarks.find((b) => b.role === 'Healthcare Assistant');
L.push(`MOM's Occupational Wages puts the **gross** median for a healthcare assistant at **S$${fmt(hc.medianGross)}**.`);
L.push('Our guide currently shows healthcare hands-on roles at a **basic** floored up to S$2,500.');
L.push('');
L.push('A gross median below our basic floor means the floor is wrong for healthcare, the same way it');
L.push('was wrong for manufacturing. I have not changed it, because the right number is yours to give,');
L.push('but I would not trust any healthcare hands-on figure on the guide today.');
L.push('');
L.push('The official Community Care salary guidelines would settle it. The PDF is behind CloudFront and');
L.push('returns 403 to us. If you can open it and paste the table, that one document probably fixes every');
L.push('healthcare hands-on role at once.');
L.push('');

// ---- roles ----
L.push('## Every role');
L.push('');
for (const s of res.sectors) {
  const floor = s.floor ? s.floor.amount : res.floor.amount;
  L.push(`### ${s.name}`);
  L.push('');
  L.push(`Floor in use: **S$${fmt(floor)}**${s.floor ? ' (sector-specific)' : ''}`);
  if (s.note) L.push(`\nSector note on the page: _${s.note}_`);
  L.push('');
  const tracks = [...new Set(s.roles.map((r) => r.track))];
  for (const t of tracks) {
    const tr = res.tracks[t];
    const roles = s.roles.filter((r) => r.track === t);
    L.push(`**${tr.label}** — ${tr.bands.join(' · ')}`);
    L.push('');
    L.push(`| Role | ${tr.bands.join(' | ')} | Where from | Postings |`);
    L.push(`|---|${tr.bands.map(() => '---').join('|')}|---|---|`);
    for (const r of roles) {
      const cells = tr.bands.map((b) => money(r.bands[b]));
      const provs = tr.bands.map((b) => provenance(r, b)).filter((p) => p.rank < 9);
      const worst = provs.sort((a, b) => b.rank - a.rank)[0];
      L.push(`| ${r.name} | ${cells.join(' | ')} | ${worst ? worst.tag : '—'} | ${r.n} |`);
    }
    L.push('');
  }
}

// ---- benchmarks ----
L.push('## Official benchmarks I found');
L.push('');
L.push('These are gross medians across all experience, so they are not directly comparable to our');
L.push('basic bands, but they are a useful sanity check.');
L.push('');
L.push('| Role | Median gross | Also seen | Note |');
L.push('|---|---|---|---|');
for (const b of rr.benchmarks) {
  L.push(`| ${b.role} | S$${fmt(b.medianGross)} | ${b.alsoSeen ? 'S$' + fmt(b.alsoSeen) : '—'} | ${b.note} |`);
}
L.push('');
L.push('### How much to trust them');
L.push('');
for (const [, s] of Object.entries(rr.sources)) {
  L.push(`**${s.name}** (${s.confidence}) — ${s.what}`);
  if (s.caveat) L.push(`  _${s.caveat}_`);
  L.push('');
}

L.push('## What I still need');
L.push('');
rr.openQuestions.forEach((q) => L.push(`- ${q}`));
L.push('');
const verified = Object.entries(ov.roles).filter(([, r]) => r.pay || r.verifiedLow != null);
L.push(`Roles carrying your figures so far: **${verified.length}**`);
L.push('');
verified.forEach(([k, r]) => L.push(`- ${r.rename || k.split('/')[1]} (${k.split('/')[0]})`));

mkdirSync(join(ROOT, 'content-ops'), { recursive: true });
writeFileSync(join(ROOT, 'content-ops/salary-review.md'), L.join('\n') + '\n');
const counts = { jte: 0, ad: 0, floored: 0, blank: 0 };
for (const s of res.sectors) for (const r of s.roles) for (const b of res.tracks[r.track].bands) {
  const c = r.bands[b];
  if (!c) counts.blank++; else if (c.verified) counts.jte++; else if (c.floored) counts.floored++; else counts.ad++;
}
console.log(`salary-review: ${counts.jte} JTE, ${counts.ad} ad-data, ${counts.floored} floored, ${counts.blank} blank`);
console.log('  -> content-ops/salary-review.md');
