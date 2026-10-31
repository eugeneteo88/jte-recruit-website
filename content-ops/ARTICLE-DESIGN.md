# JTE Field Notes — article design reference

The living standard for every article (hand-written and Growth-Engine). Confirmed by
Eugene 2026-10-31. Come back here; improve it when a better idea fits a specific article.
The north star: **the article must be interesting, and each visual must help the reader
grasp the point fast.** Not text-only, not one image.

## Voice & copy
- Eugene's personal voice: first-person, friendly, casual, plain English, honest, a bit of
  personality. No corporate/big English. No Singlish slang (lah/lor/kiasu/sian/blur/tahan).
- **No em dashes / long dashes (—).** They read as AI. Use commas, full stops, or restructure.
  Enforced in `build-article.mjs` (deepDeDash), `graphic.mjs`, and the engine writer prompt.
- Open on the employer's PROBLEM, never a definition. No nationality framing (TAFEP).
- Only use a hard figure/date if it's verified; otherwise go qualitative + "confirm with MOM".
- Every payroll-cluster article funnels to `/free-payroll-singapore/` (anchor must appear verbatim).

## Visual mix — 3 to 4 visuals per article, composed for what it needs
Free-form `media:[]` per section in `build-article.mjs` (`{type:'image'|'graphic'|'animation'}`,
`autoGraphic:false` to drop the default). Typical shape: hero + In-brief graphic + 1–2 added
visuals (an animated chart/flow/stat, plus the occasional photo). Match count to article length.

### The toolbox
- **Hero photo** — `gemini-image.mjs` candid scene → `hero-graphic.mjs` makeHero (branded
  overlay: gradient + gold eyebrow + serif headline/italic accent + JTE RECRUIT watermark).
- **In-brief checklist** — `graphic.mjs` makeGraphic `type:'list'` → cream, full-width, gold
  checks, dividers, dynamic height. (Dark version retired.)
- **Animated data-graphics** — `anim-svg.mjs`: `animBars` (growing bars), `animSteps`
  (VERTICAL numbered timeline — reads on mobile), `animTrend` (self-drawing line + break
  marker), `animStat` (big number). Self-contained SMIL SVG: no JS/CSS, CSP-safe, free,
  with a correct static fallback.
- **Inline photo** — plain candid scene (no overlay), cropped 1600×900, for emotional beats.

## Image style
- Candid, documentary, evocative, warm, authentic Singapore. NOT glossy/professional stock,
  NOT overpowering. **No artificial background blur** (Eugene's #1 AI tell) — sharp focus.
- **Scene photos are the default.** Eugene's own face is NOT the default (reads weird when
  overused); use rarely, and only if *very* candid — see [[jte-article-image-and-copy-style]].

## Cost
- Image generation cap **US$20/month**; over = case-by-case, ask first. Log every run in
  `image-spend-log.md`. Graphics + animations are free; only Gemini photos cost (~$0.04 each).
- Re-compositing an overlay / regenerating an SVG graphic on existing photos = $0.

## Updating a published article (newspaper style)
When info changes (regulation change, new figures, better angle), **update the existing
article — never publish a duplicate.** Edit the content in place, then set `"updated":
"YYYY-MM-DD"` on that post in `blog/posts.json` and rebuild. The byline then shows two rows,
**Updated &lt;date&gt;** (gold) on top and **Published &lt;date&gt;** below, and the JSON-LD
`dateModified` bumps to the updated date (tells Google it's fresh). The original `date`
(published) never changes. Only stamp `updated` for real content/info changes, not cosmetic
tweaks. Mechanism lives in `scripts/build-blog.mjs` (idempotent across rebuilds).

## Mobile first
Render checks at phone width. Wide SVGs must keep text large enough to read when scaled down;
prefer vertical layouts for sequences (see animSteps).
