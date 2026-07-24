#!/usr/bin/env node
/*
 * JTE Salary Guide — data engine.
 * Pulls live salary data from MyCareersFuture (public gov.sg job API) and
 * aggregates by JTE's 6 sectors -> common role -> seniority band, as RANGES
 * (25th-75th percentile of advertised base monthly salary). Facts only,
 * attributed to MCF. Re-run on a schedule to keep it current.
 *   node salary-data.mjs   ->  writes salary-data.json
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const API = 'https://api.mycareersfuture.gov.sg/v2/search';
const PAGES_PER_SECTOR = 30;   // up to 3,000 postings/sector
const LIMIT = 100;
const MIN_N = 6;               // min postings to publish a cell

function fetchPage(page, categories) {
  const body = JSON.stringify({ search: '', sessionId: '', categories });
  for (let a = 0; a < 3; a++) {
    try {
      const out = execFileSync('curl', ['-s', '--max-time', '30', '-X', 'POST',
        `${API}?limit=${LIMIT}&page=${page}`, '-H', 'Content-Type: application/json',
        '-H', 'User-Agent: Mozilla/5.0', '-d', body], { maxBuffer: 80 * 1024 * 1024 });
      return JSON.parse(out.toString());
    } catch { /* retry */ }
  }
  return { results: [] };
}

const SECTORS = [
  { slug: 'engineering', name: 'Engineering', cats: ['Engineering', 'Building and Construction', 'Repair and Maintenance', 'Architecture / Interior Design'] },
  { slug: 'logistics', name: 'Logistics & Supply Chain', cats: ['Logistics / Supply Chain', 'Purchasing / Merchandising', 'Wholesale Trade'] },
  { slug: 'manufacturing', name: 'Manufacturing', cats: ['Manufacturing', 'Precision Engineering'] },
  { slug: 'healthcare', name: 'Healthcare', cats: ['Healthcare / Pharmaceutical', 'Medical / Therapy Services'] },
  { slug: 'commercial', name: 'Commercial & Support', cats: ['Admin / Secretarial', 'Accounting / Auditing / Taxation', 'Sales / Retail', 'Marketing / Public Relations', 'Banking and Finance', 'Human Resources', 'Customer Service', 'General Management', 'Legal'] },
  { slug: 'it', name: 'IT & Tech', cats: ['Information Technology', 'Telecommunications'] },
];

// 3 seniority bands
const BANDS = ['Junior', 'Mid', 'Senior / Lead'];
const bandOf = (levels) => {
  if (levels.some(l => ['Manager', 'Middle Management', 'Senior Management'].includes(l))) return 'Senior / Lead';
  if (levels.some(l => ['Executive', 'Senior Executive', 'Professional'].includes(l))) return 'Mid';
  if (levels.some(l => ['Fresh/entry level', 'Non-executive', 'Junior Executive'].includes(l))) return 'Junior';
  return null;
};

