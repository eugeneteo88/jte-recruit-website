#!/usr/bin/env node
/*
 * Salary guide: merge JTE's own layer over the weekly market pull.
 *
 *   salary-data.json       raw, overwritten every Saturday by salary-data.mjs
 * + salary-overrides.json  what JTE knows that the raw numbers do not
 * = salary-resolved.json   what build-salary.mjs actually renders
 *
 * The raw pull is advertised salary, so it is a starting point, not an answer.
 * It carries three faults we will not publish:
 *   - ranges below what actually hires in Singapore (machine operator at S$1,850)
 *   - bands that run backwards, where "mid" pays less than "junior"
 *   - bands built on a handful of postings, presented as if they were a finding
 * The guards below deal with each. Anything JTE has verified wins outright and
 * is marked, so the page can show what we stand behind versus what the market
 * is advertising.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const raw = JSON.parse(readFileSync(join(ROOT, 'salary-data.json'), 'utf8'));
const ov = JSON.parse(readFileSync(join(ROOT, 'salary-overrides.json'), 'utf8'));

const MIN_N = 20;            // postings needed before we publish a band at all
const FLOOR = ov.floor.amount;
const PRO_MAP = { 'Junior': '0-3 yrs', 'Mid': '3-8 yrs', 'Senior / Lead': '8+ yrs' };

const r50 = (n) => Math.round(n / 50) * 50;
const stats = { floorRaised: 0, backwards: 0, thinDropped: 0, collapsed: 0, verified: 0, needsJte: 0 };
const notes = [];

function resolveRole(sectorSlug, role) {
  const key = `${sectorSlug}/${role.name}`;
  const cfg = ov.roles[key] || { track: ov.sectors[sectorSlug]?.defaultTrack || 'professional' };
  const track = cfg.track;
  const basis = cfg.basis || 'basic';
  const out = {
    name: cfg.rename || role.name,
    originalName: role.name,
    track,
    n: role.n,
    scope: cfg.scope || null,
    basis,
    basisLabel: (ov.basis && ov.basis[basis] && ov.basis[basis].label) || null,
    basicNote: cfg.basicNote || null,
    aboveNote: cfg.aboveNote || null,
    benefitNote: cfg.benefitNote || null,
    daysPerWeek: cfg.daysPerWeek || null,
    bands: {},
    flags: [],
  };

  // ---- 1. shape the raw bands into this track's bands ----
  let src;
  if (track === 'operative') {
    // Advertised pay for a hands-on role is the basic. The junior band holds the
    // bulk of the postings (warehouse: 337 of 450), so that is the going basic.
    // Gross is never in the ads, so it only ever comes from JTE.
    // Take whichever advertised band has the most evidence behind it, not just
    // the first that exists. Warehouse: Junior wins on 337 postings. Process:
    // Mid wins on 27 against Junior's 16, and taking Junior first dropped the
    // role entirely for thin data.
    const base = [role.bands['Junior'], role.bands['Mid']]
      .filter(Boolean)
      .sort((a, b) => b.n - a.n)[0] || null;
    src = { 'Basic': base, 'Gross': null };
  } else {
    src = {};
    for (const [from, to] of Object.entries(PRO_MAP)) src[to] = role.bands[from] || null;
  }

  // ---- 2. guards ----
  const suppress = new Set(cfg.suppressBands || []);
  const bandNames = ov.tracks[track].bands;
  let prevLow = 0;
  for (const name of bandNames) {
    let b = src[name] ? { ...src[name] } : null;
    if (suppress.has(name)) {
      notes.push(`${key} [${name}] suppressed by override`);
      out.bands[name] = null;
      continue;
    }
    if (!b) { out.bands[name] = null; continue; }

    // G1: too few postings to be a finding
    if (b.n < MIN_N) {
      stats.thinDropped++;
      notes.push(`${key} [${name}] dropped, only ${b.n} postings`);
      out.bands[name] = null;
      continue;
    }

    // G2: never advertise below what actually hires here.
    // Raising the low but keeping the scraped high gives fake precision: machine
    // operator came out as S$2,500-2,550, a S$50 band, because the high was
    // computed over a population that included sub-market ads. Where that
    // happens we stop pretending to know the top and publish an open "from"
    // figure instead, and the role goes on the list for a real number.
    // Where JTE has given a gross, the basic is not the whole story and a lower
    // basic is normal, so we publish it as it stands rather than floor it.
    const floorExempt = !!(cfg.pay && cfg.pay['Gross']);
    if (b.low < FLOOR && !floorExempt) {
      stats.floorRaised++;
      b.low = FLOOR;
      b.floored = true;
      if (b.high < b.low * 1.15) {
        notes.push(`${key} [${name}] floored, high (${b.high}) too close to floor, published open-ended`);
        b.high = null;
        b.openEnded = true;
        b.needsJte = true;
        stats.needsJte++;
      } else {
        notes.push(`${key} [${name}] floor raised -> ${FLOOR}, high kept`);
      }
    }

    // G3: a later band must not start below an earlier one
    if (b.low < prevLow) {
      stats.backwards++;
      notes.push(`${key} [${name}] backwards (${b.low} < ${prevLow}), dropped`);
      out.bands[name] = null;
      continue;
    }
    prevLow = b.low;
    out.bands[name] = b;
  }

  // ---- 3. JTE's own figures win ----
  if (cfg.pay) {
    for (const [band, v] of Object.entries(cfg.pay)) {
      if (!bandNames.includes(band)) continue;
      out.bands[band] = {
        low: v.low, high: v.high ?? null, n: role.n,
        verified: true,
        openEnded: v.high == null,
        note: v.note || null,
        verifiedNote: cfg.verifiedNote || null,
      };
    }
    out.flags.push('jte-verified');
    stats.verified++;
  }

  out.published = bandNames.some((n) => out.bands[n]);
  return out;
}

const resolved = {
  updated: raw.updated,
  resolvedOn: new Date().toISOString().slice(0, 10),
  totalPostings: raw.totalPostings,
  floor: ov.floor,
  tracks: ov.tracks,
  sectors: raw.sectors.map((s) => {
    const roles = s.roles.map((r) => resolveRole(s.slug, r)).filter((r) => r.published);
    return { slug: s.slug, name: s.name, n: s.n, roles };
  }),
};

writeFileSync(join(ROOT, 'salary-resolved.json'), JSON.stringify(resolved, null, 2) + '\n');

const before = raw.sectors.reduce((a, s) => a + s.roles.length, 0);
const after = resolved.sectors.reduce((a, s) => a + s.roles.length, 0);
console.log(`resolve-salary: ${before} roles in -> ${after} published`);
console.log(`  floor raised to S$${FLOOR}: ${stats.floorRaised} band(s)`);
console.log(`  backwards bands dropped:   ${stats.backwards}`);
console.log(`  thin bands dropped (<${MIN_N}):  ${stats.thinDropped}`);
console.log(`  operative ladders collapsed: ${stats.collapsed}`);
console.log(`  JTE-verified figures applied: ${stats.verified}`);
console.log(`  published open-ended, need a real top end: ${stats.needsJte}`);
if (process.argv.includes('--verbose')) notes.forEach((n) => console.log('    ' + n));
