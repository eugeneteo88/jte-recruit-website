# Image generation — spend log

**Policy (set by Eugene, 2026-10-31):** monthly cap of **US$20** on AI image generation
(the Gemini API bills in USD). If a month needs to exceed this, it's **case-by-case** —
flag it and get the OK first, don't just run over.

**Model:** `gemini-2.5-flash-image` (~US$0.04 / image). Set `GEMINI_IMAGE_MODEL` to override.
**Rule of thumb:** re-compositing the branded overlay on an *already-generated* photo is **free**
(no API call) — only a fresh Gemini generation costs money.

Record every generation run below: date, what it was for, how many images, est. cost.

| Date | Cause / what for | Images | Est. cost (US$) |
|------|------------------|:------:|:---------------:|
| 2026-10-31 | Test image (validate key + billing) | 1 | 0.04 |
| 2026-10-31 | 12 payroll-cluster article heroes (first generation) | 12 | 0.48 |
| 2026-10-31 | Re-composite 12 heroes with clean subtitles (reused cached photos, no API) | 0 | 0.00 |

**October 2026 total: ~US$0.52** (cap US$20).
