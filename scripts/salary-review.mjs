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
L.push('was wrong for manufacturing. The guidelines below now give us something to check the floor');
L.push('against, and the floored ranges sit inside the official bands, so the figures are less shaky');
L.push('than they looked — but the floor itself is still yours to set, and I have not changed it.');
L.push('');
L.push('The official Community Care salary guidelines are now read, directly from the');
L.push('Agency for Integrated Care PDF published 8 April 2026 (Muse, 20 Nov 2026, now');
L.push('primary in salary-research.json under communityCare). What they say, in base salary:');
L.push('a Healthcare Assistant / Care Staff sits in Band 3, starting $2,480, mid-point $3,300.');
L.push('Our Care / Support Staff shows basic $2,500 - $2,900, floored, which sits inside Band 3,');
L.push('so the $2,500 basic floor is defensible for that role, but only just: Band 3 starts');
L.push('at $2,480, $20 below the floor. Patient Service now shows basic $2,500 - $2,750,');
L.push('no longer floored or open-ended after the 21 Nov data refresh; that range sits');
L.push('mostly inside the guidelines\' administrative Band 4 ($2,580 - $4,020), with its');
L.push('bottom just below Band 4\'s starting point. No figure has been changed.');
L.push('The floor decision is yours, and the numbers above are the evidence for it.');
L.push('');
L.push('MOM\'s own wage table is now read too, directly from stats.mom.gov.sg (Table 4,');
L.push('June 2025, Muse, 20 Nov 2026), so the benchmarks below are primary. The check');
L.push('corrected one figure: healthcare assistant gross median was $2,432 second-hand,');
L.push('the table says $2,410. RN, pharmacist and physiotherapist matched exactly.');
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
