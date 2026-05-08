/**
 * Injects window.__JTE_PORTAL__ into jobs.html for CRM apply (see jobs.html handleSubmit).
 * Run in CI with PORTAL_INGEST_SECRET set — never commit the modified file to main.
 *
 * Usage: PORTAL_INGEST_SECRET=... [CRM_PORTAL_API_URL=...] node scripts/inject-portal-config.js
 */
const fs = require('fs');
const path = require('path');

const secret = process.env.PORTAL_INGEST_SECRET;
const crmUrl =
    process.env.CRM_PORTAL_API_URL || 'https://app.jte.com.sg/api/crm/portal-applications';

if (!secret) {
    console.error('ERROR: PORTAL_INGEST_SECRET environment variable not set');
    process.exit(1);
}

const jobsHtmlPath = path.join(__dirname, '..', 'jobs.html');
let content = fs.readFileSync(jobsHtmlPath, 'utf8');

const INJECT_MARKER = '<!-- __JTE_PORTAL_BUILD__ -->';
const existingInject =
    /\n?\s*<!-- __JTE_PORTAL_BUILD__ -->\s*<script>[\s\S]*?<\/script>\s*/i;
content = content.replace(existingInject, '\n');

const cfg = {
    portalIngestSecret: secret,
    crmPortalApiUrl: crmUrl
};
const configScript =
    '\n  ' +
    INJECT_MARKER +
    '\n  <script>window.__JTE_PORTAL__ = ' +
    JSON.stringify(cfg) +
    ';<\/script>\n';

const bodyOpen = /<body[^>]*>/;
if (!bodyOpen.test(content)) {
    console.error('ERROR: No opening <body> tag found in jobs.html');
    process.exit(1);
}

content = content.replace(bodyOpen, function (m) {
    return m + configScript;
});

fs.writeFileSync(jobsHtmlPath, content, 'utf8');
console.log('Portal config injected into jobs.html');
