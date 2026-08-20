#!/usr/bin/env node
// JTE website QA sweep — static, no deps. Scans every .html page and writes a
// dated report to /qa-reports/ so we keep a history that "everything's clear".
//
//   node scripts/qa-check.mjs
//
// Checks: broken internal links, missing page essentials (title/description/
// canonical), images without alt, external links missing rel=noopener,
// leftover placeholder text, contact-detail consistency (phone/email),
// insecure http:// resources, and FAQ sections that lack an open/close control.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ---- canonical contact details (anything else gets flagged) -----------------
const ALLOWED_TEL = new Set(['+6567157450', '+6590115381']); // office · Eugene mobile (ads)
const ALLOWED_EMAIL_HOSTS = new Set(['jte.com.sg']);
// pages where sample/example contact values are legitimate (tools, demos)
const CONTACT_EXEMPT = [/[/\\]verify[/\\]/];

// ---- gather html files ------------------------------------------------------
function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    if (name === 'node_modules' || name === '.git' || name === 'qa-reports') continue;
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (name.endsWith('.html')) out.push(p);
  }
  return out;
}

const files = walk(ROOT).sort();
const findings = []; // {sev:'FAIL'|'WARN', check, file, detail}
const rel = (p) => path.relative(ROOT, p).replace(/\\/g, '/');
const add = (sev, check, file, detail) => findings.push({ sev, check, file: rel(file), detail });

// ---- resolve an internal href to a file on disk -----------------------------
function resolveLink(href, fromFile) {
  let h = href.split('#')[0].split('?')[0];
  if (!h) return true; // pure anchor / query
  let target;
  if (h.startsWith('/')) target = path.join(ROOT, h);
  else target = path.resolve(path.dirname(fromFile), h);
  const tries = [target];
  if (!path.extname(target)) {
    tries.push(path.join(target, 'index.html'));
    tries.push(target + '.html');
  }
  return tries.some((t) => { try { return fs.statSync(t).isFile() || fs.statSync(t).isDirectory(); } catch { return false; } });
}

// ---- per-file checks --------------------------------------------------------
for (const file of files) {
  const html = fs.readFileSync(file, 'utf8');
  const exempt = CONTACT_EXEMPT.some((re) => re.test(file));

  // page essentials
  if (!/<title>[^<]{3,}<\/title>/i.test(html)) add('WARN', 'missing-title', file, 'no <title> text');
  if (!/<meta[^>]+name=["']description["'][^>]+content=["'][^"']{20,}/i.test(html))
    add('WARN', 'missing-meta-description', file, 'no meta description (>=20 chars)');
  if (!/<link[^>]+rel=["']canonical["']/i.test(html))
    add('WARN', 'missing-canonical', file, 'no canonical link');

  // internal links
  for (const m of html.matchAll(/href=["']([^"']+)["']/gi)) {
    const href = m[1];
    if (/^(https?:|mailto:|tel:|javascript:|data:|#)/i.test(href)) continue;
    if (!resolveLink(href, file)) add('FAIL', 'broken-internal-link', file, href);
  }

  // images without alt
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    if (!/\balt=/i.test(m[0])) {
      const src = (m[0].match(/src=["']([^"']+)["']/i) || [, '(inline)'])[1];
      add('WARN', 'img-missing-alt', file, src);
    }
  }

  // external new-tab links missing rel=noopener (tab-nabbing)
  for (const m of html.matchAll(/<a\b[^>]*target=["']_blank["'][^>]*>/gi)) {
    if (!/rel=["'][^"']*noopener/i.test(m[0])) {
      const href = (m[0].match(/href=["']([^"']+)["']/i) || [, '?'])[1];
      add('WARN', 'blank-missing-noopener', file, href);
    }
  }

  // leftover placeholder / dev text
  for (const m of html.matchAll(/lorem ipsum|\bTODO\b|\bFIXME\b|\bXXX\b|placeholder text|your name here/gi))
    add('FAIL', 'placeholder-text', file, m[0]);

  // insecure resources
  for (const m of html.matchAll(/(?:src|href)=["']http:\/\/[^"']+["']/gi))
    add('WARN', 'insecure-http-resource', file, m[0].slice(0, 80));

  // contact consistency
  if (!exempt) {
    for (const m of html.matchAll(/tel:([+\d]+)/gi)) {
      const num = m[1].replace(/\s/g, '');
      if (!ALLOWED_TEL.has(num)) add('WARN', 'unexpected-phone', file, `tel:${num}`);
    }
    for (const m of html.matchAll(/mailto:([^"'?]+)/gi)) {
      const host = (m[1].split('@')[1] || '').toLowerCase();
      if (host && !ALLOWED_EMAIL_HOSTS.has(host)) add('WARN', 'unexpected-email', file, m[1]);
    }
  }

  // FAQ section without an open/close control
  if (/id=["']faq["']|frequently asked questions/i.test(html) && !/<details\b/i.test(html))
    add('WARN', 'faq-no-toggle', file, 'FAQ section has no <details> open/close control');
}

// ---- write dated report -----------------------------------------------------
const now = new Date();
const stamp = now.toISOString().slice(0, 10);
const time = now.toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
const fails = findings.filter((f) => f.sev === 'FAIL');
const warns = findings.filter((f) => f.sev === 'WARN');

const byCheck = {};
for (const f of findings) (byCheck[f.check] ||= []).push(f);

let md = `# JTE website QA report — ${stamp}\n\n`;
md += `Run: ${time} · Pages scanned: **${files.length}** · `;
md += `**${fails.length} FAIL**, **${warns.length} WARN**\n\n`;
md += fails.length === 0
  ? `> ✅ No blocking issues (FAIL) found.\n\n`
  : `> ⚠️ ${fails.length} blocking issue(s) — see FAIL section.\n\n`;

md += `## Summary by check\n\n| Check | Severity | Count |\n|---|---|---|\n`;
for (const [check, arr] of Object.entries(byCheck).sort((a, b) => b[1].length - a[1].length))
  md += `| ${check} | ${arr[0].sev} | ${arr.length} |\n`;
if (findings.length === 0) md += `| _all clear_ | — | 0 |\n`;

for (const sev of ['FAIL', 'WARN']) {
  const arr = findings.filter((f) => f.sev === sev);
  if (!arr.length) continue;
  md += `\n## ${sev} (${arr.length})\n\n`;
  const grouped = {};
  for (const f of arr) (grouped[f.check] ||= []).push(f);
  for (const [check, items] of Object.entries(grouped)) {
    md += `**${check}** (${items.length})\n\n`;
    for (const it of items) md += `- \`${it.file}\` — ${it.detail}\n`;
    md += `\n`;
  }
}

md += `\n---\n_Generated by \`scripts/qa-check.mjs\`. Contact allowlist: tel ${[...ALLOWED_TEL].join(', ')}; email @${[...ALLOWED_EMAIL_HOSTS].join(', @')}. Sample values on /verify/ are exempt._\n`;

const outDir = path.join(ROOT, 'qa-reports');
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, `qa-${stamp}.md`);
fs.writeFileSync(outFile, md);

console.log(`Pages: ${files.length}  FAIL: ${fails.length}  WARN: ${warns.length}`);
console.log(`Report: ${rel(outFile)}`);
for (const [check, arr] of Object.entries(byCheck).sort((a, b) => b[1].length - a[1].length))
  console.log(`  ${arr[0].sev.padEnd(4)} ${check.padEnd(26)} ${arr.length}`);
