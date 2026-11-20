#!/usr/bin/env node
/*
 * What the salary guide still can't answer, ranked by how much it matters.
 *
 * The resolver refuses to publish a range it can't stand behind, so every refusal
 * is a question for Eugene. This turns those refusals into a working list:
 * which roles are missing, which bands are blank, and where we're showing an
 * open-ended "from" because we know the floor but not the ceiling.
 *
 * Writes content-ops/salary-gaps.md (not published, content-ops is excluded
 * from the deploy).
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const raw = JSON.parse(readFileSync(join(ROOT, 'salary-data.json'), 'utf8'));
const res = JSON.parse(readFileSync(join(ROOT, 'salary-resolved.json'), 'utf8'));
const ov = JSON.parse(readFileSync(join(ROOT, 'salary-overrides.json'), 'utf8'));

const fmt = (n) => n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const bySlug = Object.fromEntries(res.sectors.map((s) => [s.slug, s]));

const dropped = [];   // role gone entirely
const blanks = [];    // role shown, band blank
const openEnded = []; // floor known, top end not

for (const s of raw.sectors) {
  const out = bySlug[s.slug];
  const kept = new Set((out?.roles || []).map((r) => r.originalName));
  for (const r of s.roles) {
    if (!kept.has(r.name)) { dropped.push({ sector: s.slug, name: r.name, n: r.n }); continue; }
    const rr = out.roles.find((x) => x.originalName === r.name);
    for (const b of res.tracks[rr.track].bands) {
      const cell = rr.bands[b];
      if (!cell) blanks.push({ sector: s.slug, name: rr.name, band: b, n: r.n });
      else if (cell.openEnded) openEnded.push({ sector: s.slug, name: rr.name, band: b, low: cell.low });
    }
  }
}

// Busiest roles first: a gap on a role with 450 postings behind it costs more
// than one on a role with 7.
const byVolume = (a, b) => (b.n || 0) - (a.n || 0);
dropped.sort(byVolume); blanks.sort(byVolume);

const lines = [];
lines.push('# Salary guide: what we still need from you');
lines.push('');
lines.push(`Generated ${new Date().toISOString().slice(0, 10)} from the ${fmt(res.totalPostings)}-posting pull dated ${res.updated}.`);
lines.push('');
lines.push('The guide refuses to publish a range it cannot stand behind, so each line below is');
lines.push('a blank on the live page. Give me a number for any of them and it goes in as a JTE');
lines.push('figure, marked as ours, and it survives every weekly refresh after that.');
lines.push('');
lines.push('To answer one, just tell me the role and a range. "Warehouse assistant, 2500 to 2900"');
lines.push('is enough. A floor on its own is fine too, I will show it as "from".');
lines.push('');

lines.push(`## 1. Showing a floor but no top end (${openEnded.length})`);
lines.push('');
lines.push('These read "from S$X" on the page. They need a realistic top end.');
lines.push('');
if (openEnded.length) {
  lines.push('| Sector | Role | Band | Currently |');
  lines.push('|---|---|---|---|');
  for (const g of openEnded) lines.push(`| ${g.sector} | ${g.name} | ${g.band} | from S$${fmt(g.low)} |`);
} else lines.push('_None._');
lines.push('');

lines.push(`## 2. Roles dropped entirely (${dropped.length})`);
lines.push('');
lines.push('Not enough postings behind any band to publish. They are off the guide until we have a figure.');
lines.push('');
if (dropped.length) {
  lines.push('| Sector | Role | Postings seen |');
  lines.push('|---|---|---|');
  for (const g of dropped) lines.push(`| ${g.sector} | ${g.name} | ${g.n} |`);
} else lines.push('_None._');
lines.push('');

lines.push(`## 3. Published roles with a blank band (${blanks.length})`);
lines.push('');
lines.push('The role is on the guide, but this band shows a dash. Busiest roles first.');
lines.push('');
if (blanks.length) {
  lines.push('| Sector | Role | Blank band | Postings for the role |');
  lines.push('|---|---|---|---|');
  for (const g of blanks.slice(0, 60)) lines.push(`| ${g.sector} | ${g.name} | ${g.band} | ${g.n} |`);
  if (blanks.length > 60) lines.push(`| … | _${blanks.length - 60} more_ | | |`);
} else lines.push('_None._');
lines.push('');

lines.push('## 4. Role names worth a second look');
lines.push('');
lines.push('These came from grouping job ads, so they read like buckets rather than jobs people');
lines.push('advertise for. Tell me the title you would use and I will rename them.');
lines.push('');
const bucketish = [];
for (const s of res.sectors) for (const r of s.roles) {
  if (/\(general\)|\s\/\s/.test(r.name) && !ov.roles[`${s.slug}/${r.originalName}`]?.rename) {
    bucketish.push(`- **${s.slug}** · ${r.name}`);
  }
}
lines.push(bucketish.length ? bucketish.join('\n') : '_None._');
lines.push('');
lines.push('---');
lines.push('');
lines.push(`Already answered: ${Object.values(ov.roles).filter((r) => r.verifiedLow != null).length} role(s) carry a JTE figure.`);

mkdirSync(join(ROOT, 'content-ops'), { recursive: true });
writeFileSync(join(ROOT, 'content-ops/salary-gaps.md'), lines.join('\n') + '\n');
console.log(`salary-gaps: ${openEnded.length} open-ended, ${dropped.length} dropped roles, ${blanks.length} blank bands, ${bucketish.length} names to review`);
console.log('  -> content-ops/salary-gaps.md');