// common roles per sector: [keyword, canonical label]. First match wins.
const ROLES = {
  engineering: [['mechanical', 'Mechanical Engineer'], ['electrical', 'Electrical Engineer'], ['civil', 'Civil / Structural Engineer'], ['structural', 'Civil / Structural Engineer'], ['project engineer', 'Project Engineer'], ['project manager', 'Project Manager'], ['site engineer', 'Site Engineer'], ['qa/qc', 'QA / QC Engineer'], ['maintenance', 'Maintenance Engineer'], ['process engineer', 'Process Engineer'], ['design engineer', 'Design Engineer'], ['draughts', 'Draughtsperson'], ['technician', 'Engineering Technician'], ['engineer', 'Engineer (general)']],
  logistics: [['warehouse', 'Warehouse / Store'], ['supply chain', 'Supply Chain Executive'], ['procurement', 'Procurement / Purchasing'], ['purchasing', 'Procurement / Purchasing'], ['logistics coordinator', 'Logistics Coordinator'], ['logistics executive', 'Logistics Executive'], ['operations', 'Operations Executive'], ['shipping', 'Shipping / Freight'], ['freight', 'Shipping / Freight'], ['driver', 'Driver'], ['forklift', 'Forklift Operator'], ['planner', 'Planner'], ['logistics', 'Logistics (general)']],
  manufacturing: [['production', 'Production'], ['quality', 'Quality (QA / QC)'], ['assembly', 'Assembly / Line'], ['operator', 'Machine Operator'], ['technician', 'Technician'], ['process', 'Process'], ['supervisor', 'Production Supervisor'], ['planner', 'Production Planner'], ['engineer', 'Manufacturing Engineer']],
  healthcare: [['nurse', 'Nurse'], ['pharmac', 'Pharmacy'], ['physiotherap', 'Physiotherapist'], ['therapist', 'Therapist'], ['radiograph', 'Radiographer'], ['clinic', 'Clinic Staff'], ['patient service', 'Patient Service'], ['care', 'Care / Support Staff'], ['lab', 'Laboratory'], ['medical', 'Medical / Allied Health']],
  commercial: [['account', 'Accountant / Accounts'], ['audit', 'Audit / Tax'], ['tax', 'Audit / Tax'], ['human resource', 'HR'], ['recruit', 'Recruitment / TA'], ['sales', 'Sales Executive'], ['business development', 'Business Development'], ['marketing', 'Marketing'], ['admin', 'Admin / Secretarial'], ['secretar', 'Admin / Secretarial'], ['customer service', 'Customer Service'], ['finance', 'Finance'], ['legal', 'Legal'], ['analyst', 'Business Analyst']],
  it: [['it support', 'IT Support / Helpdesk'], ['help desk', 'IT Support / Helpdesk'], ['helpdesk', 'IT Support / Helpdesk'], ['software engineer', 'Software Engineer'], ['full stack', 'Software Engineer'], ['full-stack', 'Software Engineer'], ['developer', 'Software Developer'], ['data engineer', 'Data Engineer'], ['data scientist', 'Data Scientist'], ['data analyst', 'Data Analyst'], ['devops', 'DevOps / Cloud Engineer'], ['cloud', 'DevOps / Cloud Engineer'], ['cyber', 'Cybersecurity'], ['security', 'Cybersecurity'], ['system engineer', 'Systems Engineer'], ['systems engineer', 'Systems Engineer'], ['network', 'Network / Infrastructure'], ['infrastructure', 'Network / Infrastructure'], ['application', 'Application Engineer'], ['business analyst', 'IT Business Analyst'], ['project manager', 'IT Project Manager'], ['qa', 'QA / Test Engineer'], ['test engineer', 'QA / Test Engineer'], ['ui/ux', 'UI / UX Designer'], ['ux design', 'UI / UX Designer']],
};
const roleOf = (slug, title) => { const t = title.toLowerCase(); for (const [k, l] of (ROLES[slug] || [])) if (t.includes(k)) return l; return null; };

const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p / 100 * s.length))]; };
const r50 = n => Math.round(n / 50) * 50;
const cell = mids => mids.length >= MIN_N ? { low: r50(pct(mids, 25)), high: r50(pct(mids, 75)), n: mids.length } : null;

const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Singapore' }); // SGT YYYY-MM-DD
const out = { updated: today, source: 'MyCareersFuture (mycareersfuture.gov.sg)', totalPostings: 0, sectors: [] };

for (const sec of SECTORS) {
  const jobs = [];
  for (let p = 0; p < PAGES_PER_SECTOR; p++) {
    const j = fetchPage(p, sec.cats);
    const rows = j.results || [];
    if (!rows.length) break;
    for (const r of rows) {
      const s = r.salary || {}, m = r.metadata || {};
      if (m.isHideSalary || !s.minimum || !s.maximum) continue;
      if ((s.type?.salaryType || 'Monthly') !== 'Monthly') continue;
      const mid = (s.minimum + s.maximum) / 2;
      if (mid < 1200 || mid > 60000) continue;
      const role = roleOf(sec.slug, r.title || ''), band = bandOf((r.positionLevels || []).map(l => l.position));
      if (role && band) jobs.push({ role, band, mid });
    }
    if (rows.length < LIMIT) break;
  }
  // group by role -> band -> range
  const byRole = {};
  for (const j of jobs) { (byRole[j.role] ||= {}); (byRole[j.role][j.band] ||= []).push(j.mid); }
  const roles = Object.entries(byRole).map(([name, bands]) => {
    const cells = {}; let total = 0;
    for (const b of BANDS) { const c = cell(bands[b] || []); if (c) { cells[b] = c; total += c.n; } }
    return { name, bands: cells, n: total };
  }).filter(r => r.n >= MIN_N).sort((a, b) => b.n - a.n);
  out.totalPostings += jobs.length;
  out.sectors.push({ slug: sec.slug, name: sec.name, n: jobs.length, roles });
  console.log(`${sec.name.padEnd(24)} n=${String(jobs.length).padStart(4)}  ${roles.length} roles`);
}

// Safety guard: if the fetch came back thin (API blocked / down), abort WITHOUT
// overwriting the good file — the last committed data keeps serving.
if (out.totalPostings < 1000 || out.sectors.some(s => s.roles.length === 0)) {
  console.error(`ABORT: only ${out.totalPostings} postings / a sector came back empty — keeping existing salary-data.json`);
  process.exit(1);
}

writeFileSync(new URL('./salary-data.json', import.meta.url), JSON.stringify(out, null, 2));
console.log(`\nwrote salary-data.json · ${out.totalPostings} postings · ${today}`);
