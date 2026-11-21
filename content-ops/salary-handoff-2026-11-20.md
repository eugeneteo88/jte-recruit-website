# Handoff: salary benchmarks unblocked (Muse, 20 Nov 2026)

Both sources your last commit recorded as blocked are now read directly, and the
audit trail is updated. No guide figure has been changed. Nothing here publishes;
content-ops is excluded from the deploy.

## What was blocked, and what happened

1. **Community Care salary guidelines PDF (updated 8 April 2026).** It 403'd for
   your curl and fetch proxy. It opened fine for Muse's fetch, from the Agency for
   Integrated Care host:
   https://edge.sitecorecloud.io/agencyforinb6cc-agencyforin73f5-production08ac-d178/media/agency-for-integrated-care/Files/Partners/2026-Community-Care-Salary-Guidelines.pdf
   The full table, all 22 rows across 5 profession groups, is now in
   `salary-research.json` under `communityCare`, and the source is primary.
   Key facts for the guide: figures are monthly BASE salary (starting and
   mid-point), not gross. ATC is the sector median annual total compensation.
   Guidelines are recommendations, not mandatory; MOH asks CCOs below them to
   adjust by early 2027. Average housing allowance for foreign staff is ~$500/month.

2. **MOM Occupational Wages, Table 4 (June 2025).** stats.mom.gov.sg 403'd for
   you; it opened for Muse, and the Table 4 spreadsheet
   (`mrsd_2025Wages_table4.xlsx`, Occupational Wage 2025 Statistical Tables) was
   downloaded and read cell by cell. `mom_ows` is now primary.
   - Registered Nurse gross median **$5,210** (25th $4,261, 75th $6,843; basic
     median $4,943). Matched the second-hand figure exactly.
   - Pharmacist (patient care) gross median **$5,612** (25th $4,682, 75th $7,123;
     basic median $5,578). Matched exactly.
   - Physiotherapist gross median **$5,349** (25th $4,579, 75th $7,000; basic
     median $5,323). Matched exactly.
   - Healthcare Assistant gross median **$2,410** (25th $2,100, 75th $2,766;
     basic median $2,352). **CORRECTED from $2,432.** $2,432 appears in neither
     MOM table: all-industries says $2,410, health and social services says
     $2,476. The $2,432 was a second-hand misread.
   - Added: Enrolled/Assistant Nurse gross median **$3,439** (25th $2,825,
     75th $4,279; basic median $3,280).
   - Health and social services (Table 4.12) medians for reference: RN $5,219,
     pharmacist $5,800, physiotherapist $5,367, healthcare assistant $2,476,
     enrolled/assistant nurse $3,457.
   - Coverage per MOM's Coverage and Methodology note: full-time resident
     employees in private-sector establishments with at least 25 employees
     (5,230 establishments, about 391,300 employees, 98% response rate),
     supplemented with administrative records. Excludes apprentices/trainees,
     temporary, part-time and piece-rated workers, and anyone who worked only
     part of June 2025. Gross = basic + overtime, commissions and allowances,
     before employee CPF and tax; it excludes employer CPF, bonuses, stock
     options, lump sums and payments-in-kind.
   - The "also seen" figures ($5,276 / $5,466 / $4,814) do not appear in the
     June 2025 table. They are most likely the prior year; the notes say so
     where it matters.

## Rebased onto the 21 Nov data refresh (Muse, 21 Nov 2026)

The repo moved while this wrap-up was waiting: two automated refresh commits
landed (4b74c0a SEO dashboard data, d63bac1 MyCareersFuture salary data).
Neither touched these files, but the refresh changed three guide figures the
wrap-up quoted, so the wrap-up was rebuilt on the new head (d63bac1) before
pushing:
- Clinic Staff basic is now $2,500 - $2,900 and no longer floored (was $2,500 -
  $3,000, floored).
- Patient Service basic is now $2,500 - $2,750 and no longer floored or
  open-ended (was from-$2,500, floored, open-ended).
- Nurse bands moved slightly (0-3 yrs $3,250 - $4,250; 3-8 yrs $3,850 - $4,750;
  8+ yrs $6,250 - $7,500) on 716 postings.
The review doc was regenerated from the refreshed data, and the "Read this
first" text and the `communityCare` analysis were corrected to match. The
healthcare floor question is unchanged.

## Files changed in this wrap-up

- `salary-research.json` — both sources primary; `communityCare` table added;
  benchmarks corrected and given p25/p75/basic medians; Enrolled/Assistant Nurse
  added; open questions reduced to commercial admin and the healthcare floor.
- `scripts/salary-review.mjs` — "Read this first" rewritten to reflect that both
  sources are now read, with what the guidelines mean for the $2,500 floor.
- `content-ops/salary-review.md` — regenerated with the script. Counts unchanged:
  10 JTE, 82 ad-data, 8 floored, 66 blank.

## What is yours to do next

1. Read the regenerated `content-ops/salary-review.md` "Read this first". The
   evidence is in; the healthcare floor decision is still Eugene's: the
   guidelines' Band 3 starts at $2,480 base, $20 below the $2,500 floor, and the
   guide's Care / Support Staff range ($2,500–$2,900 basic, floored) sits inside
   Band 3 ($2,480–$3,300).
2. If Eugene sets the floor, put it in `salary-overrides.json` as a JTE figure
   the usual way and re-run the review script.
3. Run `qa-check` before pushing, the same as the last salary commit.
4. `content-ops/salary-gaps.md` is untouched. Care / Support Staff Gross and
   Clinic Staff Gross are still blank on the guide; the guidelines give base
   figures, not gross, so they do not fill those blanks directly.
