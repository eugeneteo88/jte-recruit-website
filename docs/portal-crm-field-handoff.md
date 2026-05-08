# JTE job portal → CRM field handoff

Use this note to align the **public jobs site apply form** (`jobs.html`) with the **JTE CRM portal ingest API**.

Job listings still load from **Supabase** (`jobs` table). **Applications** are sent as **`multipart/form-data`** to your CRM endpoint (not `portal_applications` / storage upload from the browser).

**Runtime config (do not commit secrets):** set `window.__JTE_PORTAL__` before the page script runs, e.g.

```js
window.__JTE_PORTAL__ = {
  crmPortalApiUrl: 'https://app.jte.com.sg/api/crm/portal-applications',
  portalIngestSecret: '<from deploy / secret store>'
};
```

Static HTML has **no** `process.env`. In this repo, **CI** runs `node scripts/inject-portal-config.js` (see `npm run build` and `.github/workflows/deploy.yml`) before publishing to GitHub Pages — do not commit the injected `jobs.html` to `main`.

---

## 1. Where data goes

| Step | Target | Method |
|------|--------|--------|
| Job list | Supabase REST `jobs` | `GET` with anon key (unchanged) |
| Application + resume | CRM API | `POST` `multipart/form-data`, header **`X-Portal-Key`**: `portalIngestSecret` |

Default URL if `crmPortalApiUrl` is omitted: `https://app.jte.com.sg/api/crm/portal-applications`

---

## 2. FormData fields (exact part names)

| Part name | Notes |
|-----------|--------|
| `job_public_id` | Portal job id string (`currentJob.id`) |
| `full_name` | Trimmed |
| `email` | Lowercased |
| `phone_country_code` | Present when country `<select>` has a value (always today), e.g. `+65` |
| `phone` | **Local number only** when `phone_country_code` is sent; otherwise same field holds whatever was entered |
| `qualification` | Trimmed free text |
| `spoken_languages` | Comma + space joined list (same checkbox values as before) |
| `expected_salary` | String of integer, or empty string if blank |
| `rights_to_work` | `SG / PR` or `Work Pass` |
| `resume` | Single file (PDF / Word); third argument to `append` is original filename |
| `consent_pdpa` | String `'true'` |

---

## 3. Picklist values (must match CRM if CRM is strict)

### `rights_to_work`

| Value | UI label (approx.) |
|-------|---------------------|
| `SG / PR` | I have Permanent Work Rights. |
| `Work Pass` | Work Pass (EP, SP & WP) |

### `spoken_languages` (multi-select → one string)

Checkbox **values** (joined with `", "`):

`English`, `Mandarin`, `Malay`, `Tamil`, `Cantonese`, `Bahasa Indonesia`, `Filipino`, `Hindi`, `Japanese`, `Korean`, `Others`

Example: `English, Mandarin, Malay`

---

## 4. Checklist for the CRM agent

1. **Endpoint** — Accept `POST` multipart at the configured URL; validate **`X-Portal-Key`** server-side. Allow **CORS** from the portal origins (e.g. `jte.com.sg`, GitHub Pages domain if used).

2. **Job link** — Confirm **`job_public_id`** matches how jobs are keyed in CRM.

3. **Field names** — Match part names in §2 exactly (e.g. `spoken_languages`, `rights_to_work`, `expected_salary`).

4. **Types** — `expected_salary` arrives as a **string** (empty or digits). Parse as needed.

5. **Picklists** — Align with §3.

6. **Resume** — Single file part `resume`; handle size limits server-side (portal pre-checks **5MB**).

7. **Response** — Portal treats HTTP **2xx** as transport success; if JSON body includes **`ok: false`**, the UI shows a generic failure. Prefer **`ok: true`** (or omit `ok`) on success.

---

## 5. Reference in codebase

File: **`jobs.html`**  
- Submit handler: **`handleSubmit`** — search for `FormData`, `crmPortalApiUrl`, `__JTE_PORTAL__`.

---

*Handoff for JTE CRM integration owner.*
