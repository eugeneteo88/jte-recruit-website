# JTE Growth Engine — operations manual

The autonomous inbound-marketing + demand-generation operation for jte.com.sg.
It runs on a schedule, produces publish-ready work, and stops at the CEO (Eugene)
approval gate. Nothing goes live without a human nod.

**North star:** not impressions — **qualified employer inquiries → clients → recruiters → revenue.**
Impressions/rankings are leading indicators; the scoreboard is inquiries.

---

## The org (AI "hires")

Each role is a prompt + a model + defined inputs/outputs. Phase the *rollout*;
the *design* includes all of them.

| # | Role | Does | Model tier |
|---|------|------|-----------|
| 1 | **Analyst** | Pulls GSC + GA4 (reuses `../seo-data.mjs` pipeline), summarises what moved week-on-week | mini |
| 2 | **Trend & competitor watcher** | Web-searches SG recruitment/policy news + competitor moves → timely, verified hooks | flagship (needs web search) |
| 3 | **Content planner** | Maintains a rolling topic backlog sized to the market; picks the run's topics; enforces cluster fit + no duplication. *This is what guarantees we never run out.* | flagship |
| 4 | **Writer(s)** | Drafts each chosen article as a **held draft** (HTML from the template), problem-led, in Eugene's voice | flagship |
| 5 | **Fact-checker & fairness** | Verifies every figure against a primary source; kills Singlish, bias, the nationality landmine, broken logic | flagship (needs web search) |
| 6 | **Editor / QA** | Runs `scripts/qa-check.mjs`, validates JSON-LD, polishes | mini |
| 7 | **LinkedIn repurposer** | Turns each approved article into company-page + profile posts, UTM-tagged | mini |
| 8 | **Conversion** | Ensures a clear CTA per article + maintains the lead magnet funnel so reads become inquiries | mini |
| 9 | **Chief of staff** | Assembles the one-page **CEO brief** → `content-ops/brief.json` (rendered on `/seo`) | mini |

**CEO (Eugene):** opens the "This week" brief on `/seo`, approves. That's the whole job.

---

## The pipeline (one run)

```
Analyst ─┐
          ├─► Content planner ─► Writer(s) ─► Fact-checker ─► Editor/QA ─► Chief of staff ─► CEO brief
Watcher ─┘                                                         │
                                                                   └─► LinkedIn + Conversion drafts
```
Output of a run: held draft article(s) + LinkedIn post drafts + updated `brief.json`.
**All drafts stay `draft:true` until the CEO approves** — then they un-hold and
publish on their scheduled dates (the existing `build-blog` + `schedule.yml` flow).

---

## Cadence
- **Monday** — strategy + writing (full run, 1–2 new drafts).
- **Thursday** — trend check + quick updates (lighter run; may refresh/retune rather than write new).
- Volume ramps **2 → 3 → 4 / week** only once quality + indexing hold. More roles ≠ more volume; quality compounds, floods hurt.

## Guardrails (non-negotiable)
1. **Facts** stated as fact must trace to a primary source (gov/MOM/SNB/official). No fabricated figures. Hedge with "confirm current figures with …".
2. **No Singlish** (incl. blur/tahan), **no nationality framing** (TAFEP/Fair Consideration landmine).
3. **QA gate:** `qa-check.mjs` must pass; every JSON-LD block must parse; exactly one FAQPage per article.
4. **Approval gate:** nothing publishes without the CEO.
5. **Spend cap:** the `OPENAI_API_KEY` carries a hard monthly budget. The run also self-limits tokens.

## How it runs (engine room)
- `content-ops/run.mjs` — the orchestrator. Reuses the Google service account for GSC/GA, runs the roles via OpenAI, writes held drafts + `brief.json`. No-ops safely if `OPENAI_API_KEY` is unset.
- `.github/workflows/content-ops.yml` — Mon/Thu cron; runs headless; commits drafts + brief.
- Provider-agnostic by design: swap `content-ops/llm.mjs` to change model/provider.

## Status
- [x] Blueprint + scaffold
- [ ] `OPENAI_API_KEY` secret + $30/mo cap (CEO to provide) → turns the engine on
- [ ] First supervised run + tune
- [ ] Phase in: planner → LinkedIn → conversion/lead-magnet → volume ramp
