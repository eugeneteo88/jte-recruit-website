/*
 * Auto-update the "Nk+ Placements" stat on the homepage + employers page from
 * the CRM (Supabase). Reads a COUNT only — never any row data — so nothing
 * sensitive is printed (the count is public anyway; it goes on the site).
 *
 *   SUPABASE_KEY=... node scripts/update-placements.mjs      (dry run: print only)
 *   SUPABASE_KEY=... APPLY=true node scripts/update-placements.mjs   (write files)
 */
import { readFileSync, writeFileSync } from 'node:fs';

const SUPA_URL = 'https://yxhzczjhwvdaqmoqyeyn.supabase.co';
const KEY = process.env.SUPABASE_KEY;
const APPLY = process.env.APPLY === 'true';

if (!KEY) { console.error('ERROR: SUPABASE_KEY secret is not set (check the secret name in the repo).'); process.exit(1); }

// The placement ledger lives in the Sales Report archive. Try the likely table names.
const TABLES = ['sales_report_archive', 'sales_reports_archive', 'sales_report', 'sales_reports', 'sales-report-archive'];

async function countRows(table) {
  // HEAD + Prefer:count=exact returns the total in the content-range header, with NO body.
  const url = `${SUPA_URL}/rest/v1/${encodeURIComponent(table)}?select=*`;
  let r;
  try { r = await fetch(url, { method: 'HEAD', headers: { apikey: KEY, Authorization: 'Bearer ' + KEY, Prefer: 'count=exact' } }); }
  catch (e) { return { ok: false, err: e.message }; }
  const cr = r.headers.get('content-range'); // e.g. "*/12453"
  if (!(r.status === 200 || r.status === 206)) return { ok: false, status: r.status };
  const total = cr && cr.includes('/') ? parseInt(cr.split('/').pop(), 10) : NaN;
  return { ok: Number.isFinite(total), total, status: r.status };
}

const FORCE = process.env.TABLE; // set TABLE=exact_name to lock it once known

async function listTables() {
  const r = await fetch(`${SUPA_URL}/rest/v1/`, { headers: { apikey: KEY, Authorization: 'Bearer ' + KEY } });
  if (!r.ok) return [];
  const j = await r.json().catch(() => ({}));
  if (j.definitions) return Object.keys(j.definitions);
  if (j.paths) return Object.keys(j.paths).map(p => p.replace(/^\//, '')).filter(Boolean);
  return [];
}

let found = null;
const tryList = FORCE ? [FORCE] : TABLES;
for (const t of tryList) {
  const c = await countRows(t);
  if (c.ok) { console.log(`Found ledger table "${t}" -> ${c.total} rows`); found = { table: t, total: c.total }; break; }
  else console.log(`  "${t}": not usable (status ${c.status ?? c.err})`);
}

if (!found) {
  // Discovery: list only placement/sales-related tables the API exposes, with counts, so we can pick the exact name.
  console.log('--- discovering placement-related tables ---');
  const all = await listTables();
  const matches = all.filter(t => /placement|sale|report|archive|commission|deal|closed|hire|candidate|invoice|billing/i.test(t));
  if (!matches.length) console.log(`(no obvious matches; ${all.length} tables total exposed)`);
  for (const t of matches) {
    const c = await countRows(t);
    console.log(`  table "${t}": ${c.ok ? c.total + ' rows' : 'status ' + (c.status ?? c.err)}`);
  }
  console.error('ERROR: no locked table yet — pick the right one from the list above (rerun with TABLE=<name>).');
  process.exit(1);
}

// Round DOWN to the nearest 1,000 → clean marketing "Nk+".
const total = found.total;
const label = total >= 1000 ? `${Math.floor(total / 1000)}k+` : `${Math.floor(total / 100) * 100}+`;
console.log(`Placements = ${total.toLocaleString('en-US')} → display "${label}"`);

if (!APPLY) { console.log('DRY RUN — files not changed. Run with APPLY=true to update the site.'); process.exit(0); }

for (const f of ['index.html', 'employers/index.html']) {
  const before = readFileSync(f, 'utf8');
  const after = before.replace(/(<span id="stat-placements"[^>]*>)[^<]*(<\/span>)/, `$1${label}$2`);
  if (after !== before) { writeFileSync(f, after); console.log(`updated ${f} → ${label}`); }
  else console.log(`no change in ${f} (already ${label} or id missing)`);
}
