# JTE Content Studio — MCP server

An MCP server that exposes the Field Notes **article toolbox** as tools, so Claude (Code /
Desktop / any MCP client) can compose on-brand articles interactively. Same generators the
site + Growth Engine use, so output always matches `content-ops/ARTICLE-DESIGN.md`.
Image generation is capped at **US$20/month** (per Eugene); over the cap a tool refuses
unless called with `override:true`.

## Tools
| Tool | What it does | Cost |
|------|--------------|------|
| `design_reference` | Returns the article design standard — read first | free |
| `spend_status` | Month image spend vs the $20 cap | free |
| `make_animation` | Animated SVG data-graphic (`bars`/`steps`/`trend`/`stat`) → returns SVG to embed | free |
| `make_graphic` | Cream In-brief checklist → `blog/<slug>/graphic-1.jpg` | free |
| `generate_hero` | Candid scene photo + JTE branded overlay → `hero.jpg` | ~$0.04 |
| `generate_photo` | Plain candid inline photo (1600×900) → `<name>.jpg` | ~$0.04 |
| `assemble_article` | Build the article HTML from a content JSON (supports `media[]` per section) | free |
| `upsert_post` | Add/update `blog/posts.json` (set `updated` for the Updated/Published byline) | free |
| `rebuild_site` | build-blog + QA scanner; must be FAIL: 0 before publishing | free |

## Register it

**Claude Code (CLI):**
```
claude mcp add jte-content-studio \
  --env GEMINI_API_KEY=YOUR_KEY \
  -- node C:/Users/eugen/Documents/jte-recruit-website/content-ops/studio-mcp/server.mjs
```

**Claude Desktop** — add to `claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "jte-content-studio": {
      "command": "node",
      "args": ["C:/Users/eugen/Documents/jte-recruit-website/content-ops/studio-mcp/server.mjs"],
      "env": { "GEMINI_API_KEY": "YOUR_KEY" }
    }
  }
}
```
Then restart the client. (`npm install` once inside this folder first.)

## Composing an article (the flow Claude follows)
1. `design_reference` → know the standard.
2. Draft the content (voice + no em-dashes + funnel link).
3. Decide 3–4 visuals; `make_animation` / `make_graphic` / `generate_hero` / `generate_photo`.
4. `assemble_article` with the content + `media[]` placements.
5. `upsert_post`, then `rebuild_site` (confirm FAIL: 0).
6. Review live; Eugene approves.

## Notes
- This is for **interactive** authoring. The headless cron engine (`run.mjs`) is separate and
  still writes simpler articles on its own — it does not call this server.
- `smoke test`: `node test.mjs` (spawns the server, lists tools, calls the free ones).
- `image-spend.json` (gitignored) is the programmatic monthly ledger; the human log stays in
  `content-ops/image-spend-log.md`.
